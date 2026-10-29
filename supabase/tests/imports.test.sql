begin;
select plan(103);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage, trade_register_number, contact_phone, worker_training_not_applicable, archived_at) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Brutăria Dulce SRL', '1590082', 'client', 'J40/1/2020', '0711111111', true, null),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Arhivat SRL', '14399840', 'client', null, null, false, now()),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Pistă SRL', '5022670', 'lead', null, null, false, null),
  ('cccccccc-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Arhivat Mai Târziu SRL', '5022671', 'client', null, null, false, null),
  ('cccccccc-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000002', 'Client of B', '1590082', 'client', null, null, false, null);

insert into public.job_positions (id, organization_id, client_id, name) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Vânzător');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create or replace function pg_temp.path_of(file_id text)
returns text language sql as $$
  select storage_path from public.import_files where id = file_id::uuid;
$$;

create temp table applied (result jsonb);
grant select, insert on applied to authenticated;
create temp table split (result jsonb);
grant select, insert on split to authenticated;

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by, company_cui) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '18547290'),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001', '1590082'),
  ('10000000-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', 'client', null, false, 'aaaaaaaa-0000-4000-8000-000000000002', null),
  ('10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001', null),
  ('10000000-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000004', true, 'bbbbbbbb-0000-4000-8000-000000000001', '5022671'),
  ('10000000-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001', '14399840'),
  ('10000000-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '1590082');

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Dosar SSM/Decizii/Decizia 1.1.doc', 'Decizia 1.1.doc', 'application/msword', 40960, repeat('a', 64)),
  ('f0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Dosar SSM/Poze/IMG_0042.HEIC', 'IMG_0042.HEIC', 'image/heic', 2097152, repeat('b', 64)),
  ('f0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Coperta.pdf', 'Coperta.pdf', 'application/pdf', 1024, repeat('c', 64)),
  ('f0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Dosar SSM/Alta firma/Contract.pdf', 'Contract.pdf', 'application/pdf', 2048, repeat('d', 64)),
  ('f0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001',
    'Decizia 1.2.docx', 'Decizia 1.2.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 8192, repeat('e', 64));

update public.import_files set state = 'read', document_kind = 'decision', page_count = 3, is_scan = false,
  text_path = regexp_replace(storage_path, '\.doc$', '.json'),
  derived_path = regexp_replace(storage_path, '\.doc$', '.docx'), derived_size_bytes = 30000, derived_sha256 = repeat('1', 64)
where id = 'f0000000-0000-4000-8000-000000000001';
update public.import_files set state = 'for_employees', document_kind = 'training_sheet', is_scan = true,
  derived_path = regexp_replace(storage_path, '\.heic$', '.jpg'), derived_size_bytes = 900000, derived_sha256 = repeat('2', 64)
where id = 'f0000000-0000-4000-8000-000000000002';
update public.import_files set state = 'set_aside', document_kind = 'cover', reason = 'Copertă fără date despre client.'
where id = 'f0000000-0000-4000-8000-000000000003';
update public.import_files set state = 'other_company', company_name = 'Altă Firmă SRL', company_cui = '14399840'
where id = 'f0000000-0000-4000-8000-000000000004';

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"client": {}}'
where id in (
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000007'
);

insert into storage.objects (bucket_id, name)
select 'imports', text_path from public.import_files where id = 'f0000000-0000-4000-8000-000000000001';

select has_table('public', 'imports', 'imports exist');
select has_table('public', 'import_files', 'and their files');
select has_column('public', 'client_files', 'import_id', 'a client file names the import it came from');
select has_column('public', 'client_files', 'import_path', 'and the folder it sat in');

select results_eq(
  $$ select public, file_size_limit from storage.buckets where id = 'imports' $$,
  $$ values (false, 20971520::bigint) $$,
  'the imports bucket is private and takes 20 MiB a file'
);

select is(
  pg_temp.path_of('f0000000-0000-4000-8000-000000000003'),
  '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003.pdf',
  'a file is stored under ids and the type, never under its own name'
);

select throws_ok(
  $$ update public.import_files set text_path = 'elsewhere/x.txt' where id = 'f0000000-0000-4000-8000-000000000003' $$,
  '23514',
  null,
  'its text sits beside it'
);

select throws_ok(
  $$ update public.import_files set derived_path = regexp_replace(storage_path, '\.pdf$', '.jpg'),
       derived_size_bytes = 1, derived_sha256 = repeat('3', 64)
     where id = 'f0000000-0000-4000-8000-000000000003' $$,
  '23514',
  null,
  'only a .doc or a HEIC has a converted file'
);

select throws_ok(
  $$ insert into public.imports (organization_id, kind, client_id, into_existing_client)
     values ('11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000002', true) $$,
  'CLA01',
  null,
  'an archived client takes no import, not even from the secret key'
);

select throws_ok(
  $$ insert into public.imports (organization_id, kind, client_id, into_existing_client)
     values ('11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000003', true) $$,
  'CLL01',
  null,
  'nor does a lead'
);

select throws_ok(
  $$ insert into public.imports (organization_id, kind, into_existing_client)
     values ('11111111-0000-4000-8000-000000000001', 'employees', false) $$,
  '23514',
  null,
  'an employee import is always into an existing client'
);

select throws_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256)
     values ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Târziu.pdf', 'Târziu.pdf', 'application/pdf', 10, repeat('f', 64)) $$,
  'IMP01',
  null,
  'files are added only while the import is uploading'
);

select throws_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256)
     values ('10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Plan.dwg', 'Plan.dwg', 'application/acad', 10, repeat('f', 64)) $$,
  '23514',
  'new row for relation "import_files" violates check constraint "import_files_mime_type_allowed"',
  'a drawing is not uploaded'
);

select throws_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256)
     select '10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Scan ' || n || '.pdf', 'Scan ' || n || '.pdf',
       'application/pdf', 20971520, repeat('f', 64)
     from generate_series(1, 5) n $$,
  'IMP05',
  null,
  'an import holds at most 100 MiB'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select id from public.imports order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid),
            ('10000000-0000-4000-8000-000000000004'::uuid), ('10000000-0000-4000-8000-000000000005'::uuid),
            ('10000000-0000-4000-8000-000000000006'::uuid), ('10000000-0000-4000-8000-000000000007'::uuid) $$,
  'a specialist sees every import of their organization and none of another'
);

select results_eq(
  $$ select count(*)::int from public.import_files $$,
  $$ values (5) $$,
  'and their files'
);

select throws_ok(
  $$ insert into public.imports (organization_id, kind, into_existing_client)
     values ('11111111-0000-4000-8000-000000000001', 'client', false) $$,
  '42501',
  null,
  'members do not write imports themselves'
);

select throws_ok(
  $$ update public.imports set status = 'ready' where id = '10000000-0000-4000-8000-000000000004' $$,
  '42501',
  null,
  'nor move them along'
);

select throws_ok(
  $$ update public.import_files set state = 'read' where id = 'f0000000-0000-4000-8000-000000000005' $$,
  '42501',
  null,
  'nor their files'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('imports',
     '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000004/f0000000-0000-4000-8000-000000000005.docx') $$,
  'a member uploads a file where its row says, while the import is uploading'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('imports',
     '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000004/f0000000-0000-4000-8000-000000000099.docx') $$,
  '42501',
  null,
  'but nowhere a row does not name'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('imports',
     '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003.pdf') $$,
  '42501',
  null,
  'nor once the import has moved past uploading'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('imports',
     '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.docx') $$,
  '42501',
  null,
  'and never the converted file, which is the API''s'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select results_eq(
  $$ select id from public.imports $$,
  $$ values ('10000000-0000-4000-8000-000000000003'::uuid) $$,
  'another organization sees only its own import'
);

select is(
  (select count(*)::int from public.import_files),
  0,
  'and no file of ours'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'imports'),
  0,
  'nor any object'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('imports',
     '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000004/f0000000-0000-4000-8000-000000000005.docx') $$,
  '42501',
  null,
  'nor uploads into our import'
);

select throws_ok(
  $$ select public.save_import_changes('10000000-0000-4000-8000-000000000002', 0, '{}') $$,
  'P0002',
  null,
  'nor saves a review of ours'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{"client": {}}') $$,
  'P0002',
  null,
  'nor confirms one'
);

select throws_ok(
  $$ select public.split_import('10000000-0000-4000-8000-000000000001', array['f0000000-0000-4000-8000-000000000004']::uuid[]) $$,
  'P0002',
  null,
  'nor splits one'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'imports'),
  2,
  'a member reads the objects of their organization''s imports, their text too'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  public.save_import_changes('10000000-0000-4000-8000-000000000002', 0, '{"client": {"locality": "kept"}}'),
  1,
  'a member saves their review, which counts a version'
);

select throws_ok(
  $$ select public.save_import_changes('10000000-0000-4000-8000-000000000002', 0, '{}') $$,
  'IMP02',
  null,
  'a save made on an older version is refused'
);

select throws_ok(
  $$ select public.save_import_changes('10000000-0000-4000-8000-000000000004', 0, '{}') $$,
  'IMP01',
  null,
  'and so is one before the import is ready'
);

select lives_ok(
  $$ insert into split select public.split_import('10000000-0000-4000-8000-000000000001',
       array['f0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004']::uuid[]) $$,
  'a member splits another company''s files off into a new import'
);

select results_eq(
  $$ select i.organization_id, i.kind::text, i.status::text, i.client_id, i.into_existing_client, i.source_import_id, i.created_by
     from public.imports i where i.id = (select (result ->> 'import_id')::uuid from split) $$,
  $$ values ('11111111-0000-4000-8000-000000000001'::uuid, 'client', 'uploading', null::uuid, false,
       '10000000-0000-4000-8000-000000000001'::uuid, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'for a new client, uploading until the objects are copied, created by that member'
);

select results_eq(
  $$ select f.upload_path, f.original_file_name, f.mime_type, f.size_bytes, f.state::text,
       (select result -> 'files' from split)
     from public.import_files f where f.import_id = (select (result ->> 'import_id')::uuid from split) $$,
  $$ select 'Dosar SSM/Alta firma/Contract.pdf', 'Contract.pdf', 'application/pdf', 2048, 'uploading',
       jsonb_build_array(jsonb_build_object('source_path', pg_temp.path_of('f0000000-0000-4000-8000-000000000004'),
         'target_path', f.storage_path))
     from public.import_files f where f.import_id = (select (result ->> 'import_id')::uuid from split) $$,
  'which holds those files once each, and returns the objects to copy'
);

select throws_ok(
  $$ select public.split_import('10000000-0000-4000-8000-000000000001', array['f0000000-0000-4000-8000-000000000004']::uuid[]) $$,
  'IMP08',
  null,
  'files are split off once'
);

select throws_ok(
  $$ select public.split_import('10000000-0000-4000-8000-000000000001',
       array['f0000000-0000-4000-8000-000000000003']::uuid[]) $$,
  'IMP07',
  null,
  'a file not about another company is not split off'
);

select throws_ok(
  $$ select public.split_import('10000000-0000-4000-8000-000000000001',
       array['f0000000-0000-4000-8000-000000000005']::uuid[]) $$,
  'IMP07',
  null,
  'nor is a file of another import'
);

select throws_ok(
  $$ select public.split_import('10000000-0000-4000-8000-000000000004',
       array['f0000000-0000-4000-8000-000000000005']::uuid[]) $$,
  'IMP01',
  null,
  'and an import is not split before its files are sorted'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{"client": {}}') $$,
  'IMP02',
  null,
  'a confirmation made on an older version is refused'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000006', 0, '{"client": {}}') $$,
  'IMP03',
  null,
  'documents about another company do not go into the client'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 1, '{"client": {"cui": "14399840"}}') $$,
  'IMP03',
  null,
  'nor does a payload naming another CUI'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000007', 0, '{"client": {"legal_name": "Brutăria Dulce", "cui": "1590082"}}') $$,
  'IMP04',
  null,
  'a new client whose CUI the organization already has is refused'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000007', 0, '{"client": {"legal_name": "Nou SRL", "cui": "18547291", "colour": "red"}}') $$,
  '22023',
  null,
  'a payload field the contract does not name is refused'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000007', 0,
       '{"client": {"legal_name": "Nou SRL", "cui": "18547291"}, "equipment": [{"job_position_key": "missing", "risk": "x", "item": "y", "duration_months": 1}]}') $$,
  '22023',
  null,
  'and so is a key no item carries'
);

select pg_temp.act_as_postgres();
update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000004';
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0,
       '{"client": {"legal_name": "Atelier Lemn Viu SRL", "cui": "18547290"},
         "job_positions": [{"key": "p1", "name": "Tâmplar", "needs_protective_equipment": true}]}') $$,
  '22023',
  null,
  'a job position needs equipment only through its entries'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000005', 0, '{"client": {}}') $$,
  'CLA01',
  null,
  'a client archived since the import started takes nothing'
);

select lives_ok(
  $test$ insert into applied select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0, $payload$ {
    "client": {"legal_name": "Atelier Lemn Viu SRL", "cui": "18547290", "caen_code": "1623", "county_code": "CJ",
      "locality": "Cluj-Napoca", "address_line": "Str. Fabricii 12", "legal_representative_name": "Mureșan Dan",
      "legal_representative_role": "Administrator", "contact_name": "Mureșan Dan", "periodic_training_minutes": 60,
      "administrative_training_interval_months": 12, "worker_training_interval_months": 6, "training_first_month": 2,
      "training_day_from": 3, "training_day_to": 7},
    "workplaces": [
      {"key": "w1", "name": "Sediu social", "is_registered_office": true, "county_code": "CJ", "locality": "Cluj-Napoca",
        "address_line": "Str. Fabricii 12", "activity": "Atelier tâmplărie", "floor_area_m2": 240, "extinguisher_norm": "other_150"},
      {"key": "w2", "name": "Punct de lucru Florești", "kind": "mobile_site"}
    ],
    "job_positions": [
      {"key": "p1", "name": "Tâmplar", "work_zone": "Atelier"},
      {"key": "p2", "name": "Administrator", "staff_category": "technical_administrative", "needs_protective_equipment": false}
    ],
    "equipment": [
      {"job_position_key": "p1", "risk": "Așchii", "item": "Ochelari de protecție", "duration_months": 12},
      {"job_position_key": "p1", "risk": "Zgomot", "item": "Antifoane", "allocation": "consumable"}
    ],
    "employees": [
      {"key": "e1", "last_name": "Pop", "first_name": "Vasile", "job_title": "Tâmplar", "hired_at": "2021-04-01", "workplace_key": "w1"}
    ],
    "responsible_persons": [
      {"full_name": "Mureșan Dan", "job_title": "Administrator", "roles": ["workplace_manager", "first_aid", "fire_safety_coordinator"]},
      {"employee_key": "e1", "full_name": "Pop Vasile", "job_title": "Tâmplar", "roles": ["workers_representative"], "workplace_key": "w1"}
    ],
    "fire_safety": {"periodic_training_hours": 2, "smoking_policy": "designated_places", "smoking_place": "Curtea interioară",
      "waste_kinds": ["Rumeguș"], "waste_contractor": "Salubris SA"},
    "fire_equipment": [
      {"workplace_key": "w1", "kind": "extinguisher", "agent": "powder", "capacity": 6, "location": "Atelier"},
      {"workplace_key": "w1", "kind": "extinguisher", "agent": "co2", "capacity": 5, "location": "Birou"}
    ],
    "fire_installations": [{"workplace_key": "w1", "kind": "detection_alarm"}],
    "quality": {"client": {"changed": 1, "unticked": 0, "kept": 14}}
  } $payload$) $test$,
  'a specialist confirms a new client''s import'
);

select is(
  (select (result ->> 'client_id')::uuid from applied),
  (select id from public.clients where cui = '18547290'),
  'which creates the client and returns it'
);

select is(
  (select jsonb_array_length(result -> 'files') from applied),
  3,
  'with the files to copy'
);

select results_eq(
  $$ select c.legal_name, c.locality, c.worker_training_interval_months, c.created_by
     from public.clients c where c.cui = '18547290' $$,
  $$ values ('Atelier Lemn Viu SRL', 'Cluj-Napoca', 6::smallint, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'with its identity and training schedule, created by the member who confirmed'
);

select results_eq(
  $$ select w.name, w.is_registered_office, w.kind::text from public.client_workplaces w
     join public.clients c on c.id = w.client_id where c.cui = '18547290' order by w.name $$,
  $$ values ('Punct de lucru Florești', false, 'mobile_site'), ('Sediu social', true, 'fixed_space') $$,
  'its workplaces'
);

select results_eq(
  $$ select p.name, p.staff_category::text, p.needs_protective_equipment,
       (select count(*)::int from public.job_position_equipment e where e.job_position_id = p.id)
     from public.job_positions p join public.clients c on c.id = p.client_id
     where c.cui = '18547290' order by p.name $$,
  $$ values ('Administrator', 'technical_administrative', false, 0), ('Tâmplar', 'execution', true, 2) $$,
  'its job positions, the decision that one needs no equipment, and the entries that decide the other needs some'
);

select results_eq(
  $$ select e.last_name, e.hired_at, p.name, w.name from public.employees e
     join public.job_positions p on p.id = e.job_position_id
     join public.client_workplaces w on w.id = e.workplace_id
     join public.clients c on c.id = e.client_id where c.cui = '18547290' $$,
  $$ values ('Pop', '2021-04-01'::date, 'Tâmplar', 'Sediu social') $$,
  'the one employee a role needs, in the position named like their job title'
);

select results_eq(
  $$ select r.full_name, r.roles::text[], r.employee_id is not null from public.client_responsible_persons r
     join public.clients c on c.id = r.client_id where c.cui = '18547290' order by r.full_name $$,
  $$ values ('Mureșan Dan', array['workplace_manager', 'first_aid', 'fire_safety_coordinator'], false),
            ('Pop Vasile', array['workers_representative'], true) $$,
  'its responsible persons, the workers'' representative as that employee'
);

select results_eq(
  $$ select f.smoking_policy::text, f.smoking_place, f.waste_kinds, f.has_third_parties,
       (select count(*)::int from public.fire_equipment u where u.client_id = f.client_id),
       (select string_agg(u.location, ', ' order by u.location) from public.fire_equipment u where u.client_id = f.client_id),
       (select count(*)::int from public.fire_installations i where i.client_id = f.client_id)
     from public.client_fire_safety f join public.clients c on c.id = f.client_id where c.cui = '18547290' $$,
  $$ values ('designated_places', 'Curtea interioară', array['Rumeguș'], false, 2, 'Atelier, Birou', 1) $$,
  'its fire-safety facts and means, a room being where a unit stands'
);

select results_eq(
  $$ select cf.name, cf.original_file_name, cf.mime_type, cf.size_bytes, cf.import_path, cf.uploaded_by
     from public.client_files cf where cf.import_id = '10000000-0000-4000-8000-000000000001' order by cf.name $$,
  $$ values
       ('Coperta', 'Coperta.pdf', 'application/pdf', 1024, null::text, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
       ('Decizia 1.1', 'Decizia 1.1.doc', 'application/msword', 40960, 'Dosar SSM/Decizii', 'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
       ('IMG_0042', 'IMG_0042.jpg', 'image/jpeg', 900000, 'Dosar SSM/Poze', 'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'the import folder: every file but another company''s, in its folders, a HEIC photograph as its JPEG'
);

select results_eq(
  $$ select c.source_path, c.target_path
     from public.import_folder_copies('10000000-0000-4000-8000-000000000001') c
     join public.import_files f on f.client_file_id = c.client_file_id
     where f.id = 'f0000000-0000-4000-8000-000000000002' $$,
  $$ select f.derived_path, cf.storage_path from public.import_files f
     join public.client_files cf on cf.id = f.client_file_id where f.id = 'f0000000-0000-4000-8000-000000000002' $$,
  'the copies name the JPEG of a photograph as its source'
);

select results_eq(
  $$ select status::text, client_id = (select id from public.clients where cui = '18547290'), confirmed_by, quality
     from public.imports where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values ('confirmed', true, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid, '{"client": {"changed": 1, "unticked": 0, "kept": 14}}'::jsonb) $$,
  'the import is confirmed, with its client and its quality counts'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0, '{"client": {}}') $$,
  'IMP01',
  null,
  'an import is confirmed once'
);

select is(
  public.apply_client_import('10000000-0000-4000-8000-000000000002', 1, $payload$ {
    "client": {"cui": "1590082", "legal_name": "Brutăria Dulce", "trade_register_number": "J40/2/2021",
      "locality": "București", "contact_name": "Ionescu Maria", "contact_phone": "0722222222",
      "worker_training_interval_months": 3, "administrative_training_not_applicable": true,
      "replace": ["contact_phone"]},
    "job_positions": [{"key": "p1", "name": " vânzător ", "work_zone": "Magazin"}],
    "equipment": [{"job_position_key": "p1", "risk": "Frig", "item": "Vestă termică", "duration_months": 24}]
  } $payload$),
  '{"client_id": "cccccccc-0000-4000-8000-000000000001", "files": []}'::jsonb,
  'confirming into an existing client returns it'
);

select results_eq(
  $$ select legal_name, trade_register_number, locality, contact_name, contact_phone,
       worker_training_not_applicable, worker_training_interval_months, administrative_training_not_applicable
     from public.clients where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('Brutăria Dulce SRL', 'J40/1/2020', 'București', 'Ionescu Maria', '0722222222', true, null::smallint, true) $$,
  'empty fields are filled, an undecided category takes "not applicable", the app''s values are kept, and only what the member chose replaced'
);

select results_eq(
  $$ select p.id, p.work_zone, (select count(*)::int from public.job_position_equipment e where e.job_position_id = p.id)
     from public.job_positions p where p.client_id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('dddddddd-0000-4000-8000-000000000001'::uuid, 'Magazin', 1) $$,
  'a job position the client has by that name is completed, not duplicated'
);

select lives_ok(
  $$ select public.abandon_import('10000000-0000-4000-8000-000000000004') $$,
  'a member abandons an import'
);

select throws_ok(
  $$ select public.abandon_import('10000000-0000-4000-8000-000000000004') $$,
  'IMP01',
  null,
  'once'
);

select throws_ok(
  $$ select public.abandon_import('10000000-0000-4000-8000-000000000002') $$,
  'IMP01',
  null,
  'and never a confirmed one'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, uploaded_by, import_id)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Fals', 'Fals.pdf', 'application/pdf', 10,
       repeat('a', 64), 'bbbbbbbb-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004') $$,
  '42501',
  null,
  'a member does not put a file into an import folder'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, uploaded_by, import_path)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Fals', 'Fals.pdf', 'application/pdf', 10,
       repeat('a', 64), 'bbbbbbbb-0000-4000-8000-000000000001', 'Dosar SSM') $$,
  '42501',
  null,
  'nor into a folder of one'
);

select throws_ok(
  $$ select public.record_import_usage('10000000-0000-4000-8000-000000000001', null, 'reading', 1, 0, 1, 0.01) $$,
  '42501',
  null,
  'members do not record usage'
);

select throws_ok(
  $$ select public.delete_abandoned_imports(array['10000000-0000-4000-8000-000000000004']::uuid[]) $$,
  '42501',
  null,
  'nor clean up'
);

select throws_ok(
  $$ select public.fail_stalled_imports('x', 'y') $$,
  '42501',
  null,
  'nor fail imports'
);

select pg_temp.act_as_postgres();
set local role service_role;

select throws_ok(
  $$ update public.imports set status = 'reading' where id = '10000000-0000-4000-8000-000000000001' $$,
  'IMP06',
  null,
  'a confirmed import does not change step'
);

select throws_ok(
  $$ update public.imports set status = 'ready' where id = '10000000-0000-4000-8000-000000000004' $$,
  'IMP06',
  null,
  'nor does an abandoned one'
);

select lives_ok(
  $$ select public.record_import_usage('10000000-0000-4000-8000-000000000001', null, 'reading', 120000, 80000, 9000, 0.12) $$,
  'the queue consumer records the reading''s usage'
);

select lives_ok(
  $$ select public.record_import_usage('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'scanning', 3000, 0, 500, 0.004) $$,
  'and a photograph''s'
);

select lives_ok(
  $$ select public.record_import_usage('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'scanning', 2000, 1000, 250, 0.003) $$,
  'and another page''s'
);

select throws_ok(
  $$ select public.record_import_usage('10000000-0000-4000-8000-000000000001', null, 'checking', 1, 0, 1, 0.01) $$,
  '22023',
  null,
  'only a step that asks a model records usage'
);

select results_eq(
  $$ select i.input_tokens, i.cached_input_tokens, i.output_tokens, i.cost_usd, f.input_tokens, f.cost_usd
     from public.imports i join public.import_files f on f.import_id = i.id
     where f.id = 'f0000000-0000-4000-8000-000000000002' $$,
  $$ values (125000::bigint, 81000::bigint, 9750::bigint, 0.127::numeric, 5000::bigint, 0.007::numeric) $$,
  'the import counts them all, the photograph its own'
);

select is(
  (select usage_by_step from public.imports where id = '10000000-0000-4000-8000-000000000001'),
  '{"reading": {"input_tokens": 120000, "cached_input_tokens": 80000, "output_tokens": 9000, "cost_usd": 0.12},
    "scanning": {"input_tokens": 5000, "cached_input_tokens": 1000, "output_tokens": 750, "cost_usd": 0.007}}'::jsonb,
  'and each step apart'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, import_id)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Fals', 'Fals.pdf', 'application/pdf', 10,
       repeat('a', 64), '10000000-0000-4000-8000-000000000003') $$,
  '23503',
  null,
  'a client file names only an import of its own organization'
);

insert into public.imports (id, organization_id, kind, into_existing_client) values
  ('10000000-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'client', false),
  ('10000000-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'client', false);

select lives_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256)
     select '10000000-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'Pagina ' || n || '.jpg', 'Pagina ' || n || '.jpg',
       'image/jpeg', 1, repeat('f', 64)
     from generate_series(1, 150) n $$,
  'an import takes 150 files'
);

select throws_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256)
     values ('10000000-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'Pagina 151.jpg', 'Pagina 151.jpg', 'image/jpeg', 1, repeat('f', 64)) $$,
  'IMP05',
  null,
  'and not one more'
);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256)
select ('f1100000-0000-4000-8000-00000000000' || n)::uuid, '10000000-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001',
  'Scan ' || n || '.pdf', 'Scan ' || n || '.pdf', 'application/pdf', case when n <= 4 then 20971520 when n = 5 then 10485760 else 1 end, repeat('f', 64)
from generate_series(1, 6) n;
update public.imports set status = 'preparing', started_at = now() where id = '10000000-0000-4000-8000-000000000011';

select throws_ok(
  $$ update public.import_files set size_bytes = 10485761 where id = 'f1100000-0000-4000-8000-000000000006' $$,
  'IMP05',
  null,
  'a file declared smaller than it was stored counts at its real size, over 100 MiB refused'
);

select throws_ok(
  $$ update public.import_files set size_bytes = 20971521 where id = 'f1100000-0000-4000-8000-000000000006' $$,
  'IMP05',
  null,
  'and so is a real size over 20 MiB'
);

select lives_ok(
  $$ update public.import_files set size_bytes = 10485760 where id = 'f1100000-0000-4000-8000-000000000006' $$,
  'up to 100 MiB in all, it is written once the import has moved past uploading'
);

insert into public.imports (id, organization_id, kind, into_existing_client) values
  ('10000000-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'client', false),
  ('10000000-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'client', false),
  ('10000000-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000001', 'client', false),
  ('10000000-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000001', 'client', false),
  ('10000000-0000-4000-8000-000000000014', '11111111-0000-4000-8000-000000000001', 'client', false);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001',
    'Decizie.pdf', 'Decizie.pdf', 'application/pdf', 100, repeat('a', 64)),
  ('f0000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000001',
    'Decizie veche.doc', 'Decizie veche.doc', 'application/msword', 100, repeat('a', 64));
update public.import_files set state = 'prepared', text_path = regexp_replace(storage_path, '\.pdf$', '.txt')
where id = 'f0000000-0000-4000-8000-000000000008';
update public.import_files set state = 'prepared', text_path = regexp_replace(storage_path, '\.doc$', '.txt'),
  derived_path = regexp_replace(storage_path, '\.doc$', '.docx'), derived_size_bytes = 90, derived_sha256 = repeat('4', 64)
where id = 'f0000000-0000-4000-8000-000000000010';

update public.imports set status = 'abandoned', abandoned_at = now() - interval '15 days'
where id in ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000013');
update public.imports set status = 'abandoned', abandoned_at = now() - interval '2 days' where id = '10000000-0000-4000-8000-000000000009';
update public.imports set status = 'failed', failure_reason = 'Documentele nu au putut fi citite.', failed_at = now() - interval '20 days'
where id in ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000014');

insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, import_id) values
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Fals', 'Fals.pdf', 'application/pdf', 10,
    repeat('a', 64), '10000000-0000-4000-8000-000000000013');

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.abandon_import('10000000-0000-4000-8000-000000000014') $$,
  'a member abandons a failed import'
);

select pg_temp.act_as_postgres();
set local role service_role;

select is(
  (select abandoned_at from public.imports where id = '10000000-0000-4000-8000-000000000014'),
  now() - interval '20 days',
  'which keeps the day it failed, so its 14 days do not start again'
);

select results_eq(
  $$ select import_id, paths from public.list_abandoned_imports()
     where import_id in ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000009',
       '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000014')
     order by import_id $$,
  $$ values
       ('10000000-0000-4000-8000-000000000008'::uuid, array[
         '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000008/f0000000-0000-4000-8000-000000000008.pdf',
         '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000008/f0000000-0000-4000-8000-000000000008.txt']),
       ('10000000-0000-4000-8000-000000000010'::uuid, array[
         '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000010/f0000000-0000-4000-8000-000000000010.doc',
         '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000010/f0000000-0000-4000-8000-000000000010.docx',
         '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000010/f0000000-0000-4000-8000-000000000010.txt']),
       ('10000000-0000-4000-8000-000000000014'::uuid, '{}'::text[]) $$,
  'the clean-up lists the objects of the imports abandoned or failed more than 14 days ago, not of one a client file names'
);

select is(
  (select count(*)::int from public.imports where id in (
     '10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000014')),
  3,
  'and deletes nothing while the objects may still be there'
);

select results_eq(
  $$ select * from public.delete_abandoned_imports(array[
       '10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000010',
       '10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000014']::uuid[]) order by 1 $$,
  $$ values ('10000000-0000-4000-8000-000000000008'::uuid), ('10000000-0000-4000-8000-000000000010'::uuid),
            ('10000000-0000-4000-8000-000000000014'::uuid) $$,
  'once the objects are removed, it deletes those imports, and of the ids it is given only those still due'
);

select results_eq(
  $$ select id from public.imports where id in (
       '10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000010',
       '10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000014') order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000009'::uuid), ('10000000-0000-4000-8000-000000000013'::uuid) $$,
  'one abandoned two days ago stays, and one a client file names stays without stopping the others'
);

select is(
  (select count(*)::int from public.import_files where import_id in (
     '10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000010')),
  0,
  'the deleted imports go with their files'' rows'
);

update public.imports set confirmed_at = now() - interval '31 days', files_copied_at = now()
where id = '10000000-0000-4000-8000-000000000001';
update public.imports set confirmed_at = now() - interval '31 days'
where id = '10000000-0000-4000-8000-000000000002';

select is(
  public.drop_import_proposals(),
  2,
  'a month after confirming, the proposals go'
);

select results_eq(
  $$ select id, proposal is null, changes is null, proposal_dropped_at is not null, objects_removed_at is null
     from public.imports where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid, true, true, true, true),
            ('10000000-0000-4000-8000-000000000002'::uuid, true, true, true, true) $$,
  'with the changes, and no object is marked removed yet'
);

select results_eq(
  $$ select import_id, cardinality(paths) from public.list_import_objects_to_remove()
     where import_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid, 7) $$,
  'every object of an import whose folder is copied is listed for removal, none of one not yet copied'
);

select results_eq(
  $$ select * from public.mark_import_objects_removed(array[
       '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid) $$,
  'once they are removed, only that import is marked'
);

select results_eq(
  $$ select count(*)::int, count(text_path)::int, count(derived_path)::int from public.import_files
     where import_id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values (4, 0, 0) $$,
  'the files'' rows stay, without the text and the converted files'
);

select results_eq(
  $$ select input_tokens, cost_usd, client_id is not null from public.imports where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values (125000::bigint, 0.127::numeric, true) $$,
  'and so do the import''s counts and cost'
);

select is(
  (select count(*)::int from public.list_import_objects_to_remove()
   where import_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')),
  0,
  'the clean-up lists each object once it is marked removed'
);

insert into public.imports (id, organization_id, kind, into_existing_client, status, started_at, ready_at, updated_at) values
  ('10000000-0000-4000-8000-000000000015', '11111111-0000-4000-8000-000000000001', 'client', false, 'reading', now() - interval '1 day', null, now() - interval '7 hours'),
  ('10000000-0000-4000-8000-000000000016', '11111111-0000-4000-8000-000000000001', 'client', false, 'uploading', null, null, now() - interval '15 days'),
  ('10000000-0000-4000-8000-000000000017', '11111111-0000-4000-8000-000000000001', 'client', false, 'checking', now() - interval '1 day', null, now() - interval '5 hours'),
  ('10000000-0000-4000-8000-000000000018', '11111111-0000-4000-8000-000000000001', 'client', false, 'uploading', null, null, now() - interval '15 days'),
  ('10000000-0000-4000-8000-000000000019', '11111111-0000-4000-8000-000000000001', 'client', false, 'ready', now() - interval '20 days', now() - interval '20 days', now() - interval '15 days'),
  ('10000000-0000-4000-8000-000000000020', '11111111-0000-4000-8000-000000000001', 'client', false, 'ready', now() - interval '20 days', now() - interval '20 days', now() - interval '13 days');

insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('10000000-0000-4000-8000-000000000016', '11111111-0000-4000-8000-000000000001', 'Decizie.pdf', 'Decizie.pdf', 'application/pdf', 100, repeat('a', 64));

select results_eq(
  $$ select * from public.fail_stalled_imports('Citirea documentelor s-a oprit.', 'Importul a rămas neterminat.') order by 1 $$,
  $$ values ('10000000-0000-4000-8000-000000000015'::uuid), ('10000000-0000-4000-8000-000000000018'::uuid),
            ('10000000-0000-4000-8000-000000000019'::uuid) $$,
  'an import read for 6 hours without progress fails, and so does one left uploading or ready for 14 days, not one whose files still move'
);

select results_eq(
  $$ select id, status::text, failure_reason, failed_at = now() from public.imports
     where id in ('10000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000019')
     order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000015'::uuid, 'failed', 'Citirea documentelor s-a oprit.', true),
            ('10000000-0000-4000-8000-000000000018'::uuid, 'failed', 'Importul a rămas neterminat.', true),
            ('10000000-0000-4000-8000-000000000019'::uuid, 'failed', 'Importul a rămas neterminat.', true) $$,
  'with the reason for each, from today, so the clean-up deletes them 14 days on'
);

select * from finish();
rollback;
