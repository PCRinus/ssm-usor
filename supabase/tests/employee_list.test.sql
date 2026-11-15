begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'owner-b@example.com'),
  ('cccccccc-0000-4000-8000-000000000001', 'specialist-a@example.com'),
  ('dddddddd-0000-4000-8000-000000000001', 'ion@example.com')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner'),
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, worker_training_interval_months, administrative_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa', '1590082', 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Beta', '5022670', 3, 6);

insert into public.client_workplaces (id, organization_id, client_id, name) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Atelier');

insert into public.job_positions (id, organization_id, client_id, name, staff_category) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Contabil', 'technical_administrative');

create temp table day as select (now() at time zone 'Europe/Bucharest')::date as today;
grant select on day to authenticated;

insert into public.employees (id, organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title, hired_at, status, terminated_at, cnp) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2024-01-01', 'active', null, '1900101400127'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', null, 'Țăranu', 'Ștefan', 'Sudor', '2024-01-01', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', null, 'Plecat', 'Vasile', 'Sudor', '2024-01-01', 'terminated', '2026-01-31', null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', null, 'Ionescu', 'Ana', 'Contabil', '2024-01-01', 'active', null, null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
select v.id::uuid, '11111111-0000-4000-8000-000000000001', v.client_id::uuid, 'ssm', 'workplace', d.today - v.days_ago, 120, 'Material', 'Ion POP', 'Șef atelier'
from day d, (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 120),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 75),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'c1c1c1c1-0000-4000-8000-000000000002', 10)
) as v (id, client_id, days_ago);

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('7a7a7a7a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000002', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000002', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000003', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000004', 'Contabil');

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('88888888-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001');

insert into public.test_attempts (id, organization_id, client_id, employee_id, participant_id, domain, test, questions, total, score, passed, finished_at) values
  ('a7a7a7a7-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '88888888-0000-4000-8000-000000000001', 'ssm', 'hiring', '[{"text": "Ce?", "options": [{"text": "Da"}], "chosen": [0]}]', 1, 1, true, now());

insert into public.test_attempt_keys (attempt_id, key) values
  ('a7a7a7a7-0000-4000-8000-000000000001', '[[0]]');

insert into public.test_results (id, organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source, attempt_id) values
  ('7e7e7e7e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'hiring', '2026-10-21', 'Test la angajare', 'Ana SPECIALIST', 'Inspector SSM', 'portal', 'a7a7a7a7-0000-4000-8000-000000000001');

insert into public.test_sheets (id, organization_id, client_id, employee_id, test_result_id, storage_path, digest) values
  ('75757575-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '7e7e7e7e-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000001/test-sheets/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/7e7e7e7e-0000-4000-8000-000000000001/v1-a.pdf', repeat('a', 64));

insert into public.signature_requests (organization_id, client_id, training_record_id, test_sheet_id, slot, state, voided_at, void_reason) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', null, 'trainee', 'pending', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', null, '75757575-0000-4000-8000-000000000001', 'trainee', 'pending', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', null, 'trainer', 'pending', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', null, 'trainee', 'void', now(), 'Greșit'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', '7a7a7a7a-0000-4000-8000-000000000003', null, 'trainee', 'signed', null, null);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select last_name, ssm_training_state::text, ssm_training_rank, su_training_state::text
     from public.employee_list order by last_name $$,
  $$ values
    ('Ionescu', 'current', 3, 'untrained'),
    ('Plecat', null, null, null),
    ('Popescu', 'overdue', 0, 'untrained'),
    ('Țăranu', 'due', 2, 'untrained') $$,
  'each current employee carries the state of each domain and the order the list sorts it in; a leaver none'
);

select results_eq(
  $$ select last_name, ssm_test_state::text, su_test_state::text
     from public.employee_list order by last_name $$,
  $$ values
    ('Ionescu', 'none', 'none'),
    ('Plecat', null, null),
    ('Popescu', 'passed', 'none'),
    ('Țăranu', 'none', 'none') $$,
  'each current employee carries the test state of each domain; a leaver none'
);

select results_eq(
  $$ select last_name, signatures_pending_count from public.employee_list order by last_name $$,
  $$ values ('Ionescu', 0), ('Plecat', 0), ('Popescu', 2), ('Țăranu', 0) $$,
  'the pending trainee signatures count the training records and the test sheets alike, never a signed, void or trainer request'
);

select results_eq(
  $$ select last_name, job_position_name, workplace_name, client_name
     from public.employee_list order by last_name $$,
  $$ values
    ('Ionescu', 'Contabil', null, 'Beta'),
    ('Plecat', 'Sudor', null, 'Alfa'),
    ('Popescu', 'Sudor', 'Atelier', 'Alfa'),
    ('Țăranu', 'Sudor', null, 'Alfa') $$,
  'each employee carries the names the list shows and sorts by'
);

select is(
  (select search_name from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  'taranu stefan',
  'the search name is lowercase and without diacritics'
);

select hasnt_column('public', 'employee_list', 'cnp', 'the list never reads the CNP');

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000002';

select is(
  (select ssm_training_state::text from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000004'),
  null,
  'an employee of an archived client has no state, as the training rules no longer follow them'
);

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');

select results_eq(
  $$ select last_name from public.employee_list order by last_name $$,
  $$ values ('Ionescu'), ('Plecat'), ('Popescu'), ('Țăranu') $$,
  'a member who is not an owner reads the same list; a lead has no employees to hide'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.employee_list),
  0,
  'another organization sees none of the employees'
);

select * from finish();
rollback;
