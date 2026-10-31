-- An impersonation row is the record of a platform admin acting as someone else (ADR 033), so
-- the admin writes the target, the reason and the expiry once, never `started_at`, and afterwards
-- only ends it, at a moment the database stamps.
--   IMS01  an ended impersonation is changed

-- Two hours is the column's default, and nothing in the app or the API sets another.
alter table public.impersonations
  add constraint impersonations_expiry_within_two_hours check (expires_at <= started_at + interval '2 hours');

revoke insert, update, delete, truncate on table public.impersonations from authenticated;
grant insert (admin_user_id, target_user_id, reason, expires_at) on table public.impersonations to authenticated;
grant update (ended_at) on table public.impersonations to authenticated;

create function public.protect_impersonation_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ended_at is not null then
    raise exception 'An ended impersonation is not changed.' using errcode = 'IMS01';
  end if;
  if new.ended_at is not null then
    new.ended_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.protect_impersonation_record() from public, anon, authenticated;

create trigger impersonations_protect_record before update on public.impersonations
  for each row execute function public.protect_impersonation_record();
