-- A sheet photograph a client import found in the documentation pack, taken into an employee
-- import (ADR 032). The employee import holds a copy of it as one of its own files, so its
-- bucket policies, its caps and its clean-up stay those of an uploaded file; this column only
-- says which found photograph the copy is, so that one taken is not offered again.

alter table public.import_files
  add column source_file_id uuid references public.import_files (id) on delete set null;

create index import_files_source_file_idx on public.import_files (source_file_id) where source_file_id is not null;

comment on column public.import_files.source_file_id is
  'The file of a confirmed client import this file is a copy of: a training sheet photograph found in the client''s documentation pack (ADR 032). A found photograph is offered while no employee import that is not abandoned or failed holds a copy of it.';
