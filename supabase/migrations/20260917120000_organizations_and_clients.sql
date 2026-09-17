-- Tenancy, platform-admin impersonation, and the first business table (clients).
--
-- An organization is one external SSM provider using the app (the paying customer).
-- Every user belongs to at most one organization through organization_members.
-- Row-level security scopes business tables to the caller's effective organization,
-- where "effective" accounts for an active impersonation by a platform admin.
-- Platform admins are identified by the trusted app_metadata.role = 'admin' claim,
-- which only the Auth Admin API can set.

create type public.organization_role as enum ('owner', 'specialist');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint organizations_name_length check (char_length(btrim(name)) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is 'Tenants: external SSM providers using the platform.';

create table public.organization_members (
  -- One membership per user; the primary key enforces a single organization per user.
  user_id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.organization_role not null default 'specialist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

comment on table public.organization_members is 'Links a Supabase auth user to its organization and role.';

create table public.impersonations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  reason text constraint impersonations_reason_length check (char_length(reason) <= 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  ended_at timestamptz,
  constraint impersonations_distinct_users check (admin_user_id <> target_user_id),
  constraint impersonations_expiry_after_start check (expires_at > started_at)
);

-- At most one active impersonation per platform admin. Ended rows stay as an audit trail.
create unique index impersonations_active_admin_key
  on public.impersonations (admin_user_id)
  where ended_at is null;

comment on table public.impersonations is 'Platform admins acting as another user for support; rows are kept as an audit trail.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  legal_name text not null constraint clients_legal_name_length check (char_length(btrim(legal_name)) between 2 and 200),
  -- Digits only; the RO prefix is represented by vat_payer. Checksum is validated by the API.
  cui text not null constraint clients_cui_format check (cui ~ '^[1-9][0-9]{1,9}$'),
  vat_payer boolean not null default false,
  -- CAEN Rev. 3 main activity, four digits with leading zeros preserved.
  caen_code text constraint clients_caen_code_format check (caen_code ~ '^[0-9]{4}$'),
  trade_register_number text constraint clients_trade_register_number_length check (char_length(trade_register_number) between 1 and 40),
  -- Registered office (sediu social). County uses the vehicle registration code.
  county_code text constraint clients_county_code_valid check (
    county_code in (
      'AB','AR','AG','BC','BH','BN','BT','BV','BR','B','BZ','CS','CL','CJ','CT','CV','DB',
      'DJ','GL','GR','GJ','HR','HD','IL','IS','IF','MM','MH','MS','NT','OT','PH','SM','SJ',
      'SB','SV','TR','TM','TL','VS','VL','VN'
    )
  ),
  locality text constraint clients_locality_length check (char_length(locality) between 1 and 120),
  address_line text constraint clients_address_line_length check (char_length(address_line) between 1 and 240),
  legal_representative_name text constraint clients_legal_representative_name_length check (char_length(legal_representative_name) between 2 and 160),
  -- Headcount declared at onboarding; a live count will come from employee records later.
  declared_employee_count integer constraint clients_declared_employee_count_range check (declared_employee_count between 0 and 1000000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: archived clients keep their evidence.
  archived_at timestamptz
);

create unique index clients_organization_cui_key on public.clients (organization_id, cui);
create index clients_organization_active_idx on public.clients (organization_id, legal_name) where archived_at is null;

comment on table public.clients is 'Client companies served by an organization.';

-- updated_at maintenance -----------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- Identity helpers used by policies ---------------------------------------------------

create function public.is_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

comment on function public.is_platform_admin() is 'True when the JWT carries the trusted app_metadata.role = admin claim.';

-- The user whose data the caller sees: the impersonated user during an active
-- impersonation by a platform admin, otherwise the caller.
create function public.effective_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select i.target_user_id
      from public.impersonations i
      where public.is_platform_admin()
        and i.admin_user_id = auth.uid()
        and i.ended_at is null
        and i.expires_at > now()
      limit 1
    ),
    auth.uid()
  );
$$;

create function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = public.effective_user_id();
$$;

-- One call for the API: the effective user's membership, or no rows.
create function public.current_membership()
returns table (user_id uuid, organization_id uuid, role public.organization_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.organization_id, m.role
  from public.organization_members m
  where m.user_id = public.effective_user_id();
$$;

revoke all on function public.set_updated_at() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.effective_user_id() from public, anon;
revoke all on function public.current_organization_id() from public, anon;
revoke all on function public.current_membership() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.effective_user_id() to authenticated, service_role;
grant execute on function public.current_organization_id() to authenticated, service_role;
grant execute on function public.current_membership() to authenticated, service_role;

-- Row-level security ------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.impersonations enable row level security;
alter table public.clients enable row level security;

-- Anonymous callers never reach business tables.
revoke all on table public.organizations from anon;
revoke all on table public.organization_members from anon;
revoke all on table public.impersonations from anon;
revoke all on table public.clients from anon;

-- Organizations and memberships are administered by the seed and, later, owner routes.
-- For now signed-in users can only read their own organization and its members.
create policy "members read their organization"
  on public.organizations for select to authenticated
  using (id = public.current_organization_id());

create policy "members read their organization members"
  on public.organization_members for select to authenticated
  using (organization_id = public.current_organization_id());

-- Platform admins manage their own impersonation rows; nobody else sees them.
create policy "platform admins read their impersonations"
  on public.impersonations for select to authenticated
  using (public.is_platform_admin() and admin_user_id = (select auth.uid()));

create policy "platform admins start impersonations"
  on public.impersonations for insert to authenticated
  with check (public.is_platform_admin() and admin_user_id = (select auth.uid()));

create policy "platform admins end their impersonations"
  on public.impersonations for update to authenticated
  using (public.is_platform_admin() and admin_user_id = (select auth.uid()))
  with check (public.is_platform_admin() and admin_user_id = (select auth.uid()));

-- Clients are scoped to the effective organization. Deletion is a soft archive via update.
create policy "members read their clients"
  on public.clients for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create clients in their organization"
  on public.clients for insert to authenticated
  with check (organization_id = public.current_organization_id());

create policy "members update their clients"
  on public.clients for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());
