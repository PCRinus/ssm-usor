-- The copies of found sheets (ADR 032) take a while to land in the imports bucket, and the member
-- can start the reading meanwhile. Under the import's lock, a start that has moved it on turns the
-- copies away, rather than leaving them marked in an import that never reads them.
--   IMP01  the import is no longer uploading, or a copy's row is gone or was moved on
create function public.mark_found_sheets_uploaded(p_import_id uuid, p_file_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status public.import_status;
  v_marked integer;
begin
  select i.status into v_status from public.imports i where i.id = p_import_id for update;
  if v_status is distinct from 'uploading' then
    raise exception 'Files are added to an import only while it is uploading.' using errcode = 'IMP01';
  end if;
  update public.import_files
  set state = 'uploaded'
  where import_id = p_import_id and id = any (p_file_ids) and state = 'uploading';
  get diagnostics v_marked = row_count;
  if v_marked <> cardinality(p_file_ids) then
    raise exception 'Files are added to an import only while it is uploading.' using errcode = 'IMP01';
  end if;
end;
$$;

comment on function public.mark_found_sheets_uploaded(uuid, uuid[]) is
  'Marks the copies of found sheets an employee import holds as uploaded once their objects are copied, only while the import is still uploading (ADR 032); raises IMP01 otherwise, and the API then removes the copies.';

revoke all on function public.mark_found_sheets_uploaded(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_found_sheets_uploaded(uuid, uuid[]) to service_role;
