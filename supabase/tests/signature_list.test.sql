begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'specialist-a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'owner-b@example.com')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Beta', '5022670'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Gama', '1590082');

insert into public.job_positions (id, organization_id, client_id, name, staff_category) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Contabil', 'execution'),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor', 'execution');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, cnp) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2024-01-01', 'active', '1900101400127'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Țăranu', 'Ștefan', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Ionescu', 'Ana', 'Contabil', '2024-01-01', 'active', null),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', 'Vasile', 'Dan', 'Sudor', '2024-01-01', 'active', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title, source) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2026-10-01', 240, 'Material', 'Ana SPECIALIST', 'Inspector', 'Ana SPECIALIST', 'Inspector', 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-10-10', 60, 'Material', 'Ion POP', 'Șef atelier', 'Ana SPECIALIST', 'Inspector', 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'su', 'periodic', '2026-09-15', 60, 'Material', 'Ana SPECIALIST', 'Inspector', null, null, 'app'),
  ('a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-10-01', 60, 'Material', 'Ana SPECIALIST', 'Inspector', null, null, 'app');

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on, admitted_by_name, admitted_by_job_title) values
  ('7a7a7a7a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'introductory_general', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor', null, null, null),
  ('7a7a7a7a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'introductory_general', 'e1e1e1e1-0000-4000-8000-000000000002', 'Sudor', null, null, null),
  ('7a7a7a7a-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000002', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor', null, null, null),
  ('7a7a7a7a-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000003', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000003', 'Contabil', null, null, null),
  ('7b7b7b7b-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'a2a2a2a2-0000-4000-8000-000000000001', 'periodic', 'e2e2e2e2-0000-4000-8000-000000000001', 'Sudor', null, null, null);

insert into public.test_results (id, organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source) values
  ('7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000003', 'su', 'annual', '2026-10-15', 'Test anual (TPSU)', 'Ana SPECIALIST', 'Inspector', 'paper');

-- The rules of who may be asked and of the evidence are the signing tests'; this file reads the
-- requests as they stand.
set local session_replication_role = replica;

insert into public.test_sheets (id, organization_id, client_id, employee_id, test_result_id, storage_path, digest) values
  ('75757575-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000003', '7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001/test-sheets/ana/v1.pdf', repeat('a', 64));

insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, employee_signed_at, storage_path) values
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'generated', '2026-10-03 09:00+00', '11111111-0000-4000-8000-000000000001/signing-agreements/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000002/v1-a.pdf');

insert into public.signature_requests (id, organization_id, client_id, training_record_id, test_sheet_id, slot, signer_account_id, state, issued_at, voided_at, void_reason) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', null, 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-02 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', null, 'verifier', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-02 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', null, 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-01 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', null, 'verifier', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-02 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', null, 'trainee', null, 'pending', '2026-10-02 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', null, 'admitter', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-02 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', null, 'verifier', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-11 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', null, 'trainer', 'aaaaaaaa-0000-4000-8000-000000000002', 'pending', '2026-10-11 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', '7a7a7a7a-0000-4000-8000-000000000004', null, 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001', 'void', '2026-09-15 08:00+00', '2026-09-16 08:00+00', 'record_changed'),
  ('9e9e9e9e-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', '7a7a7a7a-0000-4000-8000-000000000004', null, 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001', 'signed', '2026-09-16 08:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', null, '75757575-0000-4000-8000-000000000001', 'examiner', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-15 10:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', null, '75757575-0000-4000-8000-000000000001', 'trainee', null, 'pending', '2026-10-15 10:00+00', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', '7a7a7a7a-0000-4000-8000-000000000004', null, 'admitter', 'aaaaaaaa-0000-4000-8000-000000000002', 'pending', '2026-09-20 08:00+00', null, null),
  ('9f9f9f9f-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', '7b7b7b7b-0000-4000-8000-000000000001', null, 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001', 'pending', '2026-10-01 08:00+00', null, null);

set local session_replication_role = origin;

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select kind, client_name, day::text, subject, slots, signature_count, worker_count, issued_at
     from public.signature_list
     where signer_account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     order by issued_at $$,
  $$ values
    ('training', 'Alfa', '2026-10-01', 'introductory_general', array['trainer', 'verifier', 'admitter'], 5, 2, '2026-10-01 08:00+00'::timestamptz),
    ('training', 'Alfa', '2026-10-10', 'periodic', array['verifier'], 1, 1, '2026-10-11 08:00+00'::timestamptz),
    ('test_sheet', 'Beta', '2026-10-15', 'test', array['examiner'], 1, 1, '2026-10-15 10:00+00'::timestamptz) $$,
  'a row per training or test sheet with every slot the member holds on it, the admission included, never the trainee''s, nor a signed or voided request, nor another organization''s'
);

select is(
  (select workers from public.signature_list
   where signer_account_id = 'aaaaaaaa-0000-4000-8000-000000000001' and id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  jsonb_build_array(
    jsonb_build_object('employeeId', 'e1e1e1e1-0000-4000-8000-000000000001', 'lastName', 'Popescu', 'firstName', 'Ion', 'agreement', null,
      'requests', jsonb_build_array(
        jsonb_build_object('id', '9e9e9e9e-0000-4000-8000-000000000001', 'slot', 'trainer'),
        jsonb_build_object('id', '9e9e9e9e-0000-4000-8000-000000000002', 'slot', 'verifier'),
        jsonb_build_object('id', '9e9e9e9e-0000-4000-8000-000000000006', 'slot', 'admitter'))),
    jsonb_build_object('employeeId', 'e1e1e1e1-0000-4000-8000-000000000002', 'lastName', 'Țăranu', 'firstName', 'Ștefan',
      'agreement', jsonb_build_object('state', 'generated', 'employeeSignedAt', '2026-10-03T09:00:00+00:00'::timestamptz, 'employerSignedAt', null),
      'requests', jsonb_build_array(
        jsonb_build_object('id', '9e9e9e9e-0000-4000-8000-000000000003', 'slot', 'trainer'),
        jsonb_build_object('id', '9e9e9e9e-0000-4000-8000-000000000004', 'slot', 'verifier')))
  ),
  'each worker carries their agreement and the member''s requests on their record, the admission only where the member was chosen for it'
);

select is(
  (select search_names from public.signature_list
   where signer_account_id = 'aaaaaaaa-0000-4000-8000-000000000001' and id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  'popescu ion | taranu stefan',
  'the workers'' names are searched lowercase and without diacritics, one segment each'
);

select is(
  (select count(*)::integer from public.signature_list
   where signer_account_id = 'aaaaaaaa-0000-4000-8000-000000000001' and organization_id = '22222222-0000-4000-8000-000000000002'),
  0,
  'a request another organization addressed to the member is not listed in it'
);

select results_eq(
  $$ select client_name, subject, slots from public.signature_list
     where signer_account_id = 'aaaaaaaa-0000-4000-8000-000000000002' order by day $$,
  $$ values ('Beta', 'periodic', array['admitter']), ('Alfa', 'periodic', array['trainer']) $$,
  'another member''s requests are their own rows'
);

select results_eq(
  $$ select slots, signature_count from public.signature_list
     where signer_account_id = 'aaaaaaaa-0000-4000-8000-000000000002' and id = 'a1a1a1a1-0000-4000-8000-000000000003' $$,
  $$ values (array['admitter'], 1) $$,
  'a member chosen to admit to work signs that slot here, and only that one'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select organization_id::text, signer_account_id::text from public.signature_list $$,
  $$ values ('22222222-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'another organization''s member reads only its own organization''s rows'
);

select is(
  (select count(*)::integer from public.signature_list
   where signer_account_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  0,
  'and has nothing of its own to sign'
);

select * from finish();
rollback;
