-- ADR 034, "The library tasks": a part not confirmed 14 days after the client has expired, and
-- apply_instruction_import refuses it. Reading it again would charge a reading that can never be
-- confirmed, and saving changes would keep the member working on it, so both are refused too.

-- Reviewed before the client is confirmed too; only confirming waits for it.
--   ILP01  the part is not ready for review
--   ILP02  the part was saved since the caller read it
--   ILP04  the part expired, 14 days after the client was confirmed
create or replace function public.save_import_library_part_changes(
  p_import_id uuid,
  p_part public.import_library_part,
  p_expected_version integer,
  p_changes jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if v_part.status not in ('to_review', 'nothing_new') or v_part.proposal is null then
    raise exception 'The library part is not ready for review.' using errcode = 'ILP01';
  end if;
  if v_import.confirmed_at < now() - interval '14 days' then
    raise exception 'The library part expired 14 days after the client was confirmed.' using errcode = 'ILP04';
  end if;
  if v_part.version <> p_expected_version then
    raise exception 'The library part was saved since it was read.' using errcode = 'ILP02';
  end if;
  update public.import_library_parts
  set changes = p_changes, version = version + 1
  where import_id = p_import_id and part = p_part;
  return v_part.version + 1;
end;
$$;

-- Answers the attempt the API sends the part's message for.
--   ILP04  the part expired, 14 days after the client was confirmed
--   ILP06  the part has not failed, or its import is no longer open
create or replace function public.retry_import_library_part(p_import_id uuid, p_part public.import_library_part)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if v_part.status <> 'failed' or v_import.status not in ('ready', 'confirmed') then
    raise exception 'Only a failed library part of an open import is read again.' using errcode = 'ILP06';
  end if;
  if v_import.confirmed_at < now() - interval '14 days' then
    raise exception 'The library part expired 14 days after the client was confirmed.' using errcode = 'ILP04';
  end if;
  update public.import_library_parts
  set status = 'reading', attempt = attempt + 1, failure_reason = null, failed_at = null
  where import_id = p_import_id and part = p_part;
  return v_part.attempt + 1;
end;
$$;
