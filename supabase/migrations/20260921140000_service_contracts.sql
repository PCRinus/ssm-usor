-- ADR 007, step 5: the service contract is a document like the others, in a second group of
-- document types, and only owners see it, before and after the lead becomes a client.

-- Other documents, and documents for owners only ------------------------------------------

create type public.document_group as enum ('documentation_set', 'other');

alter table public.client_documents
  add column document_group public.document_group not null default 'documentation_set',
  add column owners_only boolean not null default false,
  -- The API decides both from the type; this keeps a contract from being created as anything
  -- a specialist could read, whoever writes the row.
  add constraint client_documents_service_contract_is_owners
    check (type_key <> 'service_contract' or (document_group = 'other' and owners_only));

-- One answer for every way to a document: its row, its revisions, its files, issuing.
-- Runs as its owner because the callers below do, past the policies.
create function public.can_access_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_documents d
    where d.id = p_document_id
      and d.organization_id = public.current_organization_id()
      and (not d.owners_only or public.is_organization_owner())
  );
$$;

revoke all on function public.can_access_document(uuid) from public, anon;
grant execute on function public.can_access_document(uuid) to authenticated, service_role;

drop policy "members read their client documents" on public.client_documents;
drop policy "members create documents for their active clients" on public.client_documents;

create policy "members read their client documents, owners also theirs alone"
  on public.client_documents for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (not owners_only or (select public.is_organization_owner()))
  );

create policy "members create documents for their active clients"
  on public.client_documents for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and (not owners_only or (select public.is_organization_owner()))
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

drop policy "members read their document revisions" on public.document_revisions;
drop policy "members create draft revisions" on public.document_revisions;
drop policy "members update their draft revisions" on public.document_revisions;
drop policy "members delete their draft revisions" on public.document_revisions;

create policy "members read the revisions of documents they can read"
  on public.document_revisions for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_access_document(document_id));

create policy "members create draft revisions"
  on public.document_revisions for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and status = 'draft'
    and public.can_access_document(document_id)
  );

create policy "members update their draft revisions"
  on public.document_revisions for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and status = 'draft'
    and public.can_access_document(document_id)
  )
  with check (organization_id = public.current_organization_id() and status = 'draft');

create policy "members delete their draft revisions"
  on public.document_revisions for delete to authenticated
  using (
    organization_id = public.current_organization_id()
    and status = 'draft'
    and public.can_access_document(document_id)
  );

-- Files. Reading was by the organization's folder alone, which a specialist who learned the
-- path of a contract would pass. The PDF is matched by where it lives, beside the Word file,
-- and not by `pdf_path`: it is written just before issuing, while that column is still null,
-- and Storage reads the object it has just written.
create function public.is_readable_document_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_revisions r
    where (r.docx_path = p_path or regexp_replace(r.docx_path, '\.docx$', '.pdf') = p_path)
      and public.can_access_document(r.document_id)
  );
$$;

revoke all on function public.is_readable_document_path(text) from public, anon;
grant execute on function public.is_readable_document_path(text) to authenticated, service_role;

drop policy "members read their document files" on storage.objects;

create policy "members read the files of documents they can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_organization_id()::text
    and public.is_readable_document_path(name)
  );

create or replace function public.is_draft_document_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_revisions r
    join public.client_documents d on d.id = r.document_id
    join public.clients c on c.id = d.client_id
    where (r.docx_path = p_path or regexp_replace(r.docx_path, '\.docx$', '.pdf') = p_path)
      and r.status = 'draft'
      and r.organization_id = public.current_organization_id()
      and c.archived_at is null
      and public.can_access_document(d.id)
  );
$$;

-- Issuing runs as its owner, past the policies, so it asks too. A document the caller cannot
-- reach does not exist for them: DOC01, as for another organization's.
create or replace function public.issue_document_revision(
  p_revision_id uuid,
  p_docx_sha256 text,
  p_pdf_path text default null,
  p_pdf_sha256 text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.document_revisions;
begin
  select * into v_revision
  from public.document_revisions r
  where r.id = p_revision_id
    and r.organization_id = public.current_organization_id()
    and public.can_access_document(r.document_id)
  for update;
  if not found then
    raise exception 'No such document revision.' using errcode = 'DOC01';
  end if;
  if v_revision.status <> 'draft' then
    raise exception 'Only a draft can be issued.' using errcode = 'DOC02';
  end if;

  -- Serializes two people issuing revisions of the same document.
  perform 1 from public.client_documents d where d.id = v_revision.document_id for update;

  update public.document_revisions
  set status = 'superseded', superseded_at = now()
  where document_id = v_revision.document_id and status = 'issued';

  -- During an impersonation this records the platform admin, as `created_by` does.
  update public.document_revisions
  set status = 'issued', issued_at = now(), issued_by = auth.uid(),
      docx_sha256 = p_docx_sha256, pdf_path = p_pdf_path, pdf_sha256 = p_pdf_sha256
  where id = p_revision_id;
end;
$$;

-- A lead has no documentation set, and does have other documents: its contract.
create function public.protect_documents_of_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_group = 'documentation_set' and exists (
    select 1 from public.clients c where c.id = new.client_id and c.stage = 'lead'
  ) then
    raise exception 'A lead has no safety records; promote it first.' using errcode = 'CLL01';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_documents_of_lead() from public, anon, authenticated;

drop trigger client_documents_protect_lead on public.client_documents;
create trigger client_documents_protect_lead before insert on public.client_documents
  for each row execute function public.protect_documents_of_lead();

-- What the app knows about a contract ------------------------------------------------------

-- Not columns of clients: a policy hides rows and not columns, and the team reads a client's
-- row. An amendment later is a second row beside the first, which is why the key is its own.
-- Prices are not here: they live in the file, where they are binding (ADR 007).
create table public.service_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null,
  -- The provider's own register: "Nr. 51 din 15.02.2024".
  contract_number integer not null
    constraint service_contracts_number_range check (contract_number between 1 and 999999),
  contract_date date not null,
  start_date date not null,
  duration_months smallint not null
    constraint service_contracts_duration_range check (duration_months between 1 and 120),
  renews_automatically boolean not null default true,
  covers_occupational_safety boolean not null default true,
  covers_fire_safety boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_contracts_client_fkey
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  -- One per client, for now.
  constraint service_contracts_client_key unique (client_id),
  constraint service_contracts_covers_something check (covers_occupational_safety or covers_fire_safety)
);

-- Registers usually start again each year.
create unique index service_contracts_number_key
  on public.service_contracts (organization_id, (extract(year from contract_date)), contract_number);

comment on table public.service_contracts is 'What the app reads about a service contract: its number, dates and services. Owners only.';

create trigger service_contracts_set_updated_at before update on public.service_contracts
  for each row execute function public.set_updated_at();

create trigger service_contracts_protect_archived_client
  before insert or update or delete on public.service_contracts
  for each row execute function public.protect_rows_of_archived_client();

alter table public.service_contracts enable row level security;
revoke all on table public.service_contracts from anon;

create policy "owners read the contracts of their clients"
  on public.service_contracts for select to authenticated
  using (organization_id = public.current_organization_id() and (select public.is_organization_owner()));

create policy "owners write the contracts of their clients"
  on public.service_contracts for insert to authenticated
  with check (organization_id = public.current_organization_id() and (select public.is_organization_owner()));

create policy "owners change the contracts of their clients"
  on public.service_contracts for update to authenticated
  using (organization_id = public.current_organization_id() and (select public.is_organization_owner()))
  with check (organization_id = public.current_organization_id() and (select public.is_organization_owner()));
