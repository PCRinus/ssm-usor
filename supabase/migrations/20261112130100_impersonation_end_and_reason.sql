-- An impersonation's end as it happened (ADR 033, ADR 038): one closed after its expiry ended at
-- the expiry and records no event, as natural expiry never does. The caller's active
-- impersonation by the database's clock, the one effective_user_id() follows, for the API. And a
-- reason on every impersonation from now on.

create or replace function public.protect_impersonation_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ended_at is not null then
    raise exception 'An ended impersonation is not changed.' using errcode = 'IMS01';
  end if;
  if new.ended_at is not null then
    new.ended_at := least(now(), old.expires_at);
  end if;
  return new;
end;
$$;

create or replace function audit.record_impersonation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := (select a.source from audit.current_actor() as a);
  v_organization_id uuid := (
    select m.organization_id from public.organization_members m where m.user_id = new.target_user_id
  );
begin
  if tg_op = 'INSERT' then
    insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
    values ('impersonation_started', 'impersonations', new.id, v_organization_id,
      jsonb_build_object('reason', new.reason, 'expires_at', new.expires_at),
      new.admin_user_id, new.target_user_id, v_source);
  elsif old.ended_at is null and new.ended_at is not null and new.ended_at < new.expires_at then
    insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
    values ('impersonation_ended', 'impersonations', new.id, v_organization_id,
      jsonb_build_object('ended_at', new.ended_at),
      new.admin_user_id, new.target_user_id, v_source);
  end if;
  return null;
end;
$$;

-- An invoker: the policies show an admin only his own rows, and only past the second factor,
-- as effective_user_id() decides.
create function public.current_impersonation()
returns setof public.impersonations
language sql
stable
rows 1
set search_path = ''
as $$
  select i.*
  from public.impersonations i
  where i.admin_user_id = (select auth.uid())
    and i.ended_at is null
    and i.expires_at > now();
$$;

comment on function public.current_impersonation() is
  'The calling platform admin''s impersonation in force now (ADR 038), by the database''s clock as effective_user_id(), or no row.';

revoke all on function public.current_impersonation() from public, anon;
grant execute on function public.current_impersonation() to authenticated;

-- Postgres checks an unvalidated constraint on every later update, so an open row without a
-- reason could never be ended, and the next start would fail on it. The rows are ended while the
-- constraint is absent, since it would check that update too.
alter table public.impersonations drop constraint if exists impersonations_reason_given;

update public.impersonations set ended_at = now()
where ended_at is null and (reason is null or reason !~ '[^[:space:]]');

-- The data processing agreement says support access is logged with a reason. Not validated: a
-- row written by SQL before this is evidence nobody rewrites, and must not stop the migration.
alter table public.impersonations
  add constraint impersonations_reason_given check (reason is not null and reason ~ '[^[:space:]]') not valid;
