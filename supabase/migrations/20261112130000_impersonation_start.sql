-- Starting an impersonation from the admin area (ADR 038): the members across organizations and
-- the accounts impersonated, for the secret key to read, only a member of an organization as its
-- target, and one call that ends the admin's open impersonation and starts the next.
--   IMS02  the impersonated user is not a member of an organization

-- Impersonation is for members: a participant without a membership has nothing it would show.
-- After the row is written, so that a caller the policies refuse learns nothing about who is a
-- member. A definer, since the admin's own policies show him no other organization's members.
create function public.check_impersonation_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.user_id = new.target_user_id) then
    raise exception 'Only a member of an organization is impersonated.' using errcode = 'IMS02';
  end if;
  return null;
end;
$$;

revoke all on function public.check_impersonation_target() from public, anon, authenticated;

create trigger impersonations_target_is_member after insert or update of target_user_id on public.impersonations
  for each row execute function public.check_impersonation_target();

-- An invoker, so the admin's own token writes both rows under the policies and ADR 033's
-- attribution. One admin has one open impersonation (impersonations_active_admin_key), an expired
-- one included, so switching member ends it in the same transaction as the next one starts.
create function public.start_impersonation(p_target_user_id uuid, p_reason text)
returns public.impersonations
language plpgsql
set search_path = ''
as $$
declare
  v_row public.impersonations;
begin
  update public.impersonations set ended_at = now()
  where admin_user_id = auth.uid() and ended_at is null;
  insert into public.impersonations (admin_user_id, target_user_id, reason)
  values (auth.uid(), p_target_user_id, p_reason)
  returning * into v_row;
  return v_row;
end;
$$;

comment on function public.start_impersonation(uuid, text) is
  'Ends the calling platform admin''s open impersonation and starts one of p_target_user_id with p_reason (ADR 038), under the caller''s policies. IMS02 when the target is not a member of an organization.';

create function public.admin_list_members(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  organization_id uuid,
  organization_name text,
  role public.organization_role,
  subscription_plan public.subscription_plan,
  subscription_status public.subscription_status,
  last_sign_in_at timestamptz,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with term as (
    select lower(public.unaccent_immutable(nullif(btrim(p_search), ''))) as value
  )
  select m.user_id, u.email::text, p.full_name, o.id, o.name, m.role, s.plan, s.status,
    u.last_sign_in_at, count(*) over ()
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  left join public.subscriptions s on s.organization_id = m.organization_id
  cross join term
  where term.value is null
    or strpos(lower(coalesce(u.email, '')), term.value) > 0
    or strpos(lower(public.unaccent_immutable(coalesce(p.full_name, ''))), term.value) > 0
    or strpos(lower(public.unaccent_immutable(o.name)), term.value) > 0
  order by lower(o.name), o.id, lower(coalesce(p.full_name, u.email::text)), m.user_id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

comment on function public.admin_list_members(text, integer, integer) is
  'Every organization member across organizations for the admin area (ADR 038), by organization then name, with the account''s email and last sign-in, the organization''s subscription plan and status, and the total of the filtered list. p_search matches the email, the name or the organization''s name, ignoring case and diacritics; null or blank lists everyone.';

-- An impersonation outlives the target's membership, so the account is named without one.
create function public.admin_accounts(p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  full_name text,
  organization_id uuid,
  organization_name text,
  role public.organization_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, p.full_name, o.id, o.name, m.role
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  left join public.organization_members m on m.user_id = u.id
  left join public.organizations o on o.id = m.organization_id
  where u.id = any (p_user_ids);
$$;

comment on function public.admin_accounts(uuid[]) is
  'The accounts of p_user_ids for the admin area (ADR 038): email, name, and the organization and role while they are a member.';

revoke all on function public.start_impersonation(uuid, text) from public, anon;
revoke all on function public.admin_list_members(text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_accounts(uuid[]) from public, anon, authenticated;
grant execute on function public.start_impersonation(uuid, text) to authenticated;
grant execute on function public.admin_list_members(text, integer, integer) to service_role;
grant execute on function public.admin_accounts(uuid[]) to service_role;
