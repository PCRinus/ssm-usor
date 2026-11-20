begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Client Two', '14399840', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'ion@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'ana@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Marin', 'Dan', 'Sudor', '2020-03-01', 'dan@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Stan', 'Maria', 'Sudor', '2020-03-01', 'maria@example.com');

insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, uploaded_by) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Act adițional semnat', 'act.pdf', 'application/pdf', 10, repeat('a', 64), 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Cerere Popescu', 'cerere-1.pdf', 'application/pdf', 10, repeat('b', 64), 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Cerere Ionescu', 'cerere-2.pdf', 'application/pdf', 10, repeat('c', 64), 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('f1f1f1f1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Cerere altui client', 'cerere-3.pdf', 'application/pdf', 10, repeat('d', 64), 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, generated_at, signed_at, client_file_id, storage_path, employee_signed_at, employer_signed_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'signed_on_paper', '2026-10-01 09:00+03', '2026-10-02 12:00+03', 'f1f1f1f1-0000-4000-8000-000000000001', null, null, null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'signed_electronically', '2026-10-01 09:00+03', '2026-10-02 10:00+03', null, 'v2.pdf', '2026-10-01 10:00+03', '2026-10-02 10:00+03'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'generated', '2026-10-01 09:00+03', null, null, null, null, null);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.employee_signing_agreements set withdrawal_requested_on = '2026-11-10'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  '23514', null, 'an agreement that is not withdrawn holds no withdrawal request'
);
select lives_ok(
  $$ update public.employee_signing_agreements
     set state = 'withdrawn', withdrawal_requested_on = '2026-11-10', withdrawal_file_id = 'f1f1f1f1-0000-4000-8000-000000000002'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'a member records the withdrawal of a paper agreement with the request''s day and scan'
);
select is(
  (select row(state, signed_at, client_file_id, withdrawal_requested_on, withdrawal_file_id)::text
   from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  row('withdrawn', '2026-10-02 12:00+03'::timestamptz, 'f1f1f1f1-0000-4000-8000-000000000001'::uuid, '2026-11-10'::date, 'f1f1f1f1-0000-4000-8000-000000000002'::uuid)::text,
  'beside the paper signature it keeps'
);
select throws_ok(
  $$ update public.employee_signing_agreements set withdrawal_requested_on = '2026-11-12'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'SIG10', 'agreement_withdrawal_recorded', 'the request''s day stays as recorded'
);
select throws_ok(
  $$ update public.employee_signing_agreements set withdrawal_file_id = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'SIG10', 'agreement_withdrawal_recorded', 'and so does its scan while the file exists'
);
select lives_ok(
  $$ update public.employee_signing_agreements
     set state = 'withdrawn', withdrawal_requested_on = '2026-11-11', withdrawal_file_id = 'f1f1f1f1-0000-4000-8000-000000000003'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'a member records the withdrawal of an agreement signed electronically with the request'
);
select is(
  (select row(state, signed_at, storage_path, employee_signed_at, employer_signed_at, withdrawal_requested_on, withdrawal_file_id)::text
   from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  row('withdrawn', '2026-10-02 10:00+03'::timestamptz, 'v2.pdf', '2026-10-01 10:00+03'::timestamptz, '2026-10-02 10:00+03'::timestamptz, '2026-11-11'::date, 'f1f1f1f1-0000-4000-8000-000000000003'::uuid)::text,
  'and its signatures stay beside the request'
);
select throws_ok(
  $$ update public.employee_signing_agreements set withdrawal_requested_on = '2026-11-12'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'SIG10', 'agreement_withdrawal_recorded', 'whose day stays as recorded there too'
);
select throws_ok(
  $$ update public.employee_signing_agreements set withdrawal_file_id = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'SIG10', 'agreement_withdrawal_recorded', 'as does its scan'
);
select lives_ok(
  $$ delete from public.client_files where id = 'f1f1f1f1-0000-4000-8000-000000000003' $$,
  'the member may still delete the request''s file'
);
select is(
  (select row(state, withdrawal_requested_on, withdrawal_file_id, employer_signed_at)::text
   from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  row('withdrawn', '2026-11-11'::date, null::uuid, '2026-10-02 10:00+03'::timestamptz)::text,
  'which leaves the request''s day and the signatures and drops the link to the scan'
);
select throws_ok(
  $$ update public.employee_signing_agreements
     set state = 'withdrawn', withdrawal_requested_on = '2026-11-10', withdrawal_file_id = 'f1f1f1f1-0000-4000-8000-000000000004'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  '23503', null, 'the request''s scan is a file of the agreement''s client'
);
select throws_ok(
  $$ update public.employee_signing_agreements set state = 'signed_on_paper', signed_at = now()
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '23514', null, 'a withdrawn agreement moves on only without its request'
);
select lives_ok(
  $$ update public.employee_signing_agreements
     set state = 'signed_on_paper', signed_at = now(), withdrawal_requested_on = null, withdrawal_file_id = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'which a paper agreement signed again by hand clears'
);
select lives_ok(
  $$ update public.employee_signing_agreements
     set state = 'withdrawn', withdrawal_requested_on = '2026-11-13', withdrawal_file_id = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  'and a withdrawal is recorded without a scan'
);

select lives_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, withdrawal_requested_on, withdrawal_file_id)
     values ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'withdrawn', '2026-11-14', 'f1f1f1f1-0000-4000-8000-000000000002') $$,
  'a member records a first agreement as withdrawn with its request'
);

select * from finish();
rollback;
