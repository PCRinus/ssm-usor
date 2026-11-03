-- A library entry holds the evaluation's work-system texts (ADR 036). Exposure has no default
-- here: an entry without one leaves the evaluation's as it is.

alter table public.evaluation_profiles
  add column means_of_production text
    constraint evaluation_profiles_means_of_production_length check (char_length(btrim(means_of_production)) between 1 and 2000),
  add column work_environment text
    constraint evaluation_profiles_work_environment_length check (char_length(btrim(work_environment)) between 1 and 2000),
  add column exposure text
    constraint evaluation_profiles_exposure_length check (char_length(btrim(exposure)) between 1 and 120);

comment on column public.evaluation_profiles.exposure is
  'Copied into an evaluation whose exposure is still the default "8 h / schimb"; null leaves it (ADR 036).';

grant update (name, archived_at, means_of_production, work_environment, exposure)
  on table public.evaluation_profiles to authenticated;

create or replace view public.evaluation_profile_list
with (security_invoker = true)
as
select
  p.id,
  p.organization_id,
  p.name,
  p.archived_at,
  p.created_at,
  p.updated_at,
  coalesce(u.client_count, 0) as client_count,
  u.profile_id is not null as in_use,
  p.means_of_production,
  p.work_environment,
  p.exposure
from public.evaluation_profiles p
left join (
  select
    pf.profile_id,
    (count(distinct f.client_id) filter (where jp.archived_at is null))::integer as client_count
  from public.risk_factors f
  join public.evaluation_profile_factors pf on pf.id = f.source_profile_factor_id
  join public.risk_evaluations e on e.id = f.evaluation_id
  left join public.job_positions jp on jp.id = e.job_position_id
  group by pf.profile_id
) u on u.profile_id = p.id;

-- Applying fills only the evaluation's empty texts, so two entries applied in turn fill from the
-- first and a text the specialist wrote is never lost. The exposure is empty while it is still
-- the column's default.
--   RSK02  the profile is not one of the evaluation's organization
--   RSK03  the profile is archived
create or replace function public.apply_evaluation_profile(p_evaluation_id uuid, p_profile_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  target public.risk_evaluations;
  profile public.evaluation_profiles;
  next_order integer;
  source_factor public.evaluation_profile_factors;
  copied_id uuid;
  copied integer := 0;
begin
  select * into target from public.risk_evaluations where id = p_evaluation_id;
  if not found then
    return null;
  end if;
  -- The lock makes a concurrent delete wait for this transaction, so its in-use check sees the
  -- factors copied here instead of deleting the profile from under them.
  select * into profile from public.evaluation_profiles
  where id = p_profile_id and organization_id = target.organization_id
  for key share;
  if not found then
    raise exception 'Apply a profile of the organization.' using errcode = 'RSK02';
  end if;
  if profile.archived_at is not null then
    raise exception 'The profile is archived; restore it first.' using errcode = 'RSK03';
  end if;
  if (target.means_of_production is null and profile.means_of_production is not null)
    or (target.work_environment is null and profile.work_environment is not null)
    or (target.exposure = '8 h / schimb' and profile.exposure is not null) then
    update public.risk_evaluations
    set
      means_of_production = coalesce(means_of_production, profile.means_of_production),
      work_environment = coalesce(work_environment, profile.work_environment),
      exposure = case when exposure = '8 h / schimb' then coalesce(profile.exposure, exposure) else exposure end
    where id = p_evaluation_id;
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
  insert into public.evaluation_profiles (
    organization_id, name, means_of_production, work_environment, exposure, created_by
  )
  values (
    source.organization_id, btrim(p_name), source.means_of_production, source.work_environment,
    source.exposure, (select auth.uid())
  )
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
