-- The risk library's lifecycle (ADR 036): an entry is in use while any client's factor points at
-- one of its factors, archived posts and clients included. One in use cannot be deleted, only
-- archived; an archived one is not applied. Unlike an instruction module, archiving is allowed in
-- use: a client holds copies, so nothing it prints depends on the entry.

alter table public.evaluation_profiles add column archived_at timestamptz;

comment on column public.evaluation_profiles.archived_at is
  'When the entry left "Aplică din bibliotecă"; null while it is offered (ADR 036).';

grant update (name, archived_at) on table public.evaluation_profiles to authenticated;

-- Security definer so that the check sees every pointer whatever the caller's policies.
--   RSK04  the entry is in use
create function public.refuse_deleting_evaluation_profile_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.risk_factors f
    join public.evaluation_profile_factors pf on pf.id = f.source_profile_factor_id
    where pf.profile_id = old.id
  ) then
    raise exception 'The evaluation profile is in use by clients; archive it instead.'
      using errcode = 'RSK04';
  end if;
  return old;
end;
$$;

revoke all on function public.refuse_deleting_evaluation_profile_in_use() from public, anon, authenticated;

create trigger evaluation_profiles_refuse_delete_in_use before delete on public.evaluation_profiles
  for each row execute function public.refuse_deleting_evaluation_profile_in_use();

-- The library's list in one pass. `client_count` counts the clients "Unde este folosită" lists,
-- which leaves out archived posts; `in_use` counts every pointer, as the delete does. Security
-- invoker, so each table answers to the caller's own policies.
create view public.evaluation_profile_list
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
  u.profile_id is not null as in_use
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

comment on view public.evaluation_profile_list is
  'Evaluation profiles with the clients that use them and whether any factor points at them (ADR 036).';

revoke all on table public.evaluation_profile_list from anon, authenticated;
grant select on table public.evaluation_profile_list to authenticated;

-- Returns how many factors were added, or null when the evaluation is not the caller's to see.
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
  select * into profile from public.evaluation_profiles
  where id = p_profile_id and organization_id = target.organization_id;
  if not found then
    raise exception 'Apply a profile of the organization.' using errcode = 'RSK02';
  end if;
  if profile.archived_at is not null then
    raise exception 'The profile is archived; restore it first.' using errcode = 'RSK03';
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
