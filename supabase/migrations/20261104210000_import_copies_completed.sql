-- ADR 037: an improvement copy counts only once its record.json is written. The record is made
-- before the objects are copied, so a copy that stopped halfway still names a folder the
-- 12-month clean-up empties; completed_at tells the clean-up which copies to write again before
-- it removes the import's own objects.

alter table public.import_copies
  add column completed_at timestamptz,
  add constraint import_copies_completed_after_written check (completed_at is null or completed_at >= written_at);

comment on column public.import_copies.written_at is
  'When the API last began writing the copy; completed_at says whether it finished.';
comment on column public.import_copies.completed_at is
  'When the API finished writing the copy, its record.json last; null while it is being written, or after it stopped halfway.';

create or replace function public.record_import_copy(p_import_id uuid, p_part public.import_library_part default null)
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
  set written_at = now(), expires_at = excluded.expires_at, removed_at = null, completed_at = null
  returning expires_at into v_expires_at;
  return v_expires_at;
end;
$$;

comment on function public.record_import_copy(uuid, public.import_library_part) is
  'Records that the API begins writing the improvement copy of the import, or of its part named, and returns when it expires: 12 months after the import or part ended. The copy is incomplete until complete_import_copy.';

--   P0002  no copy of the import, or of its part named, is recorded
create function public.complete_import_copy(p_import_id uuid, p_part public.import_library_part default null)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
begin
  update public.import_copies c
  set completed_at = now()
  where c.import_id = p_import_id and c.part is not distinct from p_part and c.removed_at is null
  returning c.completed_at into v_completed_at;
  if not found then
    raise exception 'No copy of the import or of its part is recorded.' using errcode = 'P0002';
  end if;
  return v_completed_at;
end;
$$;

comment on function public.complete_import_copy(uuid, public.import_library_part) is
  'Records that the API finished writing the improvement copy of the import, or of its part named, its record.json last, and returns when.';

revoke all on function public.complete_import_copy(uuid, public.import_library_part) from public, anon, authenticated;
grant execute on function public.complete_import_copy(uuid, public.import_library_part) to service_role;

-- The rule "Expensive import" (ADR 037) is checked as each reading ends, the import's and each
-- part's, and two can end together: the update that sets this from null decides who alerts.
alter table public.imports add column expensive_alerted_at timestamptz;

comment on column public.imports.expensive_alerted_at is
  'When support was told that the import with its parts cost more than the alert''s line (ADR 037); null until then.';

-- A report and the alert's mark change nothing of the import: the 14 days of a ready import and
-- the hours before a part counts as stalled run from updated_at, and must not start again.
drop trigger imports_set_updated_at on public.imports;
create trigger imports_set_updated_at before update on public.imports
  for each row
  when (
    (to_jsonb(old) - array['updated_at', 'reported_at', 'reported_by', 'expensive_alerted_at'])
      is distinct from (to_jsonb(new) - array['updated_at', 'reported_at', 'reported_by', 'expensive_alerted_at'])
  )
  execute function public.set_updated_at();

drop trigger import_library_parts_set_updated_at on public.import_library_parts;
create trigger import_library_parts_set_updated_at before update on public.import_library_parts
  for each row
  when (
    (to_jsonb(old) - array['updated_at', 'reported_at', 'reported_by'])
      is distinct from (to_jsonb(new) - array['updated_at', 'reported_at', 'reported_by'])
  )
  execute function public.set_updated_at();
