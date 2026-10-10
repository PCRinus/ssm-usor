-- ADR 018: the client data of the fire-safety set's second stage.

create type public.fire_smoking_policy as enum ('forbidden_everywhere', 'designated_places');

-- The rows of OMAI 163/2007 annex 6, named by the built area one extinguisher covers.
create type public.fire_extinguisher_norm as enum (
  'administrative_300',
  'commercial_200',
  'residential_level',
  'mixed_300',
  'other_150'
);

create type public.fire_equipment_kind as enum (
  'extinguisher',
  'sand_box',
  'fire_post',
  'fire_blanket',
  'other'
);

create type public.fire_extinguishing_agent as enum ('powder', 'co2', 'foam', 'water', 'clean_agent');

create type public.fire_installation_kind as enum (
  'detection_alarm',
  'interior_hydrants',
  'exterior_hydrants',
  'sprinklers',
  'smoke_exhaust',
  'emergency_lighting',
  'lightning_protection',
  'gas_detection',
  'other'
);

-- A check constraint cannot read the elements of an array by itself.
create function public.text_items_length_between(p_items text[], p_min integer, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(item is not null and char_length(btrim(item)) between p_min and p_max), true)
  from unnest(p_items) as item;
$$;

revoke all on function public.text_items_length_between(text[], integer, integer) from public, anon;
grant execute on function public.text_items_length_between(text[], integer, integer) to authenticated, service_role;


-- Not the occupational safety schedule on `clients`: another law, other bounds (ADR 018).
create table public.client_fire_safety (
  client_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- OMAI 712/2005 art. 21: two hours at least.
  periodic_training_hours smallint
    constraint client_fire_safety_periodic_training_hours_range check (periodic_training_hours between 2 and 8),
  -- OMAI 712/2005 art. 26 allows at most six months for any category.
  administrative_training_interval_months smallint
    constraint client_fire_safety_administrative_interval_range
    check (administrative_training_interval_months between 1 and 6),
  worker_training_interval_months smallint
    constraint client_fire_safety_worker_interval_range check (worker_training_interval_months between 1 and 6),
  training_first_month smallint
    constraint client_fire_safety_training_first_month_range check (training_first_month between 1 and 12),
  training_day_from smallint
    constraint client_fire_safety_training_day_from_range check (training_day_from between 1 and 31),
  training_day_to smallint
    constraint client_fire_safety_training_day_to_range check (training_day_to between 1 and 31),
  smoking_policy public.fire_smoking_policy,
  waste_kinds text[] not null default '{}'
    constraint client_fire_safety_waste_kinds_valid
    check (cardinality(waste_kinds) <= 12 and public.text_items_length_between(waste_kinds, 2, 80)),
  waste_contractor text
    constraint client_fire_safety_waste_contractor_length check (char_length(btrim(waste_contractor)) between 2 and 160),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_fire_safety_training_days_ordered
    check (training_day_from is null or training_day_to is null or training_day_from <= training_day_to),
  constraint client_fire_safety_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create index client_fire_safety_organization_id_idx on public.client_fire_safety (organization_id);

comment on table public.client_fire_safety is
  'A client''s fire-safety training schedule, smoking policy and waste; created on the first save (ADR 018).';


alter table public.client_workplaces
  add column activity text
    constraint client_workplaces_activity_length check (char_length(btrim(activity)) between 2 and 160),
  add column floor_area_m2 integer
    constraint client_workplaces_floor_area_range check (floor_area_m2 between 1 and 1000000),
  add column extinguisher_norm public.fire_extinguisher_norm,
  add column assembly_point text
    constraint client_workplaces_assembly_point_length check (char_length(btrim(assembly_point)) between 2 and 240),
  add column combustible_materials text
    constraint client_workplaces_combustible_materials_length
    check (char_length(btrim(combustible_materials)) between 2 and 600),
  add column ignition_sources text
    constraint client_workplaces_ignition_sources_length check (char_length(btrim(ignition_sources)) between 2 and 600),
  add column fire_risk_equipment text
    constraint client_workplaces_fire_risk_equipment_length
    check (char_length(btrim(fire_risk_equipment)) between 2 and 600),
  add column specific_measures text
    constraint client_workplaces_specific_measures_length check (char_length(btrim(specific_measures)) between 2 and 600);

comment on column public.client_workplaces.combustible_materials is 'Point I.1 of the posted workplace sheet (OMAI 163/2007 annex 1).';
comment on column public.client_workplaces.ignition_sources is 'Point I.2 of the posted workplace sheet.';
comment on column public.client_workplaces.fire_risk_equipment is 'Point I.3 of the posted workplace sheet: equipment and means of work.';
comment on column public.client_workplaces.specific_measures is 'Point I.5 of the posted workplace sheet; printed empty when null.';

-- Lets a row of another table point at a workplace together with its client.
create unique index client_workplaces_id_client_key on public.client_workplaces (id, client_id);


alter table public.client_responsible_persons
  add column workplace_id uuid,
  add constraint client_responsible_persons_workplace_of_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict,
  drop constraint client_responsible_persons_roles_not_empty,
  add constraint client_responsible_persons_roles_not_empty check (cardinality(roles) between 1 and 7);

comment on column public.client_responsible_persons.workplace_id is
  'The one workplace the person answers for; null for every workplace of the client.';


-- One row per unit, deleted rather than archived: nothing points at a unit, and a generated
-- document keeps what it printed in its snapshot.
create table public.fire_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  workplace_id uuid not null,
  kind public.fire_equipment_kind not null,
  agent public.fire_extinguishing_agent,
  -- Kilograms or litres, as the trade prints it after the agent: P6, G3, AP9.
  capacity smallint constraint fire_equipment_capacity_range check (capacity between 1 and 250),
  wheeled boolean not null default false,
  label text constraint fire_equipment_label_length check (char_length(btrim(label)) between 1 and 80),
  location text constraint fire_equipment_location_length check (char_length(btrim(location)) between 2 and 160),
  manufactured_year smallint
    constraint fire_equipment_manufactured_year_range check (manufactured_year between 1990 and 2100),
  -- The authorized maintainer's service (OMAI 163/2007 art. 133), not the monthly check.
  last_service_on date,
  next_service_on date,
  maintainer text constraint fire_equipment_maintainer_length check (char_length(btrim(maintainer)) between 2 and 160),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_equipment_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint fire_equipment_workplace_of_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict,
  constraint fire_equipment_extinguisher_agent
    check ((kind = 'extinguisher') = (agent is not null)),
  constraint fire_equipment_extinguisher_capacity
    check ((kind = 'extinguisher') = (capacity is not null)),
  constraint fire_equipment_wheeled_extinguisher check (not wheeled or kind = 'extinguisher')
);

create index fire_equipment_client_workplace_idx on public.fire_equipment (client_id, workplace_id);
create index fire_equipment_organization_id_idx on public.fire_equipment (organization_id);

comment on table public.fire_equipment is
  'A client''s fire-fighting equipment, one row per unit, on a workplace (ADR 018).';

create table public.fire_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  workplace_id uuid not null,
  kind public.fire_installation_kind not null,
  description text
    constraint fire_installations_description_length check (char_length(btrim(description)) between 2 and 240),
  maintainer text
    constraint fire_installations_maintainer_length check (char_length(btrim(maintainer)) between 2 and 160),
  last_check_on date,
  next_check_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_installations_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint fire_installations_workplace_of_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict,
  constraint fire_installations_other_described check (kind <> 'other' or description is not null)
);

create index fire_installations_client_workplace_idx on public.fire_installations (client_id, workplace_id);
create index fire_installations_organization_id_idx on public.fire_installations (organization_id);

comment on table public.fire_installations is
  'A client''s fire-safety installations, one row per installation, on a workplace (ADR 018).';


create trigger client_fire_safety_set_updated_at before update on public.client_fire_safety
  for each row execute function public.set_updated_at();
create trigger fire_equipment_set_updated_at before update on public.fire_equipment
  for each row execute function public.set_updated_at();
create trigger fire_installations_set_updated_at before update on public.fire_installations
  for each row execute function public.set_updated_at();

create trigger client_fire_safety_protect_archived_client
  before insert or update or delete on public.client_fire_safety
  for each row execute function public.protect_rows_of_archived_client();
create trigger fire_equipment_protect_archived_client
  before insert or update or delete on public.fire_equipment
  for each row execute function public.protect_rows_of_archived_client();
create trigger fire_installations_protect_archived_client
  before insert or update or delete on public.fire_installations
  for each row execute function public.protect_rows_of_archived_client();

create trigger client_fire_safety_protect_lead before insert on public.client_fire_safety
  for each row execute function public.protect_rows_of_lead();
create trigger fire_equipment_protect_lead before insert on public.fire_equipment
  for each row execute function public.protect_rows_of_lead();
create trigger fire_installations_protect_lead before insert on public.fire_installations
  for each row execute function public.protect_rows_of_lead();


alter table public.client_fire_safety enable row level security;
alter table public.fire_equipment enable row level security;
alter table public.fire_installations enable row level security;
revoke all on table public.client_fire_safety from anon;
revoke all on table public.fire_equipment from anon;
revoke all on table public.fire_installations from anon;

create policy "members read their client fire safety"
  on public.client_fire_safety for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create fire safety for their active clients"
  on public.client_fire_safety for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their client fire safety"
  on public.client_fire_safety for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members read their fire equipment"
  on public.fire_equipment for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create fire equipment for their active clients"
  on public.fire_equipment for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their fire equipment"
  on public.fire_equipment for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their fire equipment"
  on public.fire_equipment for delete to authenticated
  using (organization_id = public.current_organization_id());

create policy "members read their fire installations"
  on public.fire_installations for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create fire installations for their active clients"
  on public.fire_installations for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their fire installations"
  on public.fire_installations for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their fire installations"
  on public.fire_installations for delete to authenticated
  using (organization_id = public.current_organization_id());

-- The freeze reads the client of the row before the change, so a row never moves to another
-- client; a unit may move to another workplace of the same one.
revoke update on table public.client_fire_safety from authenticated;
grant update (
  periodic_training_hours, administrative_training_interval_months, worker_training_interval_months,
  training_first_month, training_day_from, training_day_to, smoking_policy, waste_kinds, waste_contractor
) on table public.client_fire_safety to authenticated;

revoke update on table public.fire_equipment from authenticated;
grant update (
  workplace_id, kind, agent, capacity, wheeled, label, location, manufactured_year,
  last_service_on, next_service_on, maintainer
) on table public.fire_equipment to authenticated;

revoke update on table public.fire_installations from authenticated;
grant update (workplace_id, kind, description, maintainer, last_check_on, next_check_on)
  on table public.fire_installations to authenticated;
