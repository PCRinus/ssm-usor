-- Employees of client companies.
--
-- An employee belongs to exactly one client. The row keeps only the personal and
-- employment fields the SSM workflows need: identity for the training sheet, contact
-- details for invitations, and the hire date that drives training deadlines. Training,
-- signatures, and medical fitness are evidence records that will live in their own
-- tables; the employee row never summarizes them with flags.
--
-- The CNP is optional (product scope, privacy), constrained here to its shape and
-- validated for checksum by the API. It is protected by row-level security like every
-- other column; the API keeps it out of list responses.

create type public.employee_status as enum ('active', 'suspended', 'terminated');

-- Lets the employees table reference the client together with its organization,
-- so an employee can never point at a client of another organization.
create unique index clients_id_organization_key on public.clients (id, organization_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  last_name text not null constraint employees_last_name_length check (char_length(btrim(last_name)) between 1 and 100),
  first_name text not null constraint employees_first_name_length check (char_length(btrim(first_name)) between 1 and 100),
  -- Cod numeric personal: thirteen digits, the checksum is validated by the API.
  cnp text constraint employees_cnp_format check (cnp ~ '^[1-9][0-9]{12}$'),
  -- The client's own identifier for the person (marca), used by imports and the training sheet.
  employee_number text constraint employees_employee_number_length check (char_length(employee_number) between 1 and 40),
  email text constraint employees_email_length check (char_length(email) between 3 and 254),
  phone text constraint employees_phone_length check (char_length(phone) between 5 and 20),
  -- Free text (funcția). A COR occupation code will join it once the list exists.
  job_title text not null constraint employees_job_title_length check (char_length(btrim(job_title)) between 2 and 160),
  hired_at date not null,
  status public.employee_status not null default 'active',
  terminated_at date,
  -- Fields printed on the individual training sheet (fișa de instruire), all optional.
  birth_date date,
  birth_place text constraint employees_birth_place_length check (char_length(birth_place) between 1 and 160),
  home_address text constraint employees_home_address_length check (char_length(home_address) between 1 and 240),
  blood_group text constraint employees_blood_group_valid check (blood_group in ('0(I)', 'A(II)', 'B(III)', 'AB(IV)')),
  rh_factor text constraint employees_rh_factor_valid check (rh_factor in ('+', '-')),
  notes text constraint employees_notes_length check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete for rows entered by mistake. A leaver is a status change, not an archive.
  archived_at timestamptz,
  constraint employees_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint employees_terminated_at_matches_status
    check ((status = 'terminated') = (terminated_at is not null)),
  constraint employees_terminated_after_hire check (terminated_at is null or terminated_at >= hired_at),
  constraint employees_birth_before_hire check (birth_date is null or birth_date < hired_at)
);

-- Archived rows release their identifiers so a mistaken entry can be re-created.
create unique index employees_client_cnp_key
  on public.employees (client_id, cnp) where cnp is not null and archived_at is null;
create unique index employees_client_employee_number_key
  on public.employees (client_id, employee_number) where employee_number is not null and archived_at is null;
create index employees_client_active_idx
  on public.employees (client_id, last_name, first_name) where archived_at is null;
create index employees_organization_id_idx on public.employees (organization_id);

comment on table public.employees is 'People employed by a client company; one row per employment.';
comment on column public.employees.cnp is 'Optional personal numeric code; never included in list responses.';

create trigger employees_set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- Row-level security ------------------------------------------------------------------

alter table public.employees enable row level security;
revoke all on table public.employees from anon;

create policy "members read their employees"
  on public.employees for select to authenticated
  using (organization_id = public.current_organization_id());

-- New employees can only join an active client of the caller's organization.
create policy "members create employees for their active clients"
  on public.employees for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their employees"
  on public.employees for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());
