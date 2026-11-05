-- ADR 037: the improvement copy of every import and library part, kept 12 months in a bucket of
-- its own, and what the reading and the member's report leave on the import and its parts.

alter table public.imports
  add column reading_version jsonb
    constraint imports_reading_version_object check (jsonb_typeof(reading_version) = 'object'),
  add column reading_flags jsonb
    constraint imports_reading_flags_object check (jsonb_typeof(reading_flags) = 'object'),
  add column reported_at timestamptz,
  add column reported_by uuid references auth.users (id) on delete set null,
  -- One way only: deleting the member's account nulls reported_by and keeps the report.
  add constraint imports_reported_by_with_time check (reported_by is null or reported_at is not null);

comment on column public.imports.reading_version is
  'The model of each step and a short hash of the prompts and schemas that read the import (ADR 037). Two readings with the same version ran the same code.';
comment on column public.imports.reading_flags is
  'Value-free counts that describe the reading (ADR 037): files by sorted kind, unreadable and set aside, what was found, and the checks'' flags. Never what was read.';
comment on column public.imports.reported_at is
  'When a member reported a problem with the import, through the API (ADR 037); reported_by is who, null once that account is deleted.';

alter table public.import_library_parts
  add column quality jsonb
    constraint import_library_parts_quality_object check (jsonb_typeof(quality) = 'object'),
  add column reading_version jsonb
    constraint import_library_parts_reading_version_object check (jsonb_typeof(reading_version) = 'object'),
  add column reading_flags jsonb
    constraint import_library_parts_reading_flags_object check (jsonb_typeof(reading_flags) = 'object'),
  add column reported_at timestamptz,
  add column reported_by uuid references auth.users (id) on delete set null,
  add constraint import_library_parts_reported_by_with_time check (reported_by is null or reported_at is not null);

comment on column public.import_library_parts.quality is
  'Value-free counts per section of the proposal: how many proposed values were changed, unticked or kept, as on imports.';
comment on column public.import_library_parts.reading_version is
  'The model and a short hash of the prompts and schemas that read the part (ADR 037).';
comment on column public.import_library_parts.reading_flags is
  'Value-free counts that describe the part''s reading (ADR 037): what was found, and the checks'' flags. Never what was read.';
comment on column public.import_library_parts.reported_at is
  'When a member reported a problem with the part, through the API (ADR 037); reported_by is who, null once that account is deleted.';

-- Not columns of imports: an abandoned or failed import's row is deleted 14 days after it ends
-- (ADR 030), and its copy stays 12 months, so the copy's record outlives the row and has no
-- foreign key to it.
create table public.import_copies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  import_id uuid not null,
  part public.import_library_part,
  written_at timestamptz not null default now(),
  expires_at timestamptz not null,
  removed_at timestamptz,
  constraint import_copies_import_part_key unique nulls not distinct (import_id, part),
  constraint import_copies_removed_after_written check (removed_at is null or removed_at >= written_at)
);

create index import_copies_organization_idx on public.import_copies (organization_id);
create index import_copies_kept_idx on public.import_copies (expires_at) where removed_at is null;

comment on table public.import_copies is
  'The improvement copy of an import or of one of its library parts (ADR 037), in the import-copies bucket under <organization>/<import>/, a part''s under <organization>/<import>/parts/<part>/.';
comment on column public.import_copies.part is 'The library part the copy is of; null for the import''s own copy.';
comment on column public.import_copies.written_at is 'When the API last recorded the copy written.';
comment on column public.import_copies.expires_at is
  '12 months after the import or part ended; the daily clean-up removes the copy after it.';
comment on column public.import_copies.removed_at is 'When the API reported the copy''s objects removed.';

alter table public.import_copies enable row level security;

revoke all on table public.import_copies from anon, authenticated;

-- Private, with no policy on storage.objects: no member's or participant's token reaches it, only
-- the secret key. The same files and limits as imports, whose files it copies, beside the JSON and
-- text it writes of its own.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-copies', 'import-copies', false, 26214400,
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

-- A failed part read again and confirmed is recorded again, its 12 months from the confirmation.
-- A part not confirmed ends with its import, or 14 days after its import's confirmation, when it
-- expires (ADR 034).
--   P0002  no such import, or no such part of it
--   IMP09  the import or the part has not ended
create function public.record_import_copy(p_import_id uuid, p_part public.import_library_part default null)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
  v_ended_at timestamptz;
  v_expires_at timestamptz;
begin
  select i.* into v_import from public.imports i where i.id = p_import_id;
  if not found then
    raise exception 'No such import.' using errcode = 'P0002';
  end if;
  if p_part is null then
    v_ended_at := case v_import.status
      when 'confirmed' then v_import.confirmed_at
      when 'abandoned' then v_import.abandoned_at
      when 'failed' then v_import.failed_at
    end;
  else
    select p.* into v_part from public.import_library_parts p where p.import_id = p_import_id and p.part = p_part;
    if not found then
      raise exception 'No such library part of the import.' using errcode = 'P0002';
    end if;
    v_ended_at := case
      when v_part.status = 'confirmed' then v_part.confirmed_at
      when v_part.status = 'failed' then v_part.failed_at
      when v_import.status = 'abandoned' then v_import.abandoned_at
      when v_import.status = 'failed' then v_import.failed_at
      when v_import.status = 'confirmed' and v_import.confirmed_at <= now() - interval '14 days'
        then v_import.confirmed_at + interval '14 days'
    end;
  end if;
  if v_ended_at is null then
    raise exception 'The import or the library part has not ended.' using errcode = 'IMP09';
  end if;
  insert into public.import_copies (organization_id, import_id, part, expires_at)
  values (v_import.organization_id, p_import_id, p_part, v_ended_at + interval '12 months')
  on conflict (import_id, part) do update
  set written_at = now(), expires_at = excluded.expires_at, removed_at = null
  returning expires_at into v_expires_at;
  return v_expires_at;
end;
$$;

comment on function public.record_import_copy(uuid, public.import_library_part) is
  'Records that the API wrote the improvement copy of the import, or of its part named, and returns when it expires: 12 months after the import or part ended.';

create function public.list_expired_import_copies()
returns table (
  copy_id uuid,
  organization_id uuid,
  import_id uuid,
  part public.import_library_part,
  folder text
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.organization_id, c.import_id, c.part,
    c.organization_id::text || '/' || c.import_id::text || coalesce('/parts/' || c.part::text, '')
  from public.import_copies c
  where c.removed_at is null and c.expires_at <= now()
  order by c.expires_at, c.id;
$$;

comment on function public.list_expired_import_copies() is
  'The improvement copies past their 12 months and not yet removed, each with its folder in the import-copies bucket, without the final slash, for the API to empty before it calls mark_import_copies_removed. An import''s folder holds its parts'' folders under parts/, which expire on their own. Changes nothing.';

create function public.mark_import_copies_removed(p_copy_ids uuid[])
returns setof uuid
language sql
set search_path = ''
as $$
  update public.import_copies c
  set removed_at = now()
  where c.id = any (p_copy_ids) and c.removed_at is null and c.expires_at <= now()
  returning c.id;
$$;

comment on function public.mark_import_copies_removed(uuid[]) is
  'Records that the API removed the objects of the copies named, if list_expired_import_copies would still list them. Returns the ids marked.';

revoke all on function public.record_import_copy(uuid, public.import_library_part) from public, anon, authenticated;
revoke all on function public.list_expired_import_copies() from public, anon, authenticated;
revoke all on function public.mark_import_copies_removed(uuid[]) from public, anon, authenticated;
grant execute on function public.record_import_copy(uuid, public.import_library_part) to service_role;
grant execute on function public.list_expired_import_copies() to service_role;
grant execute on function public.mark_import_copies_removed(uuid[]) to service_role;
