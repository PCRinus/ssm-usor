-- A client's files take 25 MiB each, as an employee import's sheets do (ADR 032): a scanned PDF of
-- the client's training sheets is kept whole among the client's files.
alter table public.client_files
  drop constraint client_files_size_range,
  add constraint client_files_size_range check (size_bytes between 1 and 26214400);

update storage.buckets set file_size_limit = 26214400 where id = 'client-files';
