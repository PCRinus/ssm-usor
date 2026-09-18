-- A client's generated documentation: templates, documents in revisions, and their files
-- (ADR 005, step 2).
--
-- A document is generated from a versioned Word template, and from then on its .docx file
-- is the source of truth. Each client has one documentation set in which a document type
-- appears once; a correction or a reissue is a new revision. A revision is a draft until it
-- is issued, which locks it: the row stops changing and so does its file.
--
-- Files live in Supabase Storage. Policies on storage.objects reuse
-- current_organization_id(), so tenancy and impersonation apply to files as they do to rows.

-- Templates --------------------------------------------------------------------------------

-- `organization_id` is null for the built-in set, whose master copies live in the repository
-- (packages/document-engine/templates) and are registered by a script. A provider's own
-- templates will carry their organization.
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  -- Which document this is, for example 'decision_training'. The list lives in the contracts.
  type_key text not null constraint document_templates_type_key_format check (type_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  title text not null constraint document_templates_title_length check (char_length(btrim(title)) between 2 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index document_templates_built_in_key
  on public.document_templates (type_key) where organization_id is null;
create unique index document_templates_organization_key
  on public.document_templates (organization_id, type_key) where organization_id is not null;

create trigger document_templates_set_updated_at before update on public.document_templates
  for each row execute function public.set_updated_at();

-- One file of a template. A revision records the version it was generated from, so a
-- change to the wording never rewrites what an issued document was built from.
create table public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates (id) on delete restrict,
  version integer not null constraint document_template_versions_version_positive check (version >= 1),
  storage_path text not null
    constraint document_template_versions_storage_path_length check (char_length(storage_path) between 3 and 400),
  sha256 text not null constraint document_template_versions_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint document_template_versions_version_key unique (template_id, version),
  -- The same file registered twice is one version.
  constraint document_template_versions_sha256_key unique (template_id, sha256),
  constraint document_template_versions_storage_path_key unique (storage_path)
);

comment on table public.document_templates is 'Word templates by document type; organization_id is null for the built-in set.';
comment on table public.document_template_versions is 'Immutable files of a template, in Storage, identified by hash.';

-- Registers a built-in template file. Idempotent: the same hash returns the version it
-- already is, a new hash becomes the next version. Reached only with the secret key.
create function public.register_built_in_template_version(
  p_type_key text,
  p_title text,
  p_storage_path text,
  p_sha256 text
)
returns table (template_version_id uuid, version integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_version_id uuid;
  v_version integer;
begin
  insert into public.document_templates (organization_id, type_key, title)
  values (null, p_type_key, p_title)
  on conflict (type_key) where organization_id is null do update set title = excluded.title
  returning id into v_template_id;

  select tv.id, tv.version into v_version_id, v_version
  from public.document_template_versions tv
  where tv.template_id = v_template_id and tv.sha256 = p_sha256;
  if found then
    return query select v_version_id, v_version, false;
    return;
  end if;

  select coalesce(max(tv.version), 0) + 1 into v_version
  from public.document_template_versions tv
  where tv.template_id = v_template_id;

  insert into public.document_template_versions (template_id, version, storage_path, sha256)
  values (v_template_id, v_version, p_storage_path, p_sha256)
  returning id into v_version_id;

  return query select v_version_id, v_version, true;
end;
$$;

revoke all on function public.register_built_in_template_version(text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_built_in_template_version(text, text, text, text) to service_role;

-- Generations -----------------------------------------------------------------------------

-- What was asked when a client's documentation was generated. Users never see it; it keeps
-- the inputs that are not facts about the client.
create table public.document_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  -- The date the documents carry, usually the start of the contract.
  issue_date date not null,
  -- Decisions are numbered from here: "Decizia nr. 1 SSM".
  first_decision_number smallint not null default 1
    constraint document_generations_first_decision_number_range check (first_decision_number between 1 and 9999),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_generations_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create index document_generations_client_idx on public.document_generations (client_id, created_at desc);

-- Documents and revisions -----------------------------------------------------------------

-- One document type, once, in a client's documentation set.
create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  type_key text not null constraint client_documents_type_key_format check (type_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  title text not null constraint client_documents_title_length check (char_length(btrim(title)) between 2 and 200),
  -- Set for decisions; it stays the same across revisions.
  decision_number smallint constraint client_documents_decision_number_range check (decision_number between 1 and 9999),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_documents_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint client_documents_type_key unique (client_id, type_key),
  -- Lets a revision reference the document together with its organization.
  constraint client_documents_id_organization_key unique (id, organization_id)
);

create index client_documents_organization_id_idx on public.client_documents (organization_id);

create type public.document_revision_status as enum ('draft', 'issued', 'superseded');

create table public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id uuid not null,
  revision integer not null constraint document_revisions_revision_positive check (revision >= 1),
  status public.document_revision_status not null default 'draft',
  -- Both null for a file that was uploaded instead of generated.
  template_version_id uuid references public.document_template_versions (id) on delete restrict,
  generation_id uuid references public.document_generations (id) on delete restrict,
  -- "<organization>/<client>/<document>/<revision>.docx" in the documents bucket.
  docx_path text not null constraint document_revisions_docx_path_length check (char_length(docx_path) between 3 and 400),
  -- The data merged into the file, so the app can tell that it has changed since, and an
  -- issued document records what it was built from.
  data_snapshot jsonb,
  -- When the file was last saved from the editor or uploaded; null while it is as generated.
  edited_at timestamptz,
  edited_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Of the file as issued.
  docx_sha256 text constraint document_revisions_docx_sha256_format check (docx_sha256 ~ '^[0-9a-f]{64}$'),
  issued_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz,
  superseded_at timestamptz,
  constraint document_revisions_document_in_organization
    foreign key (document_id, organization_id) references public.client_documents (id, organization_id) on delete restrict,
  constraint document_revisions_revision_key unique (document_id, revision),
  constraint document_revisions_docx_path_key unique (docx_path),
  constraint document_revisions_path_in_organization
    check (split_part(docx_path, '/', 1) = organization_id::text),
  constraint document_revisions_issued_has_hash
    check ((status = 'draft') = (issued_at is null) and (status = 'draft' or docx_sha256 is not null)),
  constraint document_revisions_superseded_at_matches_status
    check ((status = 'superseded') = (superseded_at is not null))
);

-- A document has at most one draft and one issued revision at a time.
create unique index document_revisions_one_draft_key on public.document_revisions (document_id) where status = 'draft';
create unique index document_revisions_one_issued_key on public.document_revisions (document_id) where status = 'issued';
create index document_revisions_organization_id_idx on public.document_revisions (organization_id);

comment on table public.client_documents is 'One document type in a client''s documentation set; its content lives in revisions.';
comment on table public.document_revisions is 'A draft, issued, or superseded version of a document, with its file in Storage.';

create trigger document_revisions_set_updated_at before update on public.document_revisions
  for each row execute function public.set_updated_at();

-- An issued revision is evidence. Whoever asks, including the secret key, the only change
-- it accepts is being superseded by the next one.
create function public.protect_issued_document_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'issued' and new.status = 'superseded'
    and (to_jsonb(new) - 'status' - 'superseded_at' - 'updated_at')
      = (to_jsonb(old) - 'status' - 'superseded_at' - 'updated_at') then
    return new;
  end if;
  raise exception 'An issued document revision cannot be changed.' using errcode = 'DOC03';
end;
$$;

create trigger document_revisions_protect_issued before update on public.document_revisions
  for each row execute function public.protect_issued_document_revision();

-- Issues a draft: supersedes the issued revision, if any, and locks this one with the hash
-- of its file. Errors the API translates, raised with these SQLSTATEs:
--   DOC01  no such revision in the caller's organization
--   DOC02  the revision is not a draft
create function public.issue_document_revision(p_revision_id uuid, p_docx_sha256 text)
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
  where r.id = p_revision_id and r.organization_id = public.current_organization_id()
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
  set status = 'issued', issued_at = now(), issued_by = auth.uid(), docx_sha256 = p_docx_sha256
  where id = p_revision_id;
end;
$$;

revoke all on function public.protect_issued_document_revision() from public, anon;
revoke all on function public.issue_document_revision(uuid, text) from public, anon;
grant execute on function public.issue_document_revision(uuid, text) to authenticated;

-- Row-level security ------------------------------------------------------------------------

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;
alter table public.document_generations enable row level security;
alter table public.client_documents enable row level security;
alter table public.document_revisions enable row level security;

revoke all on table public.document_templates from anon;
revoke all on table public.document_template_versions from anon;
revoke all on table public.document_generations from anon;
revoke all on table public.client_documents from anon;
revoke all on table public.document_revisions from anon;

-- Templates are read by every member and written only with the secret key, until providers
-- can upload their own.
revoke insert, update, delete, truncate on table public.document_templates from authenticated;
revoke insert, update, delete, truncate on table public.document_template_versions from authenticated;

create policy "members read built-in and their own templates"
  on public.document_templates for select to authenticated
  using (
    public.current_organization_id() is not null
    and (organization_id is null or organization_id = public.current_organization_id())
  );

create policy "members read the versions of templates they can read"
  on public.document_template_versions for select to authenticated
  using (exists (select 1 from public.document_templates t where t.id = template_id));

create policy "members read their document generations"
  on public.document_generations for select to authenticated
  using (organization_id = public.current_organization_id());

-- Like employees, documentation is only generated for an active client.
create policy "members generate documents for their active clients"
  on public.document_generations for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members read their client documents"
  on public.client_documents for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create documents for their active clients"
  on public.client_documents for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members read their document revisions"
  on public.document_revisions for select to authenticated
  using (organization_id = public.current_organization_id());

-- Members write drafts only. Issuing goes through issue_document_revision().
create policy "members create draft revisions"
  on public.document_revisions for insert to authenticated
  with check (organization_id = public.current_organization_id() and status = 'draft');

create policy "members update their draft revisions"
  on public.document_revisions for update to authenticated
  using (organization_id = public.current_organization_id() and status = 'draft')
  with check (organization_id = public.current_organization_id() and status = 'draft');

create policy "members delete their draft revisions"
  on public.document_revisions for delete to authenticated
  using (organization_id = public.current_organization_id() and status = 'draft');

-- What regenerating and saving a draft change; the rest of the row is fixed once created.
revoke update on table public.document_revisions from authenticated;
grant update (template_version_id, generation_id, data_snapshot, edited_at, edited_by)
  on table public.document_revisions to authenticated;

-- Storage -----------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'document-templates', 'document-templates', false, 20971520,
    array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  ),
  (
    'documents', 'documents', false, 20971520,
    array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']
  );

-- "built-in/<type>/<hash>.docx", or "<organization>/…" once providers upload their own.
create policy "members read template files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'document-templates'
    and public.current_organization_id() is not null
    and (storage.foldername(name))[1] in ('built-in', public.current_organization_id()::text)
  );

create policy "members read their document files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_organization_id()::text
  );

-- A file can be written only where a draft revision of the caller's organization says it
-- lives, so issuing a revision also locks its file.
create function public.is_draft_document_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_revisions r
    where r.docx_path = p_path
      and r.status = 'draft'
      and r.organization_id = public.current_organization_id()
  );
$$;

revoke all on function public.is_draft_document_path(text) from public, anon;
grant execute on function public.is_draft_document_path(text) to authenticated, service_role;

create policy "members upload files of their draft revisions"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_draft_document_path(name));

create policy "members replace files of their draft revisions"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_draft_document_path(name))
  with check (bucket_id = 'documents' and public.is_draft_document_path(name));

create policy "members delete files of their draft revisions"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_draft_document_path(name));
