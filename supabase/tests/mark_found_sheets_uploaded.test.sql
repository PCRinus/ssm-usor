begin;
select plan(6);

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Brutăria Dulce SRL', '1590082', 'client');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'employees',
    'cccccccc-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'employees',
    'cccccccc-0000-4000-8000-000000000001', true);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Din documentația importată pe 01.11.2026/fisa 1.jpg', 'fisa 1.jpg', 'image/jpeg', 1000, repeat('a', 64)),
  ('f0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Din documentația importată pe 01.11.2026/fisa 2.jpg', 'fisa 2.jpg', 'image/jpeg', 1000, repeat('b', 64)),
  ('f0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001',
    'Din documentația importată pe 01.11.2026/fisa 3.jpg', 'fisa 3.jpg', 'image/jpeg', 1000, repeat('c', 64));

select lives_ok(
  $$select public.mark_found_sheets_uploaded('10000000-0000-4000-8000-000000000001',
    array['f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002']::uuid[])$$,
  'the copies of an import still uploading are marked'
);

select is(
  (select array_agg(state order by id)::text[] from public.import_files
   where import_id = '10000000-0000-4000-8000-000000000001'),
  array['uploaded', 'uploaded'],
  'as uploaded'
);

select throws_ok(
  $$select public.mark_found_sheets_uploaded('10000000-0000-4000-8000-000000000001',
    array['f0000000-0000-4000-8000-000000000001']::uuid[])$$,
  'IMP01', null,
  'a copy the start of the reading took already is turned away'
);

update public.imports set status = 'preparing', started_at = now() where id = '10000000-0000-4000-8000-000000000002';

select throws_ok(
  $$select public.mark_found_sheets_uploaded('10000000-0000-4000-8000-000000000002',
    array['f0000000-0000-4000-8000-000000000003']::uuid[])$$,
  'IMP01', null,
  'the copies of an import whose reading started are turned away'
);

select is(
  (select state::text from public.import_files where id = 'f0000000-0000-4000-8000-000000000003'),
  'uploading',
  'and stay unmarked'
);

select ok(
  not has_function_privilege('authenticated', 'public.mark_found_sheets_uploaded(uuid, uuid[])', 'execute'),
  'only the API marks copies'
);

select * from finish();
rollback;
