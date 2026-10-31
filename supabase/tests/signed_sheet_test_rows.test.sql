begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com', '', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Client Two', '5022670', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2026-01-05'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2026-01-05');

insert into public.test_results (id, organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source) values
  ('7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'hiring', '2026-01-06', 'Test de verificare a cunoștințelor la angajare (TASSM)', 'Ana SPECIALIST', 'Inspector SSM', 'paper'),
  ('7e7e7e7e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'psi', 'hiring', '2026-01-07', 'Test de verificare a cunoștințelor la angajare (TASU)', 'Vasile TEHNIC', 'Cadru tehnic PSI', 'paper'),
  ('7e7e7e7e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'ssm', 'hiring', '2026-01-06', 'Test de verificare a cunoștințelor la angajare (TASSM)', 'Ana SPECIALIST', 'Inspector SSM', 'paper');

insert into public.signed_sheets (id, organization_id, client_id, employee_id, domain, storage_path, digest, row_capacity) values
  ('5d5d5d5d-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', '11111111-0000-4000-8000-000000000001/sheets/ion-ssm-1.pdf', repeat('d', 64), 17),
  ('5d5d5d5d-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'psi', '11111111-0000-4000-8000-000000000001/sheets/ion-psi-1.pdf', repeat('d', 64), 17);

select lives_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 't1', '7e7e7e7e-0000-4000-8000-000000000001') $$,
  'an occupational safety result fills a row of the test block'
);

select lives_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 'p1', '7e7e7e7e-0000-4000-8000-000000000002') $$,
  'a fire-safety result fills a periodic row'
);

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 't2', '7e7e7e7e-0000-4000-8000-000000000001') $$,
  '23505', null, 'a result has one live row'
);

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 't6', '7e7e7e7e-0000-4000-8000-000000000001') $$,
  '23514', null, 'the test block has five rows'
);

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p3', '7e7e7e7e-0000-4000-8000-000000000003') $$,
  '23514', 'row_not_of_sheet', 'a row holds a result of the sheet''s employee'
);

update public.signed_sheet_rows set voided_at = now() where test_result_id = '7e7e7e7e-0000-4000-8000-000000000001';

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p2', '7e7e7e7e-0000-4000-8000-000000000001') $$,
  '23514', 'row_not_of_sheet', 'an occupational safety result goes in the test block, not the periodic table'
);

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 's2', '7e7e7e7e-0000-4000-8000-000000000001') $$,
  '23514', null, 'nor the supplementary table'
);

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, test_result_id)
     values ('5d5d5d5d-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 't1', '7e7e7e7e-0000-4000-8000-000000000002') $$,
  '23514', null, 'the fire-safety sheet has no test block'
);

select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 't3') $$,
  '23514', null, 'a row holds a record or a result'
);

select throws_ok(
  $$ delete from public.test_results where id = '7e7e7e7e-0000-4000-8000-000000000002' $$,
  '23503', null, 'a result on a sheet is not deleted'
);

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, user_id) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'general_training_material', 'Material de instruire introductiv-generală', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'general_training_material', 'Material de instruire introductiv-generală', 'documentation_set');

insert into public.document_revisions (id, organization_id, document_id, revision, status, docx_path, pdf_path, issued_at, superseded_at, docx_sha256, pdf_sha256)
select v.id::uuid, d.organization_id, d.id, v.revision, v.status::public.document_revision_status,
  d.organization_id || '/' || d.client_id || '/' || d.id || '/' || v.revision || '.docx',
  d.organization_id || '/' || d.client_id || '/' || d.id || '/' || v.revision || '.pdf',
  now() - v.age, case when v.status = 'superseded' then now() - v.age + interval '1 day' end,
  repeat('a', 64), repeat('b', 64)
from (values
  ('eeeeeeee-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'superseded', interval '2 days'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'd1d1d1d1-0000-4000-8000-000000000001', 2, 'issued', interval '1 day'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'issued', interval '0 days')
) as v (id, document_id, revision, status, age)
join public.client_documents d on d.id = v.document_id::uuid;

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select results_eq(
  $$ select revision_id from public.portal_material('9e9e9e9e-0000-4000-8000-000000000001', 'ssm') $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000002'::uuid) $$,
  'the portal reads the newest issued revision of its own client''s material'
);

select is_empty(
  $$ select * from public.portal_material('9e9e9e9e-0000-4000-8000-000000000001', 'psi') $$,
  'nothing while the fire-safety own instructions are not issued'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');

select is_empty(
  $$ select * from public.portal_material('9e9e9e9e-0000-4000-8000-000000000001', 'ssm') $$,
  'and nothing through another account''s participation'
);

select * from finish();
rollback;
