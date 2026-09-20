-- ADR 007: a lead is a client that is not served yet. Same table, an earlier stage, so that
-- the service contract drafted for a lead is already the client's on the day of promotion.
-- Only owners see a lead. The policies carry that rule, not the API's filters: a filter
-- forgotten there shows an owner too much and never shows a specialist a lead.

create type public.client_stage as enum ('lead', 'client');

alter table public.clients
  add column stage public.client_stage not null default 'client',
  -- Often not the legal representative. The email is where a contract is sent.
  add column contact_name text
    constraint clients_contact_name_length check (char_length(btrim(contact_name)) between 2 and 160),
  add column contact_email text
    constraint clients_contact_email_format check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254),
  add column contact_phone text
    constraint clients_contact_phone_length check (char_length(btrim(contact_phone)) between 5 and 20),
  add column promoted_at timestamptz,
  add column promoted_by uuid references auth.users (id) on delete set null,
  add constraint clients_promoted_is_client check (stage = 'client' or promoted_at is null);

create index clients_organization_leads_idx
  on public.clients (organization_id, legal_name) where stage = 'lead';

drop policy "members read their clients" on public.clients;
drop policy "members create clients in their organization" on public.clients;
drop policy "members update their clients" on public.clients;

create policy "members read their clients, owners also their leads"
  on public.clients for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (stage = 'client' or (select public.is_organization_owner()))
  );

create policy "members create clients, owners also leads"
  on public.clients for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and (stage = 'client' or (select public.is_organization_owner()))
  );

create policy "members update their clients, owners also their leads"
  on public.clients for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and (stage = 'client' or (select public.is_organization_owner()))
  )
  with check (
    organization_id = public.current_organization_id()
    and (stage = 'client' or (select public.is_organization_owner()))
  );

-- Promotion is the only change of stage, it is an owner's, and it is recorded here so that
-- the who and the when cannot be written by hand. Without a user the caller holds the
-- secret key: seeds and maintenance.
--   CLL02  a client does not go back to being a lead
create function public.protect_client_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is not distinct from old.stage then
    new.promoted_at := old.promoted_at;
    new.promoted_by := old.promoted_by;
    return new;
  end if;
  if old.stage = 'client' then
    raise exception 'A client does not go back to being a lead.' using errcode = 'CLL02';
  end if;
  if (select auth.uid()) is not null and not public.is_organization_owner() then
    raise exception 'Only an owner promotes a lead.' using errcode = '42501';
  end if;
  new.promoted_at := now();
  new.promoted_by := (select auth.uid());
  return new;
end;
$$;

create trigger clients_protect_stage before update on public.clients
  for each row execute function public.protect_client_stage();

revoke all on function public.protect_client_stage() from public, anon;

-- Nothing of the safety work starts under a lead: the team cannot see the record it would
-- hang from. A trigger and not a policy, so that the API can name the reason. Runs as its
-- owner, as the archived-client check does, and for the same reason.
--   CLL01  the company is still a lead
create function public.protect_rows_of_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.clients c where c.id = new.client_id and c.stage = 'lead') then
    raise exception 'A lead has no safety records; promote it first.' using errcode = 'CLL01';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_rows_of_lead() from public, anon, authenticated;

create trigger employees_protect_lead before insert on public.employees
  for each row execute function public.protect_rows_of_lead();
create trigger job_positions_protect_lead before insert on public.job_positions
  for each row execute function public.protect_rows_of_lead();
create trigger client_workplaces_protect_lead before insert on public.client_workplaces
  for each row execute function public.protect_rows_of_lead();
create trigger client_responsible_persons_protect_lead before insert on public.client_responsible_persons
  for each row execute function public.protect_rows_of_lead();
-- The documentation set. The service contract will be let through when it arrives.
create trigger client_documents_protect_lead before insert on public.client_documents
  for each row execute function public.protect_rows_of_lead();

-- An owner's notes about a lead or a client ---------------------------------------------

-- Not a column of clients: a policy hides rows, not columns, and the whole team reads a
-- client's row once it is promoted. These stay the owners' afterwards too.
create table public.client_owner_notes (
  client_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  body text not null constraint client_owner_notes_body_length check (char_length(body) <= 5000),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_owner_notes_client_fkey
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

comment on table public.client_owner_notes is 'Free-text notes of the owners about a lead or a client, never shown to specialists.';

create trigger client_owner_notes_set_updated_at before update on public.client_owner_notes
  for each row execute function public.set_updated_at();

create trigger client_owner_notes_protect_archived_client
  before insert or update or delete on public.client_owner_notes
  for each row execute function public.protect_rows_of_archived_client();

alter table public.client_owner_notes enable row level security;
revoke all on table public.client_owner_notes from anon;

create policy "owners read the notes of their clients"
  on public.client_owner_notes for select to authenticated
  using (organization_id = public.current_organization_id() and (select public.is_organization_owner()));

create policy "owners write the notes of their clients"
  on public.client_owner_notes for insert to authenticated
  with check (organization_id = public.current_organization_id() and (select public.is_organization_owner()));

create policy "owners change the notes of their clients"
  on public.client_owner_notes for update to authenticated
  using (organization_id = public.current_organization_id() and (select public.is_organization_owner()))
  with check (organization_id = public.current_organization_id() and (select public.is_organization_owner()));
