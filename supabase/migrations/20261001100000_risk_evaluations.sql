-- Risk evaluations (ADR 015). A factor's risk level and an evaluation's global level are never
-- stored: code reads them from the method's grid, so they cannot disagree with the classes.

create type public.risk_evaluation_kind as enum (
  'job_position',
  'sensitive_groups',
  'other'
);

create type public.work_system_component as enum (
  'executant',
  'work_task',
  'means_of_production',
  'work_environment'
);

-- The four kinds of annex 7 to H.G. 1425/2006, the columns of the prevention plan.
create type public.prevention_measure_kind as enum (
  'technical',
  'organizational',
  'hygienic_sanitary',
  'other'
);

create table public.risk_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  kind public.risk_evaluation_kind not null,
  job_position_id uuid,
  name text constraint risk_evaluations_name_length check (char_length(btrim(name)) between 2 and 160),
  means_of_production text constraint risk_evaluations_means_of_production_length check (char_length(btrim(means_of_production)) between 1 and 2000),
  work_environment text constraint risk_evaluations_work_environment_length check (char_length(btrim(work_environment)) between 1 and 2000),
  exposure text not null default '8 h / schimb' constraint risk_evaluations_exposure_length check (char_length(btrim(exposure)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The evaluation goes with a position deleted as a mistake; one anyone held is archived,
  -- not deleted, and keeps it.
  constraint risk_evaluations_position_in_client
    foreign key (job_position_id, client_id) references public.job_positions (id, client_id) on delete cascade,
  constraint risk_evaluations_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint risk_evaluations_id_client unique (id, client_id),
  constraint risk_evaluations_job_position_once unique (job_position_id),
  -- A post's evaluation is named by its position, the sensitive groups by the law; any other
  -- needs a name of its own.
  constraint risk_evaluations_subject check (
    (kind = 'job_position') = (job_position_id is not null)
    and (kind = 'other') = (name is not null)
  )
);

create index risk_evaluations_client_id_idx on public.risk_evaluations (client_id);
create index risk_evaluations_organization_id_idx on public.risk_evaluations (organization_id);

create unique index risk_evaluations_sensitive_groups_key
  on public.risk_evaluations (client_id)
  where kind = 'sensitive_groups';

create unique index risk_evaluations_name_key
  on public.risk_evaluations (client_id, lower(btrim(name)))
  where kind = 'other';

comment on table public.risk_evaluations is
  'One evaluated work system of a client: a job position, the sensitive groups, or another named one (ADR 015).';

create trigger risk_evaluations_set_updated_at before update on public.risk_evaluations
  for each row execute function public.set_updated_at();

create trigger risk_evaluations_protect_archived_client
  before insert or update or delete on public.risk_evaluations
  for each row execute function public.protect_rows_of_archived_client();

-- A position cannot exist under a lead, but a client-level evaluation could.
create trigger risk_evaluations_protect_lead before insert on public.risk_evaluations
  for each row execute function public.protect_rows_of_lead();

create table public.risk_factors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  evaluation_id uuid not null,
  component public.work_system_component not null,
  factor_group text not null constraint risk_factors_group_length check (char_length(btrim(factor_group)) between 1 and 200),
  description text not null constraint risk_factors_description_length check (char_length(btrim(description)) between 1 and 1000),
  gravity_class smallint not null constraint risk_factors_gravity_class_range check (gravity_class between 1 and 7),
  probability_class smallint not null constraint risk_factors_probability_class_range check (probability_class between 1 and 6),
  actions text constraint risk_factors_actions_length check (char_length(btrim(actions)) between 1 and 2000),
  deadline text constraint risk_factors_deadline_length check (char_length(btrim(deadline)) between 1 and 200),
  responsible_person text constraint risk_factors_responsible_person_length check (char_length(btrim(responsible_person)) between 1 and 200),
  observations text constraint risk_factors_observations_length check (char_length(btrim(observations)) between 1 and 1000),
  sort_order integer not null constraint risk_factors_sort_order_range check (sort_order >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_factors_evaluation_in_client
    foreign key (evaluation_id, client_id) references public.risk_evaluations (id, client_id) on delete cascade,
  constraint risk_factors_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint risk_factors_id_client unique (id, client_id)
);

create index risk_factors_evaluation_id_idx on public.risk_factors (evaluation_id, sort_order);
create index risk_factors_organization_id_idx on public.risk_factors (organization_id);

comment on table public.risk_factors is
  'The risk factors of a risk evaluation, with their classes and plan fields (ADR 015).';

create trigger risk_factors_set_updated_at before update on public.risk_factors
  for each row execute function public.set_updated_at();

create trigger risk_factors_protect_archived_client
  before insert or update or delete on public.risk_factors
  for each row execute function public.protect_rows_of_archived_client();

-- Never updated in place: saving a factor replaces its measures.
create table public.prevention_measures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  factor_id uuid not null,
  kind public.prevention_measure_kind not null,
  description text not null constraint prevention_measures_description_length check (char_length(btrim(description)) between 1 and 2000),
  sort_order integer not null constraint prevention_measures_sort_order_range check (sort_order >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint prevention_measures_factor_in_client
    foreign key (factor_id, client_id) references public.risk_factors (id, client_id) on delete cascade,
  constraint prevention_measures_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create index prevention_measures_factor_id_idx on public.prevention_measures (factor_id, sort_order);
create index prevention_measures_organization_id_idx on public.prevention_measures (organization_id);

comment on table public.prevention_measures is
  'What is done against a risk factor, of one of the four kinds of the prevention plan (ADR 015).';

create trigger prevention_measures_protect_archived_client
  before insert or update or delete on public.prevention_measures
  for each row execute function public.protect_rows_of_archived_client();

-- Saving a factor and its measures, reordering and copying run as the caller, so the
-- policies and the archived-client triggers decide; each is one transaction, so a factor is
-- never left with half its measures.

-- Without p_factor_id it adds a factor after the others. Returns null when the evaluation, or
-- the factor within it, is not the caller's to see.
create function public.save_risk_factor(
  p_evaluation_id uuid,
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
  evaluation public.risk_evaluations;
  saved_id uuid;
begin
  select * into evaluation from public.risk_evaluations where id = p_evaluation_id;
  if not found then
    return null;
  end if;
  if p_factor_id is null then
    insert into public.risk_factors (
      organization_id, client_id, evaluation_id, component, factor_group, description,
      gravity_class, probability_class, actions, deadline, responsible_person, observations,
      sort_order, created_by
    )
    values (
      evaluation.organization_id, evaluation.client_id, p_evaluation_id, p_component,
      p_factor_group, p_description, p_gravity_class, p_probability_class, p_actions,
      p_deadline, p_responsible_person, p_observations,
      (select coalesce(max(f.sort_order) + 1, 0) from public.risk_factors f where f.evaluation_id = p_evaluation_id),
      (select auth.uid())
    )
    returning id into saved_id;
  else
    update public.risk_factors set
      component = p_component,
      factor_group = p_factor_group,
      description = p_description,
      gravity_class = p_gravity_class,
      probability_class = p_probability_class,
      actions = p_actions,
      deadline = p_deadline,
      responsible_person = p_responsible_person,
      observations = p_observations
    where id = p_factor_id and evaluation_id = p_evaluation_id
    returning id into saved_id;
    if saved_id is null then
      return null;
    end if;
    delete from public.prevention_measures where factor_id = saved_id;
  end if;
  insert into public.prevention_measures (
    organization_id, client_id, factor_id, kind, description, sort_order, created_by
  )
  select
    evaluation.organization_id, evaluation.client_id, saved_id,
    (m.value ->> 'kind')::public.prevention_measure_kind, m.value ->> 'description',
    m.ordinality - 1, (select auth.uid())
  from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) with ordinality as m (value, ordinality);
  return saved_id;
end;
$$;

-- False when the ids are not exactly the evaluation's factors, each once.
create function public.reorder_risk_factors(p_evaluation_id uuid, p_factor_ids uuid[])
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_factor_ids is null
    or cardinality(p_factor_ids) <> (select count(distinct w.factor_id) from unnest(p_factor_ids) as w (factor_id))
    or (select count(*) from public.risk_factors f where f.evaluation_id = p_evaluation_id) <> cardinality(p_factor_ids)
    or exists (
      select 1 from unnest(p_factor_ids) as w (factor_id)
      where not exists (
        select 1 from public.risk_factors f
        where f.id = w.factor_id and f.evaluation_id = p_evaluation_id
      )
    )
  then
    return false;
  end if;
  update public.risk_factors f set sort_order = o.ordinality - 1
  from unnest(p_factor_ids) with ordinality as o (factor_id, ordinality)
  where f.id = o.factor_id and f.evaluation_id = p_evaluation_id and f.sort_order <> o.ordinality - 1;
  return true;
end;
$$;

-- Only within one client: a copy across clients goes through an evaluation profile. Returns
-- how many factors were copied, or null when the target is not the caller's to see.
--   RSK01  the source is the target itself, or not an evaluation of the same client
create function public.copy_risk_factors(p_evaluation_id uuid, p_from_evaluation_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  target public.risk_evaluations;
  next_order integer;
  source_factor public.risk_factors;
  copied_id uuid;
  copied integer := 0;
begin
  select * into target from public.risk_evaluations where id = p_evaluation_id;
  if not found then
    return null;
  end if;
  if p_from_evaluation_id = p_evaluation_id or not exists (
    select 1 from public.risk_evaluations
    where id = p_from_evaluation_id and client_id = target.client_id
  ) then
    raise exception 'Copy from another evaluation of the same client.' using errcode = 'RSK01';
  end if;
  select coalesce(max(sort_order) + 1, 0) into next_order
  from public.risk_factors where evaluation_id = p_evaluation_id;
  for source_factor in
    select * from public.risk_factors where evaluation_id = p_from_evaluation_id
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
    from public.prevention_measures m where m.factor_id = source_factor.id;
    copied := copied + 1;
  end loop;
  return copied;
end;
$$;

revoke all on function public.save_risk_factor(uuid, public.work_system_component, text, text, smallint, smallint, jsonb, uuid, text, text, text, text) from public, anon;
revoke all on function public.reorder_risk_factors(uuid, uuid[]) from public, anon;
revoke all on function public.copy_risk_factors(uuid, uuid) from public, anon;
grant execute on function public.save_risk_factor(uuid, public.work_system_component, text, text, smallint, smallint, jsonb, uuid, text, text, text, text) to authenticated;
grant execute on function public.reorder_risk_factors(uuid, uuid[]) to authenticated;
grant execute on function public.copy_risk_factors(uuid, uuid) to authenticated;

alter table public.risk_evaluations enable row level security;
alter table public.risk_factors enable row level security;
alter table public.prevention_measures enable row level security;
revoke all on table public.risk_evaluations from anon;
revoke all on table public.risk_factors from anon;
revoke all on table public.prevention_measures from anon;

create policy "members read their risk evaluations"
  on public.risk_evaluations for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create risk evaluations for their active clients"
  on public.risk_evaluations for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their risk evaluations"
  on public.risk_evaluations for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their risk evaluations"
  on public.risk_evaluations for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.risk_evaluations from authenticated;
grant update (name, means_of_production, work_environment, exposure)
  on table public.risk_evaluations to authenticated;

create policy "members read their risk factors"
  on public.risk_factors for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create risk factors for their active clients"
  on public.risk_factors for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their risk factors"
  on public.risk_factors for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their risk factors"
  on public.risk_factors for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.risk_factors from authenticated;
grant update (
  component, factor_group, description, gravity_class, probability_class, actions, deadline,
  responsible_person, observations, sort_order
) on table public.risk_factors to authenticated;

create policy "members read their prevention measures"
  on public.prevention_measures for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create prevention measures for their active clients"
  on public.prevention_measures for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members delete their prevention measures"
  on public.prevention_measures for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.prevention_measures from authenticated;
