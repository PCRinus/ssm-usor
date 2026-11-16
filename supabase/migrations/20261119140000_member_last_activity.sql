-- `last_sign_in_at` moves only on a sign-in; a renewal moves `auth.sessions.refreshed_at`, UTC
-- without a zone. Signing out deletes the session, leaving the last sign-in.
create function public.organization_member_activity()
returns table (user_id uuid, last_active_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    greatest(
      u.last_sign_in_at,
      (select max(s.refreshed_at) at time zone 'utc' from auth.sessions s where s.user_id = m.user_id)
    )
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = public.current_organization_id()
    and public.is_organization_owner();
$$;

revoke all on function public.organization_member_activity() from public, anon;
grant execute on function public.organization_member_activity() to authenticated, service_role;
