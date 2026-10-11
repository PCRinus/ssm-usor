-- ADR 018, amended 2026-10-11: the free rows of a workplace's maintenance and check schedule,
-- what the inventory does not hold, printed by document 5.4 below the rows it derives.

create table public.fire_maintenance_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  workplace_id uuid not null,
  subject text not null
    constraint fire_maintenance_items_subject_length check (char_length(btrim(subject)) between 2 and 160),
  -- A label as printed ("anual", "la 6 luni"): no interval per kind is invented (ADR 018).
  interval_label text not null
    constraint fire_maintenance_items_interval_label_length check (char_length(btrim(interval_label)) between 2 and 60),
  checked_by text not null
    constraint fire_maintenance_items_checked_by_length check (char_length(btrim(checked_by)) between 2 and 160),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_maintenance_items_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint fire_maintenance_items_workplace_of_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict
);

create index fire_maintenance_items_client_workplace_idx
  on public.fire_maintenance_items (client_id, workplace_id, sort_order);
create index fire_maintenance_items_organization_id_idx on public.fire_maintenance_items (organization_id);

comment on table public.fire_maintenance_items is
  'A workplace''s free rows of the maintenance and check schedules 5.4; optional, never blocking (ADR 018).';

create trigger fire_maintenance_items_set_updated_at before update on public.fire_maintenance_items
  for each row execute function public.set_updated_at();

create trigger fire_maintenance_items_protect_archived_client
  before insert or update or delete on public.fire_maintenance_items
  for each row execute function public.protect_rows_of_archived_client();

create trigger fire_maintenance_items_protect_lead before insert on public.fire_maintenance_items
  for each row execute function public.protect_rows_of_lead();

alter table public.fire_maintenance_items enable row level security;
revoke all on table public.fire_maintenance_items from anon;

create policy "members read their fire maintenance items"
  on public.fire_maintenance_items for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create fire maintenance items for their active clients"
  on public.fire_maintenance_items for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their fire maintenance items"
  on public.fire_maintenance_items for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their fire maintenance items"
  on public.fire_maintenance_items for delete to authenticated
  using (organization_id = public.current_organization_id());

-- The freeze reads the client of the row before the change, so a row never moves to another
-- client; it may move to another workplace of the same one.
revoke update on table public.fire_maintenance_items from authenticated;
grant update (workplace_id, subject, interval_label, checked_by, sort_order)
  on table public.fire_maintenance_items to authenticated;
