-- ADR 038: a stolen password is not enough to act as a platform admin. The admin claim counts
-- only on a session that passed its second factor, so an admin signed in with the password alone
-- can neither start nor end an impersonation, and an active one does not apply to that session.
-- Every policy and function that asks for an admin goes through this one, so they all follow.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      and (select auth.jwt() ->> 'aal') = 'aal2',
    false
  );
$$;

comment on function public.is_platform_admin() is
  'True when the JWT carries the trusted app_metadata.role = admin claim and the session passed its second factor (aal2, ADR 038).';
