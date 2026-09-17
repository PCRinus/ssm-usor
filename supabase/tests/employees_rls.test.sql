-- pgTAP checks for employee tenancy, the active-client rule, and identifier uniqueness.
-- Run with: pnpm supabase:test (supabase test db)
begin;
select plan(15);

-- Fixtures: two organizations with one member and one client each, plus an archived client in A.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, archived_at) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', null),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', now()),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null);

insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, cnp, employee_number) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', '1900101400127', 'A-1'),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Ionescu', 'Maria', 'Contabil', '2021-06-15', null, null);

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

-- Schema rules that hold regardless of the caller ------------------------------------

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
     values ('11111111-0000-4000-8000-000000000001', 'c2c2c2c2-0000-4000-8000-000000000001', 'Cross', 'Org', 'Sudor', '2020-01-01') $$,
  '23503',
  null,
  'an employee cannot reference a client of another organization even with matching organization_id'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, status)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'No', 'Date', 'Sudor', '2020-01-01', 'terminated') $$,
  '23514',
  null,
  'a terminated employee needs a termination date'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, cnp)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Bad', 'Cnp', 'Sudor', '2020-01-01', '123') $$,
  '23514',
  null,
  'the CNP must have thirteen digits'
);

-- Owner A -------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select results_eq(
  $$ select last_name from public.employees order by last_name $$,
  $$ values ('Popescu') $$,
  'a member sees only employees of their organization'
);

select lives_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Nou', 'Angajat', 'Operator', '2026-09-01') $$,
  'a member can add an employee to an active client of their organization'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sneaky', 'One', 'Operator', '2026-09-01') $$,
  '42501',
  null,
  'a member cannot add an employee to a client of another organization'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Late', 'Joiner', 'Operator', '2026-09-01') $$,
  '42501',
  null,
  'a member cannot add an employee to an archived client'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, cnp)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Dublu', 'Cnp', 'Operator', '2026-09-01', '1900101400127') $$,
  '23505',
  null,
  'the CNP is unique within a client'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, employee_number)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Dublu', 'Marca', 'Operator', '2026-09-01', 'A-1') $$,
  '23505',
  null,
  'the employee number is unique within a client'
);

select lives_ok(
  $$ update public.employees set archived_at = now() where employee_number = 'A-1' $$,
  'a member can archive an employee'
);

select lives_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, cnp, employee_number)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Din nou', 'Ion', 'Sudor', '2026-09-01', '1900101400127', 'A-1') $$,
  'archiving releases the CNP and the employee number'
);

select lives_ok(
  $$ update public.employees set status = 'terminated', terminated_at = '2026-09-10' where last_name = 'Nou' $$,
  'a member can mark their employee as former with a leave date'
);

select throws_ok(
  $$ update public.employees set terminated_at = '2020-01-01' where last_name = 'Nou' $$,
  '23514',
  null,
  'the leave date cannot precede the hire date'
);

select lives_ok(
  $$ update public.employees set status = 'active', terminated_at = null where last_name = 'Nou' $$,
  'a member can reactivate a former employee'
);

select throws_ok(
  $$ update public.employees set organization_id = '22222222-0000-4000-8000-000000000002' where last_name = 'Nou' $$,
  '42501',
  null,
  'a member cannot move an employee to another organization'
);

select * from finish();
rollback;
