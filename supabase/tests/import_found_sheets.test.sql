begin;
select plan(4);

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Brutăria Dulce SRL', '1590082', 'client');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client',
    'cccccccc-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'employees',
    'cccccccc-0000-4000-8000-000000000001', true);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Dosar/fisa.jpg', 'fisa.jpg', 'image/jpeg', 1000, repeat('a', 64));

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, source_file_id) values
  ('f0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001',
    'Din documentația importată pe 01.11.2026/Dosar/fisa.jpg', 'fisa.jpg', 'image/jpeg', 1000, repeat('a', 64),
    'f0000000-0000-4000-8000-000000000001');

select has_column('public', 'import_files', 'source_file_id', 'an import''s file names the found photograph it copies');

select fk_ok('public', 'import_files', 'source_file_id', 'public', 'import_files', 'id', 'and that photograph is a file of an import');

select is(
  (select source_file_id from public.import_files where id = 'f0000000-0000-4000-8000-000000000002'),
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'the copy keeps the photograph it was taken from'
);

delete from public.import_files where id = 'f0000000-0000-4000-8000-000000000001';

select is(
  (select source_file_id from public.import_files where id = 'f0000000-0000-4000-8000-000000000002'),
  null,
  'and stays when that photograph''s row goes'
);

select * from finish();
rollback;
