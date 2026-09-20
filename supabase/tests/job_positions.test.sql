begin;
select plan(20);

-- Fixtures: two organizations with one member and one client each.
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

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f2f2f2f2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Contabil');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

-- An employee without a position gets the one named like the contract title.
insert into public.employees (id, organization_id, client_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', '  sudor ', '2020-03-01'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Lăcătuș', '2021-03-01');

select results_eq(
  $$ select job_position_id from public.employees where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('f1f1f1f1-0000-4000-8000-000000000001'::uuid) $$,
  'an employee joins the existing position whose name matches the title, whatever its case or spacing'
);

select results_eq(
  $$ select p.name, p.staff_category::text from public.job_positions p
     join public.employees e on e.job_position_id = p.id where e.id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  $$ values ('Lăcătuș', 'execution') $$,
  'a title the client does not have yet becomes a position, in the category with the shorter interval'
);

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, job_position_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Cross', 'Client', 'Contabil', '2020-01-01', 'f2f2f2f2-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'an employee cannot fill a position of another client'
);

select throws_ok(
  $$ insert into public.job_positions (organization_id, client_id, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', ' SUDOR') $$,
  '23505',
  null,
  'a client has one position of a name, whatever its case or spacing'
);

-- Owner A -------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select results_eq(
  $$ select name from public.job_positions order by name $$,
  $$ values ('Lăcătuș'), ('Sudor') $$,
  'a member reads the positions of their organization only'
);

select lives_ok(
  $$ insert into public.job_positions (id, organization_id, client_id, name, staff_category, work_zone, created_by)
     values ('f1f1f1f1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil', 'technical_administrative', 'Birou', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member creates a position for their active client'
);

select lives_ok(
  $$ update public.job_positions set training_interval_months = 12
      where id = 'f1f1f1f1-0000-4000-8000-000000000009' $$,
  'a technical-administrative position can be trained once a year'
);

select throws_ok(
  $$ update public.job_positions set staff_category = 'execution'
      where id = 'f1f1f1f1-0000-4000-8000-000000000009' $$,
  '23514',
  null,
  'an execution position cannot keep an interval over 6 months'
);

select lives_ok(
  $$ update public.job_positions set staff_category = 'execution', training_interval_months = 2
      where id = 'f1f1f1f1-0000-4000-8000-000000000009' $$,
  'an execution position can have an interval of its own'
);

select throws_ok(
  $$ insert into public.job_positions (organization_id, client_id, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor') $$,
  '42501',
  null,
  'a member cannot create a position for an archived client'
);

select throws_ok(
  $$ insert into public.job_positions (organization_id, client_id, name)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Forged') $$,
  '42501',
  null,
  'a member cannot create a position in another organization'
);

select lives_ok(
  $$ insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Nou', 'Post', 'Electrician', '2022-01-01') $$,
  'a member adds an employee with a new title, and the position is created as them'
);

select lives_ok(
  $$ update public.job_positions set name = 'Sudor autorizat', activities = 'Sudură electrică și autogenă'
     where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'a member renames a position'
);

select results_eq(
  $$ select job_title from public.employees where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('  sudor ') $$,
  'renaming a position leaves the contract title alone'
);

select throws_ok(
  $$ update public.job_positions set client_id = 'c1c1c1c1-0000-4000-8000-000000000002'
     where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a member cannot move a position to another client'
);

select throws_ok(
  $$ update public.job_positions set archived_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'JOB01',
  null,
  'a position people still hold cannot be archived'
);

update public.employees set status = 'terminated', terminated_at = '2024-01-01'
where id = 'e1e1e1e1-0000-4000-8000-000000000001';

select lives_ok(
  $$ update public.job_positions set archived_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'it can once the people in it have left'
);

select lives_ok(
  $$ insert into public.job_positions (organization_id, client_id, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor') $$,
  'an archived position releases its name'
);

select throws_ok(
  $$ delete from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  '23503',
  null,
  'a position an employee points at cannot be deleted'
);

delete from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000009';

select is(
  (select count(*)::int from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000009'),
  0,
  'a position nobody fills can be deleted'
);

select * from finish();
rollback;
