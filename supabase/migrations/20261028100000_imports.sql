-- Imports from documents (ADR 030): a client's files, read by a model into a proposal that a
-- member reviews and confirms. Nothing under a client is written until the member confirms.

create type public.import_kind as enum ('client', 'employees');

create type public.import_status as enum (
  'uploading', 'preparing', 'sorting', 'reading', 'checking', 'ready', 'confirmed', 'abandoned', 'failed'
);

create type public.import_file_state as enum (
  'uploading', 'uploaded', 'prepared', 'read', 'set_aside', 'for_employees', 'other_company', 'failed'
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind public.import_kind not null,
  client_id uuid,
  -- Kept apart from client_id, which a new client's import gains on confirming.
  into_existing_client boolean not null,
  source_import_id uuid references public.imports (id) on delete set null,
  status public.import_status not null default 'uploading',
  -- In Romanian, for members.
  failure_reason text constraint imports_failure_reason_length check (char_length(btrim(failure_reason)) between 1 and 1000),
  company_name text constraint imports_company_name_length check (char_length(btrim(company_name)) between 2 and 200),
  company_cui text constraint imports_company_cui_format check (company_cui ~ '^[1-9][0-9]{1,9}$'),
  proposal jsonb constraint imports_proposal_object check (jsonb_typeof(proposal) = 'object'),
  changes jsonb constraint imports_changes_object check (jsonb_typeof(changes) = 'object'),
  version integer not null default 0 constraint imports_version_range check (version >= 0),
  proposal_dropped_at timestamptz,
  quality jsonb constraint imports_quality_object check (jsonb_typeof(quality) = 'object'),
  input_tokens bigint not null default 0 constraint imports_input_tokens_range check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0
    constraint imports_cached_input_tokens_range check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 constraint imports_output_tokens_range check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 constraint imports_cost_usd_range check (cost_usd >= 0),
  -- Written with the secret key, so never defaulted from the session. During an impersonation,
  -- the platform admin, as created_by records elsewhere.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ready_at timestamptz,
  failed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  abandoned_at timestamptz,
  -- Set by the API once every file of the import folder is in client-files; until then the
  -- originals in imports are the only copy and the clean-up keeps them.
  files_copied_at timestamptz,
  objects_removed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint imports_id_organization_key unique (id, organization_id),
  constraint imports_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint imports_existing_client_named check (not into_existing_client or client_id is not null),
  constraint imports_employees_into_existing_client check (kind = 'client' or into_existing_client),
  constraint imports_started_when_past_uploading check (
    status in ('uploading', 'abandoned', 'failed') or started_at is not null
  ),
  constraint imports_ready_when_reviewed check (status not in ('ready', 'confirmed') or ready_at is not null),
  constraint imports_failed_with_reason check (
    status <> 'failed' or (failure_reason is not null and failed_at is not null)
  ),
  constraint imports_confirmed_stamped check (
    (status = 'confirmed') = (confirmed_at is not null) and (status <> 'confirmed' or client_id is not null)
  ),
  constraint imports_abandoned_stamped check ((status = 'abandoned') = (abandoned_at is not null)),
  constraint imports_copied_once_confirmed check (files_copied_at is null or status = 'confirmed'),
  constraint imports_objects_removed_after_copy check (
    objects_removed_at is null or (proposal_dropped_at is not null and files_copied_at is not null)
  ),
  constraint imports_proposal_dropped check (
    proposal_dropped_at is null or (status = 'confirmed' and proposal is null and changes is null)
  )
);

create index imports_organization_idx on public.imports (organization_id, created_at desc);
create index imports_client_idx on public.imports (client_id) where client_id is not null;
create index imports_source_import_idx on public.imports (source_import_id) where source_import_id is not null;
create index imports_abandoned_idx on public.imports (abandoned_at) where status = 'abandoned';
create index imports_failed_idx on public.imports (failed_at) where status = 'failed';
create index imports_proposal_kept_idx on public.imports (confirmed_at)
  where status = 'confirmed' and proposal_dropped_at is null;
create index imports_objects_kept_idx on public.imports (id)
  where proposal_dropped_at is not null and files_copied_at is not null and objects_removed_at is null;
create index imports_open_idx on public.imports (updated_at)
  where status in ('uploading', 'preparing', 'sorting', 'reading', 'checking', 'ready');

comment on table public.imports is
  'An import from documents (ADR 030): the files of one client, read into a proposal that a member confirms.';
comment on column public.imports.client_id is
  'The client imported into: set from the start for an existing client, on confirming for a new one.';
comment on column public.imports.status is
  'The step: uploading, then preparing, sorting, reading and checking, then ready for review; confirmed, abandoned and failed end it.';
comment on column public.imports.source_import_id is
  'The import whose uploaded files this one took over, when the documents named several companies.';
comment on column public.imports.company_name is 'The company the documents are about, once the reading found it.';
comment on column public.imports.proposal is
  'What the model proposed, each value with its file and quote, and the checks'' results. Null before ready, and 30 days after confirming.';
comment on column public.imports.changes is
  'What the member changed, kept or unticked in the review. Dropped with the proposal.';
comment on column public.imports.version is
  'Counts the saves of changes; a save and the confirmation name the version they were made on.';
comment on column public.imports.quality is
  'Value-free counts per section of the proposal: how many proposed values were changed, unticked or kept.';
comment on column public.imports.objects_removed_at is
  'When the API reported the import''s objects in the imports bucket removed, after its folder was copied.';
comment on column public.imports.cost_usd is
  'What every model request of the import cost, in US dollars, as the gateway reported it.';

create trigger imports_set_updated_at before update on public.imports
  for each row execute function public.set_updated_at();

-- Unlike refuse_archived_client, the secret key does not pass: imports are written with it, so
-- a check that let it through would guard nothing.
--   CLA01  an archived client takes no import
--   CLL01  a lead takes no import
--   IMP06  a confirmed or abandoned import does not change step
create function public.protect_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status in ('confirmed', 'abandoned') and new.status <> old.status then
    raise exception 'A confirmed or abandoned import does not change step.' using errcode = 'IMP06';
  end if;
  if new.client_id is not null and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    if exists (select 1 from public.clients c where c.id = new.client_id and c.archived_at is not null) then
      raise exception 'An archived client is not changed.' using errcode = 'CLA01';
    end if;
    if exists (select 1 from public.clients c where c.id = new.client_id and c.stage = 'lead') then
      raise exception 'A lead has no safety records; promote it first.' using errcode = 'CLL01';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_import() from public, anon, authenticated;

create trigger imports_protect before insert or update on public.imports
  for each row execute function public.protect_import();

create table public.import_files (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  organization_id uuid not null,
  upload_path text not null constraint import_files_upload_path_format check (
    char_length(upload_path) between 1 and 1024 and upload_path !~ '^/' and upload_path !~ '/$'
  ),
  original_file_name text not null
    constraint import_files_original_file_name_length check (char_length(original_file_name) between 1 and 255),
  mime_type text not null constraint import_files_mime_type_allowed check (mime_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  )),
  size_bytes integer not null constraint import_files_size_range check (size_bytes between 1 and 20971520),
  sha256 text not null constraint import_files_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Made of ids and the type only, so no character of a user's file name reaches Storage.
  storage_path text generated always as (
    organization_id::text || '/' || import_id::text || '/' || id::text || '.' ||
    case mime_type
      when 'application/pdf' then 'pdf'
      when 'application/msword' then 'doc'
      when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/heic' then 'heic'
      when 'image/heif' then 'heic'
      -- So that import_files_mime_type_allowed, which names the rule, refuses an unknown type,
      -- not the path's not-null.
      else 'bin'
    end
  ) stored not null,
  state public.import_file_state not null default 'uploading',
  document_kind text constraint import_files_document_kind_format check (document_kind ~ '^[a-z][a-z0-9_]{1,59}$'),
  -- In Romanian, for members: why the file was set aside or failed.
  reason text constraint import_files_reason_length check (char_length(btrim(reason)) between 1 and 1000),
  company_name text constraint import_files_company_name_length check (char_length(btrim(company_name)) between 1 and 200),
  company_cui text constraint import_files_company_cui_format check (company_cui ~ '^[1-9][0-9]{1,9}$'),
  page_count integer constraint import_files_page_count_range check (page_count between 1 and 10000),
  is_scan boolean,
  text_path text,
  derived_path text,
  derived_size_bytes integer
    constraint import_files_derived_size_range check (derived_size_bytes between 1 and 20971520),
  derived_sha256 text constraint import_files_derived_sha256_format check (derived_sha256 ~ '^[0-9a-f]{64}$'),
  input_tokens bigint not null default 0 constraint import_files_input_tokens_range check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0
    constraint import_files_cached_input_tokens_range check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 constraint import_files_output_tokens_range check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 constraint import_files_cost_usd_range check (cost_usd >= 0),
  client_file_id uuid references public.client_files (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_files_import_in_organization
    foreign key (import_id, organization_id) references public.imports (id, organization_id) on delete cascade,
  constraint import_files_storage_path_key unique (storage_path),
  constraint import_files_text_path_beside check (
    text_path in (
      regexp_replace(storage_path, '\.[a-z]+$', '.txt'),
      regexp_replace(storage_path, '\.[a-z]+$', '.json')
    )
  ),
  constraint import_files_derived_path_beside check (
    derived_path is null
    or (mime_type = 'application/msword' and derived_path = regexp_replace(storage_path, '\.[a-z]+$', '.docx'))
    or (mime_type in ('image/heic', 'image/heif') and derived_path = regexp_replace(storage_path, '\.[a-z]+$', '.jpg'))
  ),
  constraint import_files_derived_described check (
    (derived_path is null) = (derived_size_bytes is null) and (derived_path is null) = (derived_sha256 is null)
  )
);

create index import_files_import_idx on public.import_files (import_id, upload_path);
create index import_files_organization_idx on public.import_files (organization_id);
create index import_files_client_file_idx on public.import_files (client_file_id) where client_file_id is not null;

comment on table public.import_files is 'One uploaded file of an import from documents, and what became of it.';
comment on column public.import_files.upload_path is
  'Where the file sat in the upload: its folders and its name, with / between them.';
comment on column public.import_files.state is
  'uploading until its object is stored; then prepared (text taken out), and read, set aside, kept for the employee import, another company''s, or failed.';
comment on column public.import_files.document_kind is 'What the sorting step took the file for, as packages/import names it.';
comment on column public.import_files.company_cui is 'The company the file names, when it names one.';
comment on column public.import_files.text_path is 'The text taken out of the file, beside it in the imports bucket.';
comment on column public.import_files.derived_path is
  'The .docx a .doc was converted to, or the JPEG of a HEIC photograph, beside the original.';
comment on column public.import_files.input_tokens is
  'Tokens of the requests that read this file on its own, a scan or a photograph; zero for a file read with the others. The import''s totals include them.';
comment on column public.import_files.client_file_id is
  'The client file it became in the import folder, once confirmed.';

create trigger import_files_set_updated_at before update on public.import_files
  for each row execute function public.set_updated_at();

-- ADR 030's cap protects the model's bill and the download of an import folder as one ZIP.
-- The import's row is locked so that files added at once are counted one after the other. The
-- size is checked again when the API writes the stored object's real size over the one the
-- browser declared, since nothing ties the upload to the declared size.
--   IMP01  files are added only while the import is uploading
--   IMP05  an import holds at most 150 files and 100 MiB, each file at most 20 MiB
create function public.limit_import_files()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.import_status;
begin
  select i.status into v_status from public.imports i where i.id = new.import_id for update;
  if tg_op = 'INSERT' and v_status is distinct from 'uploading' then
    raise exception 'Files are added to an import only while it is uploading.' using errcode = 'IMP01';
  end if;
  if new.size_bytes > 20971520 or (
    select (tg_op = 'INSERT' and count(*) >= 150)
      or coalesce(sum(f.size_bytes) filter (where f.id <> new.id), 0) + new.size_bytes > 104857600
    from public.import_files f
    where f.import_id = new.import_id
  ) then
    raise exception 'An import holds at most 150 files and 100 MiB, each file at most 20 MiB.'
      using errcode = 'IMP05';
  end if;
  return new;
end;
$$;

create trigger import_files_limit before insert on public.import_files
  for each row execute function public.limit_import_files();

create trigger import_files_limit_size before update of size_bytes on public.import_files
  for each row when (new.size_bytes > old.size_bytes) execute function public.limit_import_files();

alter table public.client_files
  add column import_id uuid,
  add column import_path text,
  add constraint client_files_import_in_organization
    foreign key (import_id, organization_id) references public.imports (id, organization_id) on delete restrict,
  add constraint client_files_import_path_format check (
    char_length(import_path) between 1 and 1024 and import_path !~ '^/' and import_path !~ '/$'
  ),
  add constraint client_files_import_path_in_import check (import_path is null or import_id is not null);

-- Only confirming an import fills the import folder. A member's row naming an import would
-- forge files into its folder, and block that import's deletion on the foreign key.
revoke insert on table public.client_files from authenticated;
grant insert (
  id, organization_id, client_id, employee_id, name, note, owners_only, original_file_name, mime_type,
  size_bytes, sha256, uploaded_by
) on table public.client_files to authenticated;

create index client_files_import_idx on public.client_files (import_id, import_path) where import_id is not null;

comment on column public.client_files.import_id is
  'The import whose folder the file came from (ADR 030); null for a file uploaded on its own.';
comment on column public.client_files.import_path is
  'The folders the file sat in inside that upload, with / between them; null at the top of the folder.';

alter table public.imports enable row level security;
alter table public.import_files enable row level security;

revoke all on table public.imports from anon;
revoke all on table public.import_files from anon;

-- Members read; the API and its queue consumer write with the secret key, and a member's
-- decisions go through the functions of the next migration.
revoke insert, update, delete, truncate on table public.imports from authenticated;
revoke insert, update, delete, truncate on table public.import_files from authenticated;

-- The subquery on clients answers to the caller's policies, so an import into a client is seen
-- by whoever sees the client.
create policy "members read their imports"
  on public.imports for select to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and (client_id is null or exists (select 1 from public.clients c where c.id = imports.client_id))
  );

create policy "members read the files of their imports"
  on public.import_files for select to authenticated
  using (exists (select 1 from public.imports i where i.id = import_files.import_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports', 'imports', false, 20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'text/plain',
    'application/json'
  ]
);

-- Security invoker, so the policies of import_files, imports and clients decide, as they do
-- for the rows. The row first: only a path a row names is accepted. Every object of a file is
-- named after the file's id, which finds the row by its key rather than by a scan per object.
create function public.is_readable_import_path(p_path text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.import_files f
    where f.id = substring(
        p_path from '^[^/]+/[^/]+/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z]+$'
      )::uuid
      and p_path in (f.storage_path, f.text_path, f.derived_path)
  );
$$;

create function public.is_uploadable_import_path(p_path text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.import_files f
    join public.imports i on i.id = f.import_id
    where f.storage_path = p_path
      and f.state = 'uploading'
      and i.status = 'uploading'
      and (i.client_id is null or exists (
        select 1 from public.clients c where c.id = i.client_id and c.archived_at is null
      ))
  );
$$;

revoke all on function public.is_readable_import_path(text) from public, anon;
revoke all on function public.is_uploadable_import_path(text) from public, anon;
grant execute on function public.is_readable_import_path(text) to authenticated, service_role;
grant execute on function public.is_uploadable_import_path(text) to authenticated, service_role;

-- Members upload originals from the browser and read what their imports hold. Text, converted
-- files and every removal are the API's, with the secret key.
create policy "members read the files of their imports"
  on storage.objects for select to authenticated
  using (bucket_id = 'imports' and public.is_readable_import_path(name));

create policy "members upload the files of their imports"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and public.is_uploadable_import_path(name));
