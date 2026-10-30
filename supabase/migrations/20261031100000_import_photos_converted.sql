-- A JPEG's own object already ends in .jpg, so its converted copy is <id>.jpeg.
alter table public.import_files
  drop constraint import_files_derived_path_beside,
  add constraint import_files_derived_path_beside check (
    derived_path is null
    or (mime_type = 'application/msword' and derived_path = regexp_replace(storage_path, '\.[a-z]+$', '.docx'))
    or (mime_type in ('image/png', 'image/heic', 'image/heif') and derived_path = regexp_replace(storage_path, '\.[a-z]+$', '.jpg'))
    or (mime_type = 'image/jpeg' and derived_path = regexp_replace(storage_path, '\.[a-z]+$', '.jpeg'))
  );

comment on column public.import_files.derived_path is
  'The .docx a .doc was converted to, or the upright JPEG of a photograph, beside the original.';
