-- Evaluation profiles (ADR 015): the organization's risk library, evaluated posts kept to be
-- copied into clients' risk evaluations. Tables of their own rather than evaluations without
-- a client: every key, trigger and policy on the evaluation tables is the client's.

create table public.evaluation_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null constraint evaluation_profiles_name_length check (char_length(btrim(name)) between 2 and 160),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_profiles_id_organization unique (id, organization_id)
);

create index evaluation_profiles_organization_id_idx on public.evaluation_profiles (organization_id);

create unique index evaluation_profiles_name_key
  on public.evaluation_profiles (organization_id, lower(btrim(name)));

comment on table public.evaluation_profiles is
  'The organization''s risk library: named evaluated posts copied into risk evaluations (ADR 015).';

create trigger evaluation_profiles_set_updated_at before update on public.evaluation_profiles
  for each row execute function public.set_updated_at();

create table public.evaluation_profile_factors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  profile_id uuid not null,
  component public.work_system_component not null,
  factor_group text not null constraint evaluation_profile_factors_group_length check (char_length(btrim(factor_group)) between 1 and 200),
  description text not null constraint evaluation_profile_factors_description_length check (char_length(btrim(description)) between 1 and 1000),
  gravity_class smallint not null constraint evaluation_profile_factors_gravity_class_range check (gravity_class between 1 and 7),
  probability_class smallint not null constraint evaluation_profile_factors_probability_class_range check (probability_class between 1 and 6),
  actions text constraint evaluation_profile_factors_actions_length check (char_length(btrim(actions)) between 1 and 2000),
  deadline text constraint evaluation_profile_factors_deadline_length check (char_length(btrim(deadline)) between 1 and 200),
  responsible_person text constraint evaluation_profile_factors_responsible_person_length check (char_length(btrim(responsible_person)) between 1 and 200),
  observations text constraint evaluation_profile_factors_observations_length check (char_length(btrim(observations)) between 1 and 1000),
  sort_order integer not null constraint evaluation_profile_factors_sort_order_range check (sort_order >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_profile_factors_profile_in_organization
    foreign key (profile_id, organization_id) references public.evaluation_profiles (id, organization_id) on delete cascade,
  constraint evaluation_profile_factors_id_organization unique (id, organization_id)
);

create index evaluation_profile_factors_profile_id_idx on public.evaluation_profile_factors (profile_id, sort_order);
create index evaluation_profile_factors_organization_id_idx on public.evaluation_profile_factors (organization_id);

comment on table public.evaluation_profile_factors is
  'The risk factors of an evaluation profile, with the columns of an evaluation''s factors (ADR 015).';

create trigger evaluation_profile_factors_set_updated_at before update on public.evaluation_profile_factors
  for each row execute function public.set_updated_at();

-- Never updated in place, like an evaluation's: saving a factor replaces its measures.
create table public.evaluation_profile_measures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  factor_id uuid not null,
  kind public.prevention_measure_kind not null,
  description text not null constraint evaluation_profile_measures_description_length check (char_length(btrim(description)) between 1 and 2000),
  sort_order integer not null constraint evaluation_profile_measures_sort_order_range check (sort_order >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint evaluation_profile_measures_factor_in_organization
    foreign key (factor_id, organization_id) references public.evaluation_profile_factors (id, organization_id) on delete cascade
);

create index evaluation_profile_measures_factor_id_idx on public.evaluation_profile_measures (factor_id, sort_order);
create index evaluation_profile_measures_organization_id_idx on public.evaluation_profile_measures (organization_id);

comment on table public.evaluation_profile_measures is
  'The prevention measures of an evaluation profile''s risk factor (ADR 015).';

-- The three functions run as the caller, so the policies and, when an evaluation is written,
-- the archived-client triggers decide; each is one transaction. Nothing links a copy to where
-- it came from: a profile applied and an evaluation saved as a profile change apart.

-- Without p_factor_id it adds a factor after the others. Returns null when the profile, or the
-- factor within it, is not the caller's to see.
create function public.save_evaluation_profile_factor(
  p_profile_id uuid,
  p_component public.work_system_component,
  p_factor_group text,
  p_description text,
  p_gravity_class smallint,
  p_probability_class smallint,
  p_measures jsonb,
  p_factor_id uuid default null,
  p_actions text default null,
  p_deadline text default null,
  p_responsible_person text default null,
  p_observations text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  profile public.evaluation_profiles;
  saved_id uuid;
begin
  select * into profile from public.evaluation_profiles where id = p_profile_id;
  if not found then
    return null;
  end if;
  if p_factor_id is null then
    insert into public.evaluation_profile_factors (
      organization_id, profile_id, component, factor_group, description, gravity_class,
      probability_class, actions, deadline, responsible_person, observations, sort_order,
      created_by
    )
    values (
      profile.organization_id, p_profile_id, p_component, p_factor_group, p_description,
      p_gravity_class, p_probability_class, p_actions, p_deadline, p_responsible_person,
      p_observations,
      (select coalesce(max(f.sort_order) + 1, 0) from public.evaluation_profile_factors f where f.profile_id = p_profile_id),
      (select auth.uid())
    )
    returning id into saved_id;
  else
    update public.evaluation_profile_factors set
      component = p_component,
      factor_group = p_factor_group,
      description = p_description,
      gravity_class = p_gravity_class,
      probability_class = p_probability_class,
      actions = p_actions,
      deadline = p_deadline,
      responsible_person = p_responsible_person,
      observations = p_observations
    where id = p_factor_id and profile_id = p_profile_id
    returning id into saved_id;
    if saved_id is null then
      return null;
    end if;
    delete from public.evaluation_profile_measures where factor_id = saved_id;
  end if;
  insert into public.evaluation_profile_measures (
    organization_id, factor_id, kind, description, sort_order, created_by
  )
  select
    profile.organization_id, saved_id,
    (m.value ->> 'kind')::public.prevention_measure_kind, m.value ->> 'description',
    m.ordinality - 1, (select auth.uid())
  from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) with ordinality as m (value, ordinality);
  return saved_id;
end;
$$;

-- Returns the new profile's id, or null when the evaluation is not the caller's to see. A
-- name the library already holds fails on the unique index (23505).
create function public.save_risk_evaluation_as_profile(p_evaluation_id uuid, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source public.risk_evaluations;
  profile_id uuid;
  source_factor public.risk_factors;
  copied_id uuid;
  copied integer := 0;
begin
  select * into source from public.risk_evaluations where id = p_evaluation_id;
  if not found then
    return null;
  end if;
  insert into public.evaluation_profiles (organization_id, name, created_by)
  values (source.organization_id, btrim(p_name), (select auth.uid()))
  returning id into profile_id;
  for source_factor in
    select * from public.risk_factors where evaluation_id = p_evaluation_id
    order by sort_order, created_at, id
  loop
    insert into public.evaluation_profile_factors (
      organization_id, profile_id, component, factor_group, description, gravity_class,
      probability_class, actions, deadline, responsible_person, observations, sort_order,
      created_by
    )
    values (
      source.organization_id, profile_id, source_factor.component, source_factor.factor_group,
      source_factor.description, source_factor.gravity_class, source_factor.probability_class,
      source_factor.actions, source_factor.deadline, source_factor.responsible_person,
      source_factor.observations, copied, (select auth.uid())
    )
    returning id into copied_id;
    insert into public.evaluation_profile_measures (
      organization_id, factor_id, kind, description, sort_order, created_by
    )
    select source.organization_id, copied_id, m.kind, m.description, m.sort_order,
      (select auth.uid())
    from public.prevention_measures m where m.factor_id = source_factor.id;
    copied := copied + 1;
  end loop;
  return profile_id;
end;
$$;

-- Returns how many factors were added, or null when the evaluation is not the caller's to see.
--   RSK02  the profile is not one of the evaluation's organization
create function public.apply_evaluation_profile(p_evaluation_id uuid, p_profile_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  target public.risk_evaluations;
  next_order integer;
  source_factor public.evaluation_profile_factors;
  copied_id uuid;
  copied integer := 0;
begin
  select * into target from public.risk_evaluations where id = p_evaluation_id;
  if not found then
    return null;
  end if;
  if not exists (
    select 1 from public.evaluation_profiles
    where id = p_profile_id and organization_id = target.organization_id
  ) then
    raise exception 'Apply a profile of the organization.' using errcode = 'RSK02';
  end if;
  select coalesce(max(sort_order) + 1, 0) into next_order
  from public.risk_factors where evaluation_id = p_evaluation_id;
  for source_factor in
    select * from public.evaluation_profile_factors where profile_id = p_profile_id
    order by sort_order, created_at, id
  loop
    insert into public.risk_factors (
      organization_id, client_id, evaluation_id, component, factor_group, description,
      gravity_class, probability_class, actions, deadline, responsible_person, observations,
      sort_order, created_by
    )
    values (
      target.organization_id, target.client_id, p_evaluation_id, source_factor.component,
      source_factor.factor_group, source_factor.description, source_factor.gravity_class,
      source_factor.probability_class, source_factor.actions, source_factor.deadline,
      source_factor.responsible_person, source_factor.observations, next_order + copied,
      (select auth.uid())
    )
    returning id into copied_id;
    insert into public.prevention_measures (
      organization_id, client_id, factor_id, kind, description, sort_order, created_by
    )
    select target.organization_id, target.client_id, copied_id, m.kind, m.description,
      m.sort_order, (select auth.uid())
    from public.evaluation_profile_measures m where m.factor_id = source_factor.id;
    copied := copied + 1;
  end loop;
  return copied;
end;
$$;

revoke all on function public.save_evaluation_profile_factor(uuid, public.work_system_component, text, text, smallint, smallint, jsonb, uuid, text, text, text, text) from public, anon;
revoke all on function public.save_risk_evaluation_as_profile(uuid, text) from public, anon;
revoke all on function public.apply_evaluation_profile(uuid, uuid) from public, anon;
grant execute on function public.save_evaluation_profile_factor(uuid, public.work_system_component, text, text, smallint, smallint, jsonb, uuid, text, text, text, text) to authenticated;
grant execute on function public.save_risk_evaluation_as_profile(uuid, text) to authenticated;
grant execute on function public.apply_evaluation_profile(uuid, uuid) to authenticated;

alter table public.evaluation_profiles enable row level security;
alter table public.evaluation_profile_factors enable row level security;
alter table public.evaluation_profile_measures enable row level security;
revoke all on table public.evaluation_profiles from anon;
revoke all on table public.evaluation_profile_factors from anon;
revoke all on table public.evaluation_profile_measures from anon;

create policy "members read their evaluation profiles"
  on public.evaluation_profiles for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create evaluation profiles"
  on public.evaluation_profiles for insert to authenticated
  with check (organization_id = public.current_organization_id());

create policy "members update their evaluation profiles"
  on public.evaluation_profiles for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their evaluation profiles"
  on public.evaluation_profiles for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.evaluation_profiles from authenticated;
grant update (name) on table public.evaluation_profiles to authenticated;

create policy "members read their evaluation profile factors"
  on public.evaluation_profile_factors for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create evaluation profile factors"
  on public.evaluation_profile_factors for insert to authenticated
  with check (organization_id = public.current_organization_id());

create policy "members update their evaluation profile factors"
  on public.evaluation_profile_factors for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their evaluation profile factors"
  on public.evaluation_profile_factors for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.evaluation_profile_factors from authenticated;
grant update (
  component, factor_group, description, gravity_class, probability_class, actions, deadline,
  responsible_person, observations, sort_order
) on table public.evaluation_profile_factors to authenticated;

create policy "members read their evaluation profile measures"
  on public.evaluation_profile_measures for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create evaluation profile measures"
  on public.evaluation_profile_measures for insert to authenticated
  with check (organization_id = public.current_organization_id());

create policy "members delete their evaluation profile measures"
  on public.evaluation_profile_measures for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.evaluation_profile_measures from authenticated;
