-- Client files (ADR 013): what a provider keeps about a client that the app did not write,
-- stored as uploaded, and never read by the app. Not documents: no type, no revisions.

create table public.client_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null,
  name text not null constraint client_files_name_length check (char_length(btrim(name)) between 1 and 200),
  note text constraint client_files_note_length check (char_length(btrim(note)) between 1 and 2000),
  owners_only boolean not null default false,
  original_file_name text not null
    constraint client_files_original_file_name_length check (char_length(original_file_name) between 1 and 255),
  mime_type text not null constraint client_files_mime_type_allowed check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  )),
  size_bytes integer not null constraint client_files_size_range check (size_bytes between 1 and 20971520),
  sha256 text not null constraint client_files_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Made of ids and the type only, so no character of a user's file name reaches Storage.
  storage_path text generated always as (
    organization_id::text || '/' || client_id::text || '/' || id::text || '.' ||
    case mime_type
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
      when 'application/msword' then 'doc'
      when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
      when 'application/vnd.ms-excel' then 'xls'
    end
  ) stored not null,
  -- During an impersonation this records the platform admin, as `created_by` does elsewhere.
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_files_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint client_files_storage_path_key unique (storage_path)
);

create index client_files_client_id_idx on public.client_files (client_id, created_at desc);
create index client_files_organization_id_idx on public.client_files (organization_id);

comment on table public.client_files is
  'Files about a client that the app did not write: uploaded, named, downloaded, deleted (ADR 013).';

create trigger client_files_set_updated_at before update on public.client_files
  for each row execute function public.set_updated_at();

create trigger client_files_protect_archived_client
  before insert or update or delete on public.client_files
  for each row execute function public.protect_rows_of_archived_client();

-- Nobody but the owners could see a lead, so its files start as theirs and stay so until
-- the lead is promoted. A policy could not change the flag's meaning per stage and still let
-- the API name the reason. Runs as its owner, as the archived-client check does.
--   CFL01  a lead's file is for owners only
create function public.protect_client_file_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.owners_only and exists (
    select 1 from public.clients c where c.id = new.client_id and c.stage = 'lead'
  ) then
    raise exception 'The files of a lead are for owners only.' using errcode = 'CFL01';
  end if;
  if tg_op = 'UPDATE'
    and new.owners_only is distinct from old.owners_only
    and (select auth.uid()) is not null
    and not public.is_organization_owner()
  then
    raise exception 'Only an owner changes who sees a file.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_client_file_visibility() from public, anon, authenticated;

create trigger client_files_protect_visibility
  before insert or update on public.client_files
  for each row execute function public.protect_client_file_visibility();

alter table public.client_files enable row level security;
revoke all on table public.client_files from anon;

create policy "members read their client files, owners also theirs alone"
  on public.client_files for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (not owners_only or (select public.is_organization_owner()))
  );

create policy "members upload files for their active clients"
  on public.client_files for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and uploaded_by = (select auth.uid())
    and (not owners_only or (select public.is_organization_owner()))
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
        and (c.stage = 'client' or (select public.is_organization_owner()))
    )
  );

create policy "uploaders and owners change the files they see"
  on public.client_files for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and (not owners_only or (select public.is_organization_owner()))
    and (uploaded_by = (select auth.uid()) or (select public.is_organization_owner()))
  )
  with check (organization_id = public.current_organization_id());

create policy "uploaders and owners delete the files they see"
  on public.client_files for delete to authenticated
  using (
    organization_id = public.current_organization_id()
    and (not owners_only or (select public.is_organization_owner()))
    and (uploaded_by = (select auth.uid()) or (select public.is_organization_owner()))
  );

revoke update on table public.client_files from authenticated;
grant update (name, note, owners_only) on table public.client_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-files', 'client-files', false, 20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
);

-- The row first: the policies accept only the path a row of the caller's organization names.
create function public.is_readable_client_file_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_files f
    where f.storage_path = p_path
      and f.organization_id = public.current_organization_id()
      and (not f.owners_only or public.is_organization_owner())
  );
$$;

create function public.is_writable_client_file_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_files f
    join public.clients c on c.id = f.client_id
    where f.storage_path = p_path
      and f.organization_id = public.current_organization_id()
      and (not f.owners_only or public.is_organization_owner())
      and (f.uploaded_by = auth.uid() or public.is_organization_owner())
      and c.archived_at is null
  );
$$;

revoke all on function public.is_readable_client_file_path(text) from public, anon;
revoke all on function public.is_writable_client_file_path(text) from public, anon;
grant execute on function public.is_readable_client_file_path(text) to authenticated, service_role;
grant execute on function public.is_writable_client_file_path(text) to authenticated, service_role;

create policy "members read the client files they can see"
  on storage.objects for select to authenticated
  using (bucket_id = 'client-files' and public.is_readable_client_file_path(name));

create policy "members upload the client files of their rows"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files' and public.is_writable_client_file_path(name));

create policy "members remove the client files they may change"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-files' and public.is_writable_client_file_path(name));
