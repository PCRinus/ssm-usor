begin;
select plan(40);

-- Accounts: 1 the specialist, 2 a member of another organization, 3 Ion's participant, 4 Ana's
-- participant, 5 the client administrator.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ana.specialist@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'other@example.com'),
  ('dddddddd-0000-4000-8000-000000000001', 'ion@example.com'),
  ('dddddddd-0000-4000-8000-000000000002', 'ana@example.com'),
  ('dddddddd-0000-4000-8000-000000000003', 'hr@client.test')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2026-01-05'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2026-01-05');

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001'),
  ('9e9e9e9e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'dddddddd-0000-4000-8000-000000000002'),
  ('9e9e9e9e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Elena Radu', 'dddddddd-0000-4000-8000-000000000003');

insert into public.test_attempts (id, organization_id, client_id, employee_id, participant_id, domain, test, questions, total, score, passed, finished_at) values
  ('a7a7a7a7-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring', '[{"text": "Ce?", "options": [{"text": "Da"}], "chosen": [0]}]', 1, 1, true, now()),
  ('a7a7a7a7-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', '9e9e9e9e-0000-4000-8000-000000000002', 'ssm', 'hiring', '[{"text": "Ce?", "options": [{"text": "Da"}], "chosen": [0]}]', 1, 1, true, now());

insert into public.test_results (id, organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source, attempt_id) values
  ('7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'hiring', '2026-10-21', 'Test de verificare a cunoștințelor la angajare (TASSM)', 'Ana SPECIALIST', 'Inspector SSM', 'portal', 'a7a7a7a7-0000-4000-8000-000000000001'),
  ('7e7e7e7e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'ssm', 'hiring', '2026-10-21', 'Test de verificare a cunoștințelor la angajare (TASSM)', 'Ana SPECIALIST', 'Inspector SSM', 'portal', 'a7a7a7a7-0000-4000-8000-000000000002'),
  ('7e7e7e7e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'psi', 'hiring', '2026-10-21', 'Test de verificare a cunoștințelor la angajare (TASU)', 'Vasile TEHNIC', 'Cadru tehnic PSI', 'paper', null);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;


select throws_ok(
  $$ insert into public.test_sheets (organization_id, client_id, employee_id, test_result_id, storage_path, digest)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000001', 'test-sheets/ion/v1.pdf', repeat('a', 64)) $$,
  '23514', 'new row for relation "test_sheets" violates check constraint "test_sheets_path_in_organization"',
  'a test sheet''s file is under its organization'
);

select lives_ok(
  $$ insert into public.test_sheets (id, organization_id, client_id, employee_id, test_result_id, storage_path, digest) values
       ('75757575-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001/test-sheets/ion/v1.pdf', repeat('a', 64)),
       ('75757575-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', '7e7e7e7e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001/test-sheets/ana/v1.pdf', repeat('a', 64)) $$,
  'a portal pass gets its test sheet'
);

select throws_ok(
  $$ insert into public.test_sheets (organization_id, client_id, employee_id, test_result_id, storage_path, digest)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001/test-sheets/paper.pdf', repeat('a', 64)) $$,
  '23514', 'test_sheet_not_of_attempt', 'a paper result has no test sheet'
);

select throws_ok(
  $$ insert into public.test_sheets (organization_id, client_id, employee_id, test_result_id, storage_path, digest)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001/test-sheets/other.pdf', repeat('a', 64)) $$,
  '23505', null, 'a result has one test sheet'
);

select lives_ok(
  $$ update public.test_sheets set storage_path = '11111111-0000-4000-8000-000000000001/test-sheets/ion/v2.pdf', digest = repeat('b', 64), version = 2
     where id = '75757575-0000-4000-8000-000000000001' $$,
  'a write moves the sheet to its next version'
);

select throws_ok(
  $$ update public.test_sheets set storage_path = 'test-sheets/ion/v3.pdf', digest = repeat('c', 64), version = 3
     where id = '75757575-0000-4000-8000-000000000001' $$,
  '23514', 'new row for relation "test_sheets" violates check constraint "test_sheets_path_in_organization"',
  'and its next version is under its organization too'
);

select throws_ok(
  $$ update public.test_sheets set storage_path = '11111111-0000-4000-8000-000000000001/test-sheets/ion/v9.pdf', version = 9
     where id = '75757575-0000-4000-8000-000000000001' $$,
  'TST08', 'test_sheet_kept', 'a version is never skipped'
);

select throws_ok(
  $$ update public.test_sheets set test_result_id = '7e7e7e7e-0000-4000-8000-000000000002', version = 3
     where id = '75757575-0000-4000-8000-000000000001' $$,
  'TST08', 'test_sheet_kept', 'a sheet never moves to another result'
);

select throws_ok(
  $$ delete from public.test_sheets where id = '75757575-0000-4000-8000-000000000001' $$,
  'TST08', 'test_sheet_kept', 'a test sheet is not deleted'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select count(*)::integer from public.test_sheets $$,
  $$ values (2) $$,
  'members read their test sheets'
);

select throws_ok(
  $$ insert into public.test_sheets (organization_id, client_id, employee_id, test_result_id, storage_path, digest)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000003', 'x.pdf', repeat('a', 64)) $$,
  '42501', null, 'members do not write a test sheet'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is_empty($$ select * from public.test_sheets $$, 'another organization reads none');

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is_empty(
  $$ select test_result_id from public.test_sheets $$,
  'the employee reads no test sheet, not even their own: the portal reads through the API'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select results_eq(
  $$ select count(*)::integer from public.test_sheets $$,
  $$ values (0) $$,
  'nor does the client administrator'
);


select pg_temp.act_as_postgres();

select lives_ok(
  $$ insert into public.signature_requests (id, organization_id, client_id, test_sheet_id, slot, signer_account_id) values
       ('f0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000001', 'trainee', 'dddddddd-0000-4000-8000-000000000001'),
       ('f0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000001', 'examiner', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a test sheet''s trainee goes to the employee''s participant and its examiner to a member'
);

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, test_sheet_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000001', 'examiner', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '23505', null, 'a slot of a test sheet has one live request'
);

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, test_sheet_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000001') $$,
  'SIG05', 'signer_not_of_client', 'the trainee of a test sheet is the employee''s own participant'
);

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, test_sheet_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002', 'examiner', 'bbbbbbbb-0000-4000-8000-000000000001') $$,
  'SIG05', 'signer_not_of_client', 'the examiner is a member of the organization or a participant of the client'
);

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, test_sheet_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'SIG03', 'slot_not_on_sheet', 'a test sheet has no trainer'
);

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'examiner', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'SIG03', 'slot_not_on_record', 'a request names a record or a test sheet'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select results_eq(
  $$ select slot::text from public.signature_requests order by slot $$,
  $$ values ('trainee') $$,
  'the employee reads only the request on their own test sheet addressed to them'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');

select is_empty($$ select * from public.signature_requests $$, 'another employee reads none of them');

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, slot, signer_account_id, test_sheet_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'examiner', 'aaaaaaaa-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002') $$,
  '42501', null, 'a member does not issue a test sheet''s request: the API does'
);


select pg_temp.act_as_postgres();

insert into public.signing_sessions (id, account_id, place, participant_id, channel, address, code_hash, verified_at) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'portal', '9e9e9e9e-0000-4000-8000-000000000001', 'email', 'ion@example.com', 'hash', now()),
  ('5e5e5e5e-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'portal', '9e9e9e9e-0000-4000-8000-000000000001', 'email', 'ion@example.com', 'hash', now());

insert into public.signing_session_items (session_id, position, request_id) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 0, 'f0000000-0000-4000-8000-000000000001');

create or replace function pg_temp.sign_trainee(p_session uuid)
returns void language sql as $$
  insert into public.test_sheet_signatures (
    organization_id, client_id, test_sheet_id, slot, request_id, method, signer_account_id,
    signer_name, channel, address, code_sent_at, code_verified_at, digest_before, digest_after,
    certificate_serial, signing_session_id
  )
  values (
    '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001',
    '75757575-0000-4000-8000-000000000001', 'trainee', 'f0000000-0000-4000-8000-000000000001',
    'electronic', 'dddddddd-0000-4000-8000-000000000001', 'Popescu Ion', 'email', 'ion@example.com',
    now(), now(), repeat('b', 64), repeat('c', 64), '0a1b', p_session
  );
$$;

select throws_ok(
  $$ select pg_temp.sign_trainee('5e5e5e5e-0000-4000-8000-000000000002') $$,
  'SIG09', 'session_mismatch', 'a signature needs a session that lists its request'
);

select lives_ok(
  $$ select pg_temp.sign_trainee('5e5e5e5e-0000-4000-8000-000000000001') $$,
  'the trainee signs the test sheet through the session'
);

select results_eq(
  $$ select state, signing_session_id from public.signature_requests where id = 'f0000000-0000-4000-8000-000000000001' $$,
  $$ values ('signed', '5e5e5e5e-0000-4000-8000-000000000001'::uuid) $$,
  'the evidence settles its request'
);

select throws_ok(
  $$ update public.test_sheet_signatures set signer_name = 'Altcineva' $$,
  'SIG06', 'signature_written_once', 'a test sheet''s signature is written once'
);

select throws_ok(
  $$ delete from public.test_sheet_signatures $$,
  'SIG06', 'signature_written_once', 'and never deleted'
);


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

update public.test_results set examiner_name = 'Dan MARIN', examiner_job_title = 'Evaluator de risc'
where id = '7e7e7e7e-0000-4000-8000-000000000001';

select results_eq(
  $$ select state, void_reason, voided_by from public.signature_requests where id = 'f0000000-0000-4000-8000-000000000002' $$,
  $$ values ('void', 'signer_changed', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'a change of examiner voids the pending examiner request'
);

select results_eq(
  $$ select state from public.signature_requests where id = 'f0000000-0000-4000-8000-000000000001' $$,
  $$ values ('signed') $$,
  'and leaves the trainee''s signature alone'
);

select lives_ok(
  $$ select public.mark_test_sheet_paper_signature('75757575-0000-4000-8000-000000000001', 'examiner') $$,
  'a member marks the examiner as signed on paper'
);

select results_eq(
  $$ select method, signer_name, signer_job_title, marked_by from public.test_sheet_signatures where slot = 'examiner' $$,
  $$ values ('paper', 'Dan MARIN', 'Evaluator de risc', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'the paper signature names the result''s examiner'
);

select throws_ok(
  $$ update public.test_results set examiner_name = 'Altcineva', examiner_job_title = 'Inspector SSM'
     where id = '7e7e7e7e-0000-4000-8000-000000000001' $$,
  'TST07', 'examiner_signed', 'the examiner no longer changes once they signed'
);

select lives_ok(
  $$ update public.test_results set taken_on = taken_on where id = '7e7e7e7e-0000-4000-8000-000000000001' $$,
  'an update that leaves the examiner alone is not refused'
);

select throws_ok(
  $$ select public.mark_test_sheet_paper_signature('75757575-0000-4000-8000-000000000001', 'trainee') $$,
  'SIG02', 'slot_signed', 'a signed slot is not marked again'
);

select throws_ok(
  $$ select public.mark_test_sheet_paper_signature('75757575-0000-4000-8000-000000000001', 'trainer') $$,
  'SIG03', 'slot_not_on_sheet', 'a test sheet has no trainer to mark'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.mark_test_sheet_paper_signature('75757575-0000-4000-8000-000000000002', 'examiner') $$,
  'P0002', 'test_sheet_not_found', 'another organization marks nothing'
);


select pg_temp.act_as_postgres();

insert into public.signature_requests (id, organization_id, client_id, test_sheet_id, slot, signer_account_id) values
  ('f0000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000002');

insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, marked_by)
values ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'withdrawn', 'aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select state, void_reason from public.signature_requests where id = 'f0000000-0000-4000-8000-000000000003' $$,
  $$ values ('void', 'withdrawn') $$,
  'a withdrawn agreement voids the pending trainee request of a test sheet'
);

select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, test_sheet_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000002') $$,
  'SIG05', 'agreement_withdrawn', 'and no new one goes out while it stands'
);


insert into public.signature_requests (id, organization_id, client_id, test_sheet_id, slot, signer_account_id) values
  ('f0000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '75757575-0000-4000-8000-000000000002', 'examiner', 'dddddddd-0000-4000-8000-000000000003');

update public.client_participants set revoked_at = now() where id = '9e9e9e9e-0000-4000-8000-000000000003';

select results_eq(
  $$ select state, void_reason from public.signature_requests where id = 'f0000000-0000-4000-8000-000000000004' $$,
  $$ values ('void', 'signer_left') $$,
  'an examiner who leaves the client loses their pending request'
);

select * from finish();
rollback;
