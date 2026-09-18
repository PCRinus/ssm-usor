-- The facts a client's SSM documentation prints (ADR 005).
--
-- Generated documents name the provider and its specialists, the client's legal
-- representative with their role, the client's workplaces, the people the employer
-- designates by decision, and the training schedule the first decision sets. Facts that
-- outlast one generation are stored once, here; only the issue date and the starting
-- decision number are asked when generating.
--
-- Everything is optional in the database. The generation form reports what is missing
-- and refuses to generate until it is filled in, so a document never prints a blank.

-- The county list, once, for the new address columns. `clients.county_code` keeps its
-- own check with the same values.
create domain public.county_code as text
  constraint county_code_valid check (
    value in (
      'AB','AR','AG','BC','BH','BN','BT','BV','BR','B','BZ','CS','CL','CJ','CT','CV','DB',
      'DJ','GL','GR','GJ','HR','HD','IL','IS','IF','MM','MH','MS','NT','OT','PH','SM','SJ',
      'SB','SV','TR','TM','TL','VS','VL','VN'
    )
  );

-- The provider --------------------------------------------------------------------------

-- `name` stays what the app shows. The legal details are what documents print:
-- "S.C. … S.R.L." with its administrator.
alter table public.organizations
  add column legal_name text
    constraint organizations_legal_name_length check (char_length(btrim(legal_name)) between 2 and 200),
  add column cui text constraint organizations_cui_format check (cui ~ '^[1-9][0-9]{1,9}$'),
  add column trade_register_number text
    constraint organizations_trade_register_number_length check (char_length(trade_register_number) between 1 and 40),
  add column county_code public.county_code,
  add column locality text constraint organizations_locality_length check (char_length(locality) between 1 and 120),
  add column address_line text
    constraint organizations_address_line_length check (char_length(address_line) between 1 and 240),
  add column legal_representative_name text
    constraint organizations_legal_representative_name_length
    check (char_length(legal_representative_name) between 2 and 160),
  add column legal_representative_role text
    constraint organizations_legal_representative_role_length
    check (char_length(btrim(legal_representative_role)) between 2 and 80);

-- An owner fills in the legal details. The name and the accepted terms stay out of reach.
revoke insert, update, delete, truncate on table public.organizations from authenticated;
grant update (
  legal_name, cui, trade_register_number, county_code, locality, address_line,
  legal_representative_name, legal_representative_role
) on table public.organizations to authenticated;

create policy "owners update their organization"
  on public.organizations for update to authenticated
  using (id = public.current_organization_id() and public.is_organization_owner())
  with check (id = public.current_organization_id() and public.is_organization_owner());

-- A specialist's qualification as documents print it, for example "Coordonator în materie
-- de securitate și sănătate în muncă, evaluator autorizat". Each person writes their own.
alter table public.profiles
  add column professional_title text
    constraint profiles_professional_title_trimmed check (professional_title = btrim(professional_title))
    constraint profiles_professional_title_length check (char_length(professional_title) between 2 and 160);

grant update (professional_title) on table public.profiles to authenticated;

-- A new return column needs the function dropped first.
drop function public.organization_member_list();

create function public.organization_member_list()
returns table (
  user_id uuid,
  email text,
  full_name text,
  professional_title text,
  role public.organization_role,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, p.full_name, p.professional_title, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where m.organization_id = public.current_organization_id();
$$;

revoke all on function public.organization_member_list() from public, anon;
grant execute on function public.organization_member_list() to authenticated, service_role;

-- The client -----------------------------------------------------------------------------

alter table public.clients
  -- "Administrator", "Director general": printed after the representative's name.
  add column legal_representative_role text
    constraint clients_legal_representative_role_length
    check (char_length(btrim(legal_representative_role)) between 2 and 80),
  -- The training schedule the first decision sets (H.G. 1425/2006 art. 96). The deadline
  -- calendar will read the same columns.
  add column periodic_training_hours smallint
    constraint clients_periodic_training_hours_range check (periodic_training_hours between 1 and 8),
  -- Months between two periodic trainings: technical and administrative staff with
  -- workplace managers, and workers.
  add column administrative_training_interval_months smallint
    constraint clients_administrative_training_interval_range
    check (administrative_training_interval_months between 1 and 12),
  add column worker_training_interval_months smallint
    constraint clients_worker_training_interval_range check (worker_training_interval_months between 1 and 6),
  -- The first month of the year with a training; the others follow by the interval.
  add column training_first_month smallint
    constraint clients_training_first_month_range check (training_first_month between 1 and 12),
  -- The days of that month in which the training takes place, for example 2 to 7.
  add column training_day_from smallint
    constraint clients_training_day_from_range check (training_day_from between 1 and 31),
  add column training_day_to smallint
    constraint clients_training_day_to_range check (training_day_to between 1 and 31),
  add constraint clients_training_days_ordered
    check (training_day_from is null or training_day_to is null or training_day_from <= training_day_to);

-- Workplaces -------------------------------------------------------------------------------

-- The registered office and the points of work (puncte de lucru). Documents belong to the
-- client, not to a workplace; they list the workplaces.
create table public.client_workplaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null constraint client_workplaces_name_length check (char_length(btrim(name)) between 2 and 160),
  is_registered_office boolean not null default false,
  county_code public.county_code,
  locality text constraint client_workplaces_locality_length check (char_length(locality) between 1 and 120),
  address_line text constraint client_workplaces_address_line_length check (char_length(address_line) between 1 and 240),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete, for a workplace entered by mistake or closed.
  archived_at timestamptz,
  constraint client_workplaces_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create unique index client_workplaces_registered_office_key
  on public.client_workplaces (client_id) where is_registered_office and archived_at is null;
create index client_workplaces_client_active_idx
  on public.client_workplaces (client_id, name) where archived_at is null;
create index client_workplaces_organization_id_idx on public.client_workplaces (organization_id);

comment on table public.client_workplaces is 'Registered office and points of work of a client company.';

create trigger client_workplaces_set_updated_at before update on public.client_workplaces
  for each row execute function public.set_updated_at();

-- Responsible persons ------------------------------------------------------------------------

-- The people the employer designates by decision. One person often holds every role, and
-- the administrator is not always an employee, so the row carries its own name and job
-- title and only optionally points at an employee.
create type public.responsible_person_role as enum (
  -- Conducător al locului de muncă: gives the workplace and periodic training.
  'workplace_manager',
  'first_aid',
  'risk_evaluation_team',
  'imminent_danger'
);

-- Lets a responsible person reference an employee together with the client.
create unique index employees_id_client_key on public.employees (id, client_id);

create table public.client_responsible_persons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  employee_id uuid,
  full_name text not null
    constraint client_responsible_persons_full_name_length check (char_length(btrim(full_name)) between 2 and 160),
  job_title text not null
    constraint client_responsible_persons_job_title_length check (char_length(btrim(job_title)) between 2 and 160),
  roles public.responsible_person_role[] not null
    constraint client_responsible_persons_roles_not_empty check (cardinality(roles) between 1 and 4),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint client_responsible_persons_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint client_responsible_persons_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict
);

-- One row per employee; a person who is not an employee is told apart by name.
create unique index client_responsible_persons_employee_key
  on public.client_responsible_persons (client_id, employee_id)
  where employee_id is not null and archived_at is null;
create index client_responsible_persons_client_active_idx
  on public.client_responsible_persons (client_id, full_name) where archived_at is null;
create index client_responsible_persons_organization_id_idx on public.client_responsible_persons (organization_id);

comment on table public.client_responsible_persons is
  'People a client designates by decision: workplace managers, first aid, risk evaluation team, imminent danger.';

create trigger client_responsible_persons_set_updated_at before update on public.client_responsible_persons
  for each row execute function public.set_updated_at();

-- Row-level security ------------------------------------------------------------------------

alter table public.client_workplaces enable row level security;
alter table public.client_responsible_persons enable row level security;
revoke all on table public.client_workplaces from anon;
revoke all on table public.client_responsible_persons from anon;

create policy "members read their client workplaces"
  on public.client_workplaces for select to authenticated
  using (organization_id = public.current_organization_id());

-- Like employees, new rows can only join an active client of the caller's organization.
create policy "members create workplaces for their active clients"
  on public.client_workplaces for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their client workplaces"
  on public.client_workplaces for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members read their client responsible persons"
  on public.client_responsible_persons for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create responsible persons for their active clients"
  on public.client_responsible_persons for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their client responsible persons"
  on public.client_responsible_persons for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());
