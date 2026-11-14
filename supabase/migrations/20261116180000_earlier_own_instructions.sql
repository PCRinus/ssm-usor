-- ADR 042, decision 3: a paper training cites the client's own instructions as they were then, so
-- the app asks for a copy of them. The copy is a client file (ADR 013) that says which domain's
-- instructions it holds and until when they applied. A member may instead answer that the client
-- has none, per domain.

alter table public.client_files
  add column earlier_instructions_domain public.instruction_domain,
  add column valid_until date,
  add constraint client_files_earlier_instructions_valid_until
    check ((earlier_instructions_domain is null) = (valid_until is null)),
  add constraint client_files_earlier_instructions_of_client
    check (earlier_instructions_domain is null or (employee_id is null and import_id is null)),
  -- Hidden from a specialist, a copy would leave the domain asked for beside it.
  add constraint client_files_earlier_instructions_for_the_team
    check (earlier_instructions_domain is null or not owners_only);

comment on column public.client_files.earlier_instructions_domain is
  'Set when the file is a copy of the own instructions the client had before, IPSSM (ssm) or IPSU (su), which its paper trainings cite (ADR 042).';
comment on column public.client_files.valid_until is
  'For a copy of earlier own instructions, the day the instructions that replaced them apply from.';

create index client_files_earlier_instructions_idx
  on public.client_files (client_id, earlier_instructions_domain)
  where earlier_instructions_domain is not null;

grant insert (earlier_instructions_domain, valid_until) on table public.client_files to authenticated;
grant update (valid_until) on table public.client_files to authenticated;

create table public.earlier_instructions_unavailable (
  client_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  domain public.instruction_domain not null,
  answered_by uuid default auth.uid() references auth.users (id) on delete set null,
  answered_at timestamptz not null default now(),
  primary key (client_id, domain),
  -- Goes with its client, so deleting an archived client needs no step of its own.
  constraint earlier_instructions_unavailable_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete cascade
);

create index earlier_instructions_unavailable_organization_id_idx
  on public.earlier_instructions_unavailable (organization_id);

comment on table public.earlier_instructions_unavailable is
  'A member''s answer that a client has no copy of its earlier own instructions in a domain (ADR 042). Deleting it takes the answer back.';

create trigger earlier_instructions_unavailable_protect_archived_client
  before insert or update or delete on public.earlier_instructions_unavailable
  for each row execute function public.protect_rows_of_archived_client();

alter table public.earlier_instructions_unavailable enable row level security;
revoke all on table public.earlier_instructions_unavailable from anon;

create policy "members read the answers about their clients"
  on public.earlier_instructions_unavailable for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members answer for their active clients"
  on public.earlier_instructions_unavailable for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and answered_by = (select auth.uid())
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
        and c.stage = 'client'
    )
  );

create policy "members take back the answers about their clients"
  on public.earlier_instructions_unavailable for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

revoke insert, update, truncate on table public.earlier_instructions_unavailable from authenticated;
grant insert (client_id, organization_id, domain, answered_by) on table public.earlier_instructions_unavailable to authenticated;

-- A copy answers for its domain, so it takes back a "Nu le am" in the insert's own transaction.
-- Runs as its owner, past the delete policy, whoever uploads.
create function public.take_back_earlier_instructions_unavailable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.earlier_instructions_unavailable u
  where u.client_id = new.client_id and u.domain = new.earlier_instructions_domain;
  return null;
end;
$$;

revoke all on function public.take_back_earlier_instructions_unavailable() from public, anon, authenticated;

create trigger client_files_take_back_earlier_instructions_unavailable
  after insert on public.client_files
  for each row
  when (new.earlier_instructions_domain is not null)
  execute function public.take_back_earlier_instructions_unavailable();
