-- ADR 020: the facts of a fixed-space workplace's building that the site sheet 7.1 prints and
-- nothing else holds. Optional field by field, never asked for by readiness.

create type public.fire_building_classification as enum ('civil', 'production', 'storage', 'mixed');

create table public.fire_buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  workplace_id uuid not null,
  -- The upper bound is the current year in the API: a check constraint must not read the clock.
  year_built smallint
    constraint fire_buildings_year_built_range check (year_built between 1800 and 2100),
  built_area_m2 numeric(10, 2)
    constraint fire_buildings_built_area_positive check (built_area_m2 > 0),
  levels text
    constraint fire_buildings_levels_length check (char_length(btrim(levels)) between 2 and 40),
  classification public.fire_building_classification,
  structure text
    constraint fire_buildings_structure_length check (char_length(btrim(structure)) between 2 and 120),
  heating_fuel text
    constraint fire_buildings_heating_fuel_length check (char_length(btrim(heating_fuel)) between 2 and 80),
  gas_use text
    constraint fire_buildings_gas_use_length check (char_length(btrim(gas_use)) between 2 and 120),
  electrical_maintainer text
    constraint fire_buildings_electrical_maintainer_length check (char_length(btrim(electrical_maintainer)) between 2 and 160),
  electrical_last_check_on date,
  water_reserve_m3 numeric(10, 2)
    constraint fire_buildings_water_reserve_not_negative check (water_reserve_m3 >= 0),
  notes text
    constraint fire_buildings_notes_length check (char_length(btrim(notes)) between 2 and 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_buildings_one_per_workplace unique (workplace_id),
  constraint fire_buildings_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint fire_buildings_workplace_of_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict
);

create index fire_buildings_client_id_idx on public.fire_buildings (client_id);
create index fire_buildings_organization_id_idx on public.fire_buildings (organization_id);

comment on table public.fire_buildings is
  'The building of a fixed-space workplace, one row at most per workplace, for the site sheet 7.1. Kept, and not printed, when the workplace becomes a mobile site (ADR 020).';

create trigger fire_buildings_set_updated_at before update on public.fire_buildings
  for each row execute function public.set_updated_at();

create trigger fire_buildings_protect_archived_client
  before insert or update or delete on public.fire_buildings
  for each row execute function public.protect_rows_of_archived_client();

create trigger fire_buildings_protect_lead before insert on public.fire_buildings
  for each row execute function public.protect_rows_of_lead();

alter table public.fire_buildings enable row level security;
revoke all on table public.fire_buildings from anon;

create policy "members read their fire buildings"
  on public.fire_buildings for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create fire buildings for their active clients"
  on public.fire_buildings for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their fire buildings"
  on public.fire_buildings for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their fire buildings"
  on public.fire_buildings for delete to authenticated
  using (organization_id = public.current_organization_id());

-- The freeze reads the client of the row before the change, and a building belongs to its
-- workplace: neither key moves.
revoke update on table public.fire_buildings from authenticated;
grant update (
  year_built, built_area_m2, levels, classification, structure, heating_fuel, gas_use,
  electrical_maintainer, electrical_last_check_on, water_reserve_m3, notes
) on table public.fire_buildings to authenticated;
