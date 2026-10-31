-- The caps of an import depend on its kind (ADR 032): an employee import holds a client's sheet
-- photographs, at most 500 files and 1 GiB, each at most 25 MiB; a client import keeps ADR 030's
-- 150 files and 100 MiB, each at most 20 MiB. The column and the bucket allow the larger file;
-- the trigger holds each kind to its own.
alter table public.import_files
  drop constraint import_files_size_range,
  add constraint import_files_size_range check (size_bytes between 1 and 26214400);

update storage.buckets set file_size_limit = 26214400 where id = 'imports';

-- The import's row is locked so that files added at once are counted one after the other. The
-- size is checked again when the API writes the stored object's real size over the one the
-- browser declared, since nothing ties the upload to the declared size.
--   IMP01  files are added only while the import is uploading
--   IMP05  a client import holds at most 150 files and 100 MiB, each file at most 20 MiB; an
--          employee import at most 500 files and 1 GiB, each file at most 25 MiB
create or replace function public.limit_import_files()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.import_status;
  v_kind public.import_kind;
  v_files integer;
  v_total_bytes bigint;
  v_file_bytes integer;
begin
  select i.status, i.kind into v_status, v_kind from public.imports i where i.id = new.import_id for update;
  if tg_op = 'INSERT' and v_status is distinct from 'uploading' then
    raise exception 'Files are added to an import only while it is uploading.' using errcode = 'IMP01';
  end if;
  if v_kind = 'employees' then
    v_files := 500;
    v_total_bytes := 1073741824;
    v_file_bytes := 26214400;
  else
    v_files := 150;
    v_total_bytes := 104857600;
    v_file_bytes := 20971520;
  end if;
  if new.size_bytes > v_file_bytes or (
    select (tg_op = 'INSERT' and count(*) >= v_files)
      or coalesce(sum(f.size_bytes) filter (where f.id <> new.id), 0) + new.size_bytes > v_total_bytes
    from public.import_files f
    where f.import_id = new.import_id
  ) then
    raise exception 'An import of this kind holds at most % files and % MiB, each file at most % MiB.',
      v_files, v_total_bytes / 1048576, v_file_bytes / 1048576
      using errcode = 'IMP05';
  end if;
  return new;
end;
$$;
