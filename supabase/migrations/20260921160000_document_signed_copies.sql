-- ADR 007, step 6: what comes back signed, on paper and scanned or with the signer's own
-- certificate, is kept beside the issued revision it is a copy of. The app records that a
-- file was attached, not that it is signed: it cannot tell.
--
-- A table of its own, not columns of document_revisions: an issued revision never changes,
-- which a trigger and the column grants both hold, and a signed copy arrives after issuing,
-- and can be replaced.

create table public.document_signed_copies (
  revision_id uuid primary key references public.document_revisions (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id uuid not null,
  -- "<organization>/<client>/<document>/<revision>.signed.pdf": beside the Word file.
  storage_path text not null
    constraint document_signed_copies_storage_path_key unique
    constraint document_signed_copies_storage_path_format check (storage_path ~ '\.signed\.pdf$'),
  sha256 text not null constraint document_signed_copies_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  constraint document_signed_copies_document_fkey
    foreign key (document_id, organization_id) references public.client_documents (id, organization_id) on delete restrict
);

comment on table public.document_signed_copies is 'The signed copy of an issued document revision: a PDF in Storage with its hash.';

-- The path is the revision's own, so that one revision has one signed copy and nobody
-- points a row at a file of another document.
create function public.check_signed_copy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.document_revisions;
begin
  select * into v_revision from public.document_revisions r where r.id = new.revision_id;
  if v_revision.document_id is distinct from new.document_id
    or v_revision.organization_id is distinct from new.organization_id then
    raise exception 'The signed copy does not belong to that document.' using errcode = '23514';
  end if;
  -- Only what was issued is signed; a revision that was replaced keeps the copy it had.
  if v_revision.status = 'draft' then
    raise exception 'A draft has no signed copy.' using errcode = 'DOC04';
  end if;
  if new.storage_path <> regexp_replace(v_revision.docx_path, '\.docx$', '.signed.pdf') then
    raise exception 'The signed copy lives beside the file of its revision.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_signed_copy() from public, anon, authenticated;

create trigger document_signed_copies_check before insert or update on public.document_signed_copies
  for each row execute function public.check_signed_copy();

create trigger document_signed_copies_protect_archived_client
  before insert or update or delete on public.document_signed_copies
  for each row execute function public.protect_revisions_of_archived_client();

alter table public.document_signed_copies enable row level security;
revoke all on table public.document_signed_copies from anon;

-- Whoever reaches the document: the contract is its owners', and a document of the
-- documentation set, when those are signed, is the team's.
create policy "members read the signed copies of documents they can read"
  on public.document_signed_copies for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_access_document(document_id));

create policy "members attach signed copies to documents they can read"
  on public.document_signed_copies for insert to authenticated
  with check (organization_id = public.current_organization_id() and public.can_access_document(document_id));

create policy "members replace signed copies of documents they can read"
  on public.document_signed_copies for update to authenticated
  using (organization_id = public.current_organization_id() and public.can_access_document(document_id))
  with check (organization_id = public.current_organization_id() and public.can_access_document(document_id));

create policy "members remove signed copies of documents they can read"
  on public.document_signed_copies for delete to authenticated
  using (organization_id = public.current_organization_id() and public.can_access_document(document_id));

-- Files follow their row, as the files of a draft follow theirs: the row first, then the file.
create function public.is_signed_copy_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_signed_copies s
    join public.client_documents d on d.id = s.document_id
    join public.clients c on c.id = d.client_id
    where s.storage_path = p_path
      and s.organization_id = public.current_organization_id()
      and c.archived_at is null
      and public.can_access_document(s.document_id)
  );
$$;

revoke all on function public.is_signed_copy_path(text) from public, anon;
grant execute on function public.is_signed_copy_path(text) to authenticated, service_role;

create policy "members upload the signed copies they recorded"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_signed_copy_path(name));

create policy "members replace the signed copies they recorded"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_signed_copy_path(name))
  with check (bucket_id = 'documents' and public.is_signed_copy_path(name));

create policy "members delete the signed copies they recorded"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_signed_copy_path(name));

-- Reading: the third file that lives beside a revision.
create or replace function public.is_readable_document_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_revisions r
    where (
        r.docx_path = p_path
        or regexp_replace(r.docx_path, '\.docx$', '.pdf') = p_path
        or regexp_replace(r.docx_path, '\.docx$', '.signed.pdf') = p_path
      )
      and public.can_access_document(r.document_id)
  );
$$;
