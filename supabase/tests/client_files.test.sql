begin;
select plan(38);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'colleague@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lead of A', '14399840', 'lead'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived later', '5022670', 'client');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.path_of(file_id text)
returns text language sql as $$
  select storage_path from public.client_files where id = file_id::uuid;
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256)
     values ('f0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Certificat de înregistrare', 'Certificat de înregistrare.pdf', 'application/pdf', 1234, repeat('a', 64)) $$,
  'a specialist uploads a file for a client'
);

select is(
  pg_temp.path_of('f0000000-0000-4000-8000-000000000001'),
  '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf',
  'stored under ids and the type, never under the file''s own name'
);

select is(
  (select uploaded_by from public.client_files where id = 'f0000000-0000-4000-8000-000000000001'),
  'bbbbbbbb-0000-4000-8000-000000000001'::uuid,
  'recorded as theirs'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('client-files',
     '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf') $$,
  'and stores its object where the row says'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('client-files',
     '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000099.pdf') $$,
  '42501',
  null,
  'but nowhere a row does not name'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, owners_only)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Ofertă', 'Ofertă.pdf', 'application/pdf', 10, repeat('b', 64), true) $$,
  '42501',
  null,
  'a specialist does not upload a file for owners only'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, owners_only)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
       'Ofertă', 'Ofertă.pdf', 'application/pdf', 10, repeat('b', 64), true) $$,
  '42501',
  null,
  'nor any file for a lead'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, uploaded_by)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Fișă', 'Fișă.pdf', 'application/pdf', 10, repeat('b', 64), 'bbbbbbbb-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'nor records a colleague as the uploader'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Pagină', 'Pagină.html', 'text/html', 10, repeat('b', 64)) $$,
  '23502',
  null,
  'a type outside the list is refused'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Mare', 'Mare.pdf', 'application/pdf', 20971521, repeat('b', 64)) $$,
  '23514',
  null,
  'and so is a file above 20 MiB'
);

select results_eq(
  $$ update public.client_files set name = 'Certificat ONRC', note = 'Din 2019'
     where id = 'f0000000-0000-4000-8000-000000000001' returning name $$,
  $$ values ('Certificat ONRC') $$,
  'the uploader renames and annotates their file'
);

select throws_ok(
  $$ update public.client_files set owners_only = true where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'but does not hide it from the team'
);

select throws_ok(
  $$ update public.client_files set mime_type = 'image/png' where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'nor change what the app recorded'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, owners_only)
     values ('f0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Anexă prețuri', 'Anexa preturi.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 2048, repeat('c', 64), true) $$,
  'an owner uploads a file for owners only'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('client-files',
     '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.xlsx') $$,
  'with its object'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
       'Ofertă', 'Ofertă.pdf', 'application/pdf', 10, repeat('d', 64)) $$,
  'CFL01',
  null,
  'a lead''s file is for owners only from the start'
);

select lives_ok(
  $$ insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, owners_only)
     values ('f0000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002',
       'Ofertă', 'Ofertă.pdf', 'application/pdf', 10, repeat('d', 64), true) $$,
  'as the owner uploads it'
);

select throws_ok(
  $$ update public.client_files set owners_only = false where id = 'f0000000-0000-4000-8000-000000000003' $$,
  'CFL01',
  null,
  'and keeps it while the company is a lead'
);

select results_eq(
  $$ update public.client_files set name = 'Certificat de înregistrare ONRC'
     where id = 'f0000000-0000-4000-8000-000000000001' returning name $$,
  $$ values ('Certificat de înregistrare ONRC') $$,
  'an owner renames a specialist''s file'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select id from public.client_files order by id $$,
  $$ values ('f0000000-0000-4000-8000-000000000001'::uuid) $$,
  'a specialist sees the team''s files, not the owners'' nor a lead''s'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'client-files'),
  1,
  'nor their objects'
);

select ok(
  not public.is_readable_client_file_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.xlsx'),
  'even with the path'
);

select is_empty(
  $$ update public.client_files set name = 'Altceva' where id = 'f0000000-0000-4000-8000-000000000001' returning id $$,
  'a specialist does not rename a colleague''s file'
);

select is_empty(
  $$ delete from public.client_files where id = 'f0000000-0000-4000-8000-000000000001' returning id $$,
  'nor delete it'
);

select ok(
  not public.is_writable_client_file_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf'),
  'nor remove its object'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select is_empty(
  $$ select id from public.client_files $$,
  'another organization sees no file'
);

select ok(
  not public.is_readable_client_file_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf'),
  'nor reads an object by its path'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

update public.clients set stage = 'client' where id = 'cccccccc-0000-4000-8000-000000000002';

select lives_ok(
  $$ update public.client_files set owners_only = false where id = 'f0000000-0000-4000-8000-000000000003' $$,
  'after promotion an owner opens the lead''s file to the team'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256)
     values ('f0000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003',
       'Poză atelier', 'IMG_2041.jpeg', 'image/jpeg', 500, repeat('e', 64)) $$,
  'a specialist uploads a photo'
);

select ok(
  public.is_writable_client_file_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000003/f0000000-0000-4000-8000-000000000004.jpg'),
  'whose object they may remove'
);

select results_eq(
  $$ delete from public.client_files where id = 'f0000000-0000-4000-8000-000000000001' returning id $$,
  $$ values ('f0000000-0000-4000-8000-000000000001'::uuid) $$,
  'and deletes their own file'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';

select results_eq(
  $$ select name from public.client_files where id = 'f0000000-0000-4000-8000-000000000004' $$,
  $$ values ('Poză atelier') $$,
  'the files of an archived client are still listed'
);

select ok(
  public.is_readable_client_file_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000003/f0000000-0000-4000-8000-000000000004.jpg'),
  'and read'
);

select throws_ok(
  $$ update public.client_files set name = 'Poză' where id = 'f0000000-0000-4000-8000-000000000004' $$,
  'CLA01',
  null,
  'but not renamed'
);

select throws_ok(
  $$ delete from public.client_files where id = 'f0000000-0000-4000-8000-000000000004' $$,
  'CLA01',
  null,
  'nor deleted'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003',
       'Nou', 'Nou.png', 'image/png', 10, repeat('f', 64)) $$,
  'CLA01',
  null,
  'nor joined by a new one'
);

select ok(
  not public.is_writable_client_file_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000003/f0000000-0000-4000-8000-000000000004.jpg'),
  'and its object is not removed'
);

select results_eq(
  $$ delete from public.client_files where id = 'f0000000-0000-4000-8000-000000000002' returning id $$,
  $$ values ('f0000000-0000-4000-8000-000000000002'::uuid) $$,
  'an owner deletes any file of an active client'
);

select * from finish();
rollback;
