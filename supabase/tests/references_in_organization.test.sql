begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'service_contract', 'Contract A', 'other', true);
insert into public.client_documents (id, organization_id, client_id, type_key, title) values
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm_training_themes', 'Tematici A'),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm_training_themes', 'Tematici B');

insert into public.document_generations (id, organization_id, client_id, issue_date) values
  ('61616161-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-01'),
  ('62626262-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', '2026-09-01');

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path, status, issued_at, docx_sha256) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx', 'issued', now(), repeat('a', 64)),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000002/1.docx', 'issued', now(), repeat('a', 64)),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'd2d2d2d2-0000-4000-8000-000000000001', 1,
   '22222222-0000-4000-8000-000000000002/c2c2c2c2-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-000000000001/1.docx', 'issued', now(), repeat('a', 64));

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2026-01-05', 240, 'MISSMIG', 'Ana SPECIALIST', 'Inspector SSM');

insert into public.employees (id, organization_id, client_id, last_name, first_name, job_title, hired_at) values
  ('e3e3e3e3-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01');

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, user_id) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e3e3e3e3-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001');

insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Decizie', 'Decizie.pdf', 'application/pdf', 1024, repeat('a', 64)),
  ('f2f2f2f2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Decizie', 'Decizie.pdf', 'application/pdf', 1024, repeat('a', 64));

insert into public.imports (id, organization_id, kind, client_id, into_existing_client) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client', 'c1c1c1c1-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'client', 'c2c2c2c2-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'client', 'c1c1c1c1-0000-4000-8000-000000000001', true);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('1f000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Fise/Pop.jpg', 'Pop.jpg', 'image/jpeg', 1024, repeat('a', 64)),
  ('1f000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Fise/Ion.jpg', 'Ion.jpg', 'image/jpeg', 1024, repeat('a', 64)),
  ('2f000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Fise/Ana.jpg', 'Ana.jpg', 'image/jpeg', 1024, repeat('a', 64));

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.trainings set themes_revision_id = 'e1e1e1e1-0000-4000-8000-000000000002'
     where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'a member points a training at their own organization''s themes'
);

select throws_ok(
  $$ update public.trainings set themes_revision_id = 'e2e2e2e2-0000-4000-8000-000000000001'
     where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  '23503',
  null,
  'a member cannot point a training at another organization''s themes'
);

reset role;

select lives_ok(
  $$ insert into public.test_attempts (organization_id, client_id, employee_id, participant_id, domain, test, questions, total, material_revision_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e3e3e3e3-0000-4000-8000-000000000001',
       '9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring', '[{}]', 1, 'e1e1e1e1-0000-4000-8000-000000000002') $$,
  'a test attempt keeps the material of its organization'
);

select throws_ok(
  $$ insert into public.test_attempts (organization_id, client_id, employee_id, participant_id, domain, test, questions, total, material_revision_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e3e3e3e3-0000-4000-8000-000000000001',
       '9e9e9e9e-0000-4000-8000-000000000001', 'psi', 'hiring', '[{}]', 1, 'e2e2e2e2-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'a test attempt cannot keep the material of another organization'
);

select lives_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'andrei@client.example') $$,
  'a send names a revision of the contract it sends'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'andrei@client.example') $$,
  '23503',
  null,
  'a send cannot name a revision of another document'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001', 'andrei@client.example') $$,
  '23503',
  null,
  'a send cannot name a revision of another organization'
);

select lives_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path, generation_id)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 2,
       '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000002/2.docx',
       '61616161-0000-4000-8000-000000000001') $$,
  'a revision comes from a generation of its organization'
);

select throws_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path, generation_id)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2,
       '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/2.docx',
       '62626262-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'a revision cannot come from a generation of another organization'
);

select lives_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, client_file_id)
     values ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Dosar/Decizie.pdf', 'Decizie.pdf',
       'application/pdf', 1024, repeat('a', 64), 'f1f1f1f1-0000-4000-8000-000000000001') $$,
  'an import file links a client file of its organization'
);

select throws_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, client_file_id)
     values ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Dosar/Alta.pdf', 'Alta.pdf',
       'application/pdf', 1024, repeat('a', 64), 'f2f2f2f2-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'an import file cannot link a client file of another organization'
);

select lives_ok(
  $$ insert into public.imports (organization_id, kind, client_id, into_existing_client, source_import_id)
     values ('11111111-0000-4000-8000-000000000001', 'client', 'c1c1c1c1-0000-4000-8000-000000000001', true, '10000000-0000-4000-8000-000000000001') $$,
  'an import splits off an import of its organization'
);

select throws_ok(
  $$ insert into public.imports (organization_id, kind, client_id, into_existing_client, source_import_id)
     values ('11111111-0000-4000-8000-000000000001', 'client', 'c1c1c1c1-0000-4000-8000-000000000001', true, '20000000-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'an import cannot split off an import of another organization'
);

select lives_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, import_id, import_file_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Pop', 'Pop.jpg', 'image/jpeg', 1024, repeat('a', 64),
       '10000000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-000000000001') $$,
  'a client file is the copy of a file of its own import'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, import_id, import_file_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Ion', 'Ion.jpg', 'image/jpeg', 1024, repeat('a', 64),
       '10000000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-000000000002') $$,
  '23503',
  null,
  'a client file cannot be the copy of a file of another import'
);

select lives_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, source_file_id)
     values ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Fise/Ion copie.jpg', 'Ion copie.jpg',
       'image/jpeg', 1024, repeat('a', 64), '1f000000-0000-4000-8000-000000000002') $$,
  'an import file copies a found file of its organization'
);

select throws_ok(
  $$ insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, source_file_id)
     values ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Fise/Ana copie.jpg', 'Ana copie.jpg',
       'image/jpeg', 1024, repeat('a', 64), '2f000000-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'an import file cannot copy a found file of another organization'
);

delete from public.document_revisions where id = 'e1e1e1e1-0000-4000-8000-000000000002';

select ok(
  (select themes_revision_id is null and organization_id = '11111111-0000-4000-8000-000000000001'
   from public.trainings where id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  'deleting the themes revision clears only the training''s reference to it'
);

select * from finish();
rollback;
