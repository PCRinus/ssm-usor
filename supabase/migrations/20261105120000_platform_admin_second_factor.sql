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

-- The API's secret-key writes name the account in x-audit-actor (ADR 033). That account's active
-- impersonation is named on them only when the API also says the session passed its second
-- factor, the only session in which the API, through effective_user_id(), acted as the member.
create or replace function audit.current_actor(out actor_id uuid, out impersonating_user_id uuid, out source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := current_setting('role', true);
  v_headers jsonb;
begin
  if v_role = 'service_role' then
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    if v_headers ->> 'x-audit-actor' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      actor_id := (v_headers ->> 'x-audit-actor')::uuid;
      source := 'api';
      if v_headers ->> 'x-audit-aal' = 'aal2' then
        select i.target_user_id into impersonating_user_id
        from public.impersonations i
        where i.admin_user_id = actor_id and i.ended_at is null and i.expires_at > now()
        limit 1;
      end if;
    else
      source := 'service';
    end if;
  elsif v_role in ('authenticated', 'anon') then
    actor_id := auth.uid();
    source := 'user';
    if actor_id is not null and public.effective_user_id() <> actor_id then
      impersonating_user_id := public.effective_user_id();
    end if;
  else
    source := 'database';
  end if;
end;
$$;
