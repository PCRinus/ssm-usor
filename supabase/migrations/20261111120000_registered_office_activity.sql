-- ADR 041: a registered office may be only an address, where the client carries on no activity.
-- The fire-safety set then leaves it out, and readiness asks nothing of it.

alter table public.client_workplaces
  add column office_has_activity boolean not null default true,
  add constraint client_workplaces_activity_only_at_office
    check (office_has_activity or is_registered_office);

comment on column public.client_workplaces.office_has_activity is
  'False for a registered office that is only an address: the fire-safety set neither asks for nor prints its SU data, and keeps what is stored (ADR 041). Always true on a point of work, which is archived instead.';

-- Deferred, so that a transaction writing several workplaces, as an import does, is judged on
-- what it leaves and not on the order of its rows. Runs as the person making the change: the
-- workplaces it counts are the client's, which the policies let that person read.
create function public.require_workplace_beside_inactive_office()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.client_workplaces office
    where office.client_id = new.client_id
      and office.is_registered_office
      and not office.office_has_activity
      and office.archived_at is null
  ) and not exists (
    select 1 from public.client_workplaces point
    where point.client_id = new.client_id
      and not point.is_registered_office
      and point.archived_at is null
  ) then
    raise exception 'A registered office with no activity needs another active workplace.'
      using errcode = 'WPL01';
  end if;
  return null;
end;
$$;

create constraint trigger client_workplaces_office_needs_another
  after insert or update on public.client_workplaces
  deferrable initially deferred
  for each row execute function public.require_workplace_beside_inactive_office();

revoke all on function public.require_workplace_beside_inactive_office() from public, anon;
