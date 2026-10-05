-- A risk factor copied from the library records the profile factor it came from (ADR 015,
-- amended 2026-10-05), contrary to what the evaluation profiles migration said. Provenance
-- only: the copy stays the client's, changes on either side never reach the other, and only
-- the functions below set the pointer.

alter table public.risk_factors
  add column source_profile_factor_id uuid,
  add constraint risk_factors_source_profile_factor_in_organization
    foreign key (source_profile_factor_id, organization_id)
    references public.evaluation_profile_factors (id, organization_id)
    on delete set null (source_profile_factor_id);

create index risk_factors_source_profile_factor_id_idx
  on public.risk_factors (source_profile_factor_id);

comment on column public.risk_factors.source_profile_factor_id is
  'The library factor this one was copied from or saved as; null once that is deleted (ADR 015).';

-- Deleting a profile clears the pointers of its copies, an archived client's among them, and
-- the foreign key's own update would otherwise be refused.
create function public.protect_risk_factors_of_archived_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.source_profile_factor_id is null
    and (to_jsonb(new) - 'source_profile_factor_id' - 'updated_at')
      = (to_jsonb(old) - 'source_profile_factor_id' - 'updated_at') then
    return new;
  end if;
  perform public.refuse_archived_client(coalesce(old.client_id, new.client_id));
  return coalesce(new, old);
end;
$$;

revoke all on function public.protect_risk_factors_of_archived_client() from public, anon;

drop trigger risk_factors_protect_archived_client on public.risk_factors;

create trigger risk_factors_protect_archived_client
  before insert or update or delete on public.risk_factors
  for each row execute function public.protect_risk_factors_of_archived_client();

create or replace function public.copy_risk_factors(p_evaluation_id uuid, p_from_evaluation_id uuid)
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
      sort_order, source_profile_factor_id, created_by
    )
    values (
      target.organization_id, target.client_id, p_evaluation_id, source_factor.component,
      source_factor.factor_group, source_factor.description, source_factor.gravity_class,
      source_factor.probability_class, source_factor.actions, source_factor.deadline,
      source_factor.responsible_person, source_factor.observations, next_order + copied,
      source_factor.source_profile_factor_id, (select auth.uid())
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

create or replace function public.apply_evaluation_profile(p_evaluation_id uuid, p_profile_id uuid)
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
      sort_order, source_profile_factor_id, created_by
    )
    values (
      target.organization_id, target.client_id, p_evaluation_id, source_factor.component,
      source_factor.factor_group, source_factor.description, source_factor.gravity_class,
      source_factor.probability_class, source_factor.actions, source_factor.deadline,
      source_factor.responsible_person, source_factor.observations, next_order + copied,
      source_factor.id, (select auth.uid())
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

-- Runs as its owner because members cannot write the pointer, so it makes the policies' check
-- of the organization itself. An archived client's factors cannot change and stay unlinked; a
-- factor copied from another profile keeps that origin.
create or replace function public.save_risk_evaluation_as_profile(p_evaluation_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.risk_evaluations;
  links_factors boolean;
  profile_id uuid;
  source_factor public.risk_factors;
  copied_id uuid;
  copied integer := 0;
begin
  select * into source from public.risk_evaluations
  where id = p_evaluation_id and organization_id = public.current_organization_id();
  if not found then
    return null;
  end if;
  select c.archived_at is null into links_factors from public.clients c where c.id = source.client_id;
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
    if links_factors and source_factor.source_profile_factor_id is null then
      update public.risk_factors set source_profile_factor_id = copied_id
      where id = source_factor.id;
    end if;
    copied := copied + 1;
  end loop;
  return profile_id;
end;
$$;
