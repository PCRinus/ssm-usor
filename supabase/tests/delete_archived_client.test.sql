begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com'),
  ('dddddddd-0000-4000-8000-000000000001', 'ion@example.com')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Client Two', '5022670', 'client'),
  ('c3c3c3c3-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', 'Client Three', '18547290', 'client');

insert into public.client_workplaces (id, organization_id, client_id, name) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Atelier');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor');

insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, quantity, duration_months) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Împroșcare, stropire (față, ochi)', 'Mască de sudură', 1, 24);

insert into public.employees (id, organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2026-01-05'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', null, 'Ionescu', 'Ana', 'Sudor', '2026-01-05');

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier');

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('7a7a7a7a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor');

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('88888888-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001');

insert into public.signing_sessions (id, account_id, place, participant_id, channel, address, code_hash, verified_at) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'portal', '88888888-0000-4000-8000-000000000001', 'email', 'ion@example.com', 'hash', now());

insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id) values
  ('9a9a9a9a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'dddddddd-0000-4000-8000-000000000001');

insert into public.signing_session_items (session_id, position, request_id) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 0, '9a9a9a9a-0000-4000-8000-000000000001');

insert into public.training_signatures (
  organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id,
  signer_name, channel, address, code_sent_at, code_verified_at, digest_before, digest_after,
  certificate_serial, client_ip, user_agent, signing_session_id
) values (
  '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee',
  '9a9a9a9a-0000-4000-8000-000000000001', 'electronic', 'dddddddd-0000-4000-8000-000000000001', 'Ion Popescu', 'email',
  'ion@example.com', now(), now(), repeat('a', 64), repeat('b', 64), '01AB', '127.0.0.1', 'pgTAP',
  '5e5e5e5e-0000-4000-8000-000000000001'
);

insert into public.test_attempts (id, organization_id, client_id, employee_id, participant_id, domain, test, questions, total, score, passed, finished_at) values
  ('a7a7a7a7-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000001', 'ssm', 'hiring', '[{"text": "Ce?", "options": [{"text": "Da"}], "chosen": [0]}]', 1, 1, true, now());

insert into public.test_attempt_keys (attempt_id, key) values
  ('a7a7a7a7-0000-4000-8000-000000000001', '[[0]]');

insert into public.test_results (id, organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source, attempt_id) values
  ('7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'hiring', '2026-10-21', 'Test la angajare', 'Ana SPECIALIST', 'Inspector SSM', 'portal', 'a7a7a7a7-0000-4000-8000-000000000001');

insert into public.test_sheets (organization_id, client_id, employee_id, test_result_id, storage_path, digest) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000001/test-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/7e7e7e7e-0000-4000-8000-000000000001/v1-a.pdf', repeat('a', 64));

insert into public.client_documents (id, organization_id, client_id, type_key, title) values
  ('d0d0d0d0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'own_instructions', 'Instrucțiuni proprii'),
  ('d0d0d0d0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'own_instructions', 'Instrucțiuni proprii');

insert into public.document_generations (id, organization_id, client_id, issue_date) values
  ('6e6e6e6e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01');

insert into public.document_revisions (organization_id, document_id, generation_id, revision, docx_path) values
  ('11111111-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000001', '6e6e6e6e-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d0d0d0d0-0000-4000-8000-000000000001/1.docx'),
  ('11111111-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000002', null, 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000002/d0d0d0d0-0000-4000-8000-000000000002/1.docx');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client', 'c1c1c1c1-0000-4000-8000-000000000001', true);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, text_path) values
  ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
   'Dosar/Decizie.pdf', 'Decizie.pdf', 'application/pdf', 1024, repeat('a', 64),
   '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.txt');

insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, import_id, import_path) values
  ('cf000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Decizie', 'Decizie.pdf', 'application/pdf', 1024, repeat('a', 64),
   '10000000-0000-4000-8000-000000000001', 'Dosar/Decizie.pdf');

update public.import_files set client_file_id = 'cf000000-0000-4000-8000-000000000001'
where id = 'f0000000-0000-4000-8000-000000000001';
update public.imports set status = 'ready', started_at = now(), ready_at = now()
where id = '10000000-0000-4000-8000-000000000001';
update public.imports set status = 'confirmed', confirmed_at = now()
where id = '10000000-0000-4000-8000-000000000001';

insert into public.imports (id, organization_id, kind, client_id, into_existing_client) values
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'employees', 'c1c1c1c1-0000-4000-8000-000000000001', true);

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001',
   'Fise.pdf', 'Fise.pdf', 'application/pdf', 2048, repeat('b', 64));

insert into public.import_page_images (import_file_id, page, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000002', 1, 512, repeat('c', 64));

insert into public.client_files (id, organization_id, client_id, employee_id, name, original_file_name, mime_type, size_bytes, sha256, import_id, import_file_id, import_page) values
  ('cf000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001',
   'Fise — pagina 1', 'Fise — pagina 1.jpg', 'image/jpeg', 512, repeat('c', 64), '10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 1),
  ('cf000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', null,
   'Fise', 'Fise.pdf', 'application/pdf', 2048, repeat('b', 64), '10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', null);

update public.imports set status = 'ready', started_at = now(), ready_at = now()
where id = '10000000-0000-4000-8000-000000000002';
update public.imports set status = 'confirmed', confirmed_at = now()
where id = '10000000-0000-4000-8000-000000000002';

insert into storage.objects (bucket_id, name) values
  ('documents', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d0d0d0d0-0000-4000-8000-000000000001/1.docx'),
  ('documents', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d0d0d0d0-0000-4000-8000-000000000001/1.pdf'),
  ('documents', '11111111-0000-4000-8000-000000000001/test-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/7e7e7e7e-0000-4000-8000-000000000001/v1-a.pdf'),
  ('documents', '11111111-0000-4000-8000-000000000001/signed-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/ssm-1/v2-c.pdf'),
  ('documents', '11111111-0000-4000-8000-000000000001/signing-agreements/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/v1-d.pdf'),
  ('documents', '11111111-0000-4000-8000-000000000001/signed-sheets/c1c1c1c1-0000-4000-8000-000000000002/e2e2e2e2-0000-4000-8000-000000000001/ssm-1/v1-f.pdf'),
  ('documents', 'test-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/7e7e7e7e-0000-4000-8000-000000000001/v0-a.pdf'),
  ('documents', 'signed-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/ssm-1/v1-b.pdf'),
  ('documents', 'signing-agreements/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/v1-e.pdf'),
  ('documents', 'signed-sheets/c1c1c1c1-0000-4000-8000-000000000002/e2e2e2e2-0000-4000-8000-000000000001/ssm-1/v1-g.pdf'),
  ('documents', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000002/d0d0d0d0-0000-4000-8000-000000000002/1.docx'),
  ('client-files', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/cf000000-0000-4000-8000-000000000001.pdf'),
  ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf'),
  ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.txt'),
  ('client-files', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/cf000000-0000-4000-8000-000000000002.jpg'),
  ('client-files', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/cf000000-0000-4000-8000-000000000003.pdf'),
  ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/f0000000-0000-4000-8000-000000000002.pdf'),
  ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/f0000000-0000-4000-8000-000000000002.page-1.jpg');

update public.clients set archived_at = now()
where id in ('c1c1c1c1-0000-4000-8000-000000000001', 'c3c3c3c3-0000-4000-8000-000000000003');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  '42501', null,
  'a member cannot call it, even an owner: the API decides who may'
);
select pg_temp.act_as_postgres();

set local role service_role;

select throws_ok(
  $$ select * from public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'c3c3c3c3-0000-4000-8000-000000000003') $$,
  'P0002', null,
  'another organization''s client is not there'
);

select throws_ok(
  $$ select * from public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002') $$,
  'CLA02', null,
  'an active client is archived first'
);

create temporary table deleted_objects as
select * from public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001');

reset role;

select results_eq(
  $$ select bucket, path from deleted_objects order by 1, 2 $$,
  $$ values
    ('client-files', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/cf000000-0000-4000-8000-000000000001.pdf'),
    ('client-files', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/cf000000-0000-4000-8000-000000000002.jpg'),
    ('client-files', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/cf000000-0000-4000-8000-000000000003.pdf'),
    ('documents', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d0d0d0d0-0000-4000-8000-000000000001/1.docx'),
    ('documents', '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d0d0d0d0-0000-4000-8000-000000000001/1.pdf'),
    ('documents', '11111111-0000-4000-8000-000000000001/signed-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/ssm-1/v2-c.pdf'),
    ('documents', '11111111-0000-4000-8000-000000000001/signing-agreements/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/v1-d.pdf'),
    ('documents', '11111111-0000-4000-8000-000000000001/test-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/7e7e7e7e-0000-4000-8000-000000000001/v1-a.pdf'),
    ('documents', 'signed-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/ssm-1/v1-b.pdf'),
    ('documents', 'signing-agreements/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/v1-e.pdf'),
    ('documents', 'test-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/7e7e7e7e-0000-4000-8000-000000000001/v0-a.pdf'),
    ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.pdf'),
    ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.txt'),
    ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/f0000000-0000-4000-8000-000000000002.page-1.jpg'),
    ('imports', '11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/f0000000-0000-4000-8000-000000000002.pdf') $$,
  'the client''s objects are returned, unrecorded earlier versions too, under its organization or under their kind as older evidence is, and no other client''s'
);

select is((select count(*) from public.clients where id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'the client is gone');
select is((select count(*) from public.client_workplaces where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'its workplaces are gone');
select is((select count(*) from public.job_position_equipment where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'its equipment is gone');
select is((select count(*) from public.employees where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'its employees are gone');
select is((select count(*) from public.training_signatures where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'its training signatures are gone');
select is((select count(*) from public.test_attempt_keys where attempt_id = 'a7a7a7a7-0000-4000-8000-000000000001'), 0::bigint, 'its finished tests are gone');
select is((select count(*) from public.client_documents where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'its documents are gone');
select is((select count(*) from public.client_files where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'), 0::bigint, 'its files are gone');
select is((select count(*) from public.imports where id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'its import is gone, with its files');
select is((select count(*) from public.import_page_images where import_file_id = 'f0000000-0000-4000-8000-000000000002'), 0::bigint, 'its employee import is gone, with the pages it split a PDF into');
select is((select count(*) from public.signing_sessions where id = '5e5e5e5e-0000-4000-8000-000000000001'), 0::bigint, 'its participants'' signing sessions are gone');

select is(
  (select count(*) from public.employees where client_id = 'c1c1c1c1-0000-4000-8000-000000000002')
    + (select count(*) from public.client_documents where client_id = 'c1c1c1c1-0000-4000-8000-000000000002'),
  2::bigint,
  'another client of the organization keeps its rows'
);

select is(
  (select count(*) from pg_trigger
   where tgname in (
     'training_signatures_written_once', 'agreement_signatures_written_once',
     'test_sheet_signatures_written_once', 'test_sheets_kept', 'test_attempts_frozen',
     'test_attempt_keys_frozen', 'test_results_protect_from_attempt',
     'employee_signing_agreements_retain_recorded'
   ) and tgenabled = 'O'),
  8::bigint,
  'the evidence triggers are enabled again'
);

select ok(
  exists (select 1 from storage.objects where bucket_id = 'documents' and name like '%/c1c1c1c1-0000-4000-8000-000000000001/%'),
  'the objects stay for the API to remove through Storage'
);

select * from finish();
rollback;
