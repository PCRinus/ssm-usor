-- Owners change a member's role and remove members (the follow-up ADR 003 names).
--
-- Memberships still have no write policy: both actions go through the functions below,
-- which check the role themselves, like the invitation functions.
--
-- Nobody acts on their own membership. Since the caller is an owner, that alone guarantees
-- an organization never ends up without one, as long as two owners cannot act on each
-- other at the same moment; the row locks taken first rule that out.
--
-- Errors the API translates:
--   42501  the caller is not an owner
--   MEM01  the caller targeted their own membership

-- Locks the organization's memberships, then checks the caller. In that order, so that a
-- concurrent change to the caller's own role is seen before it is relied on.
create function public.lock_members_as_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
begin
  if organization is null then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  perform 1
  from public.organization_members m
  where m.organization_id = organization
  order by m.user_id
  for update;

  if not public.is_organization_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  return organization;
end;
$$;

-- True when a member of the caller's organization got the role.
create function public.change_organization_member_role(
  member_user_id uuid,
  new_role public.organization_role
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.lock_members_as_owner();
  changed uuid;
begin
  if member_user_id = public.effective_user_id() then
    raise exception 'own_membership' using errcode = 'MEM01';
  end if;

  update public.organization_members m
  set role = new_role
  where m.user_id = member_user_id
    and m.organization_id = organization
  returning m.user_id into changed;

  return changed is not null;
end;
$$;

-- True when a member of the caller's organization was removed. Only the membership goes:
-- the account, the profile, and everything the person created stay, and they can be
-- invited again.
create function public.remove_organization_member(member_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.lock_members_as_owner();
  removed uuid;
begin
  if member_user_id = public.effective_user_id() then
    raise exception 'own_membership' using errcode = 'MEM01';
  end if;

  delete from public.organization_members m
  where m.user_id = member_user_id
    and m.organization_id = organization
  returning m.user_id into removed;

  return removed is not null;
end;
$$;

revoke all on function public.lock_members_as_owner() from public, anon, authenticated;
revoke all on function public.change_organization_member_role(uuid, public.organization_role) from public, anon;
revoke all on function public.remove_organization_member(uuid) from public, anon;
grant execute on function public.change_organization_member_role(uuid, public.organization_role) to authenticated;
grant execute on function public.remove_organization_member(uuid) to authenticated;
