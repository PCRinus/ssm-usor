begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Brutăria Dulce SRL', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Vânzător');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('ee000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'Ionescu', 'Maria', 'Vânzătoare', '2020-01-10');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select col_is_null('public', 'trainings', 'trainer_name', 'a training may name no trainer');
select col_is_null('public', 'trainings', 'trainer_job_title', 'nor the trainer''s function');
select col_is_null('public', 'trainings', 'material', 'nor its material');
select col_is_null('public', 'trainings', 'duration_minutes', 'nor its duration');

select lives_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, source)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', 'paper') $$,
  'a training from paper holds only what its sheet gives'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_job_title, source)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', 60, 'M', 'Inspector SSM', 'app') $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_app_source_complete"',
  'a training held in the app names its trainer'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, trainer_name, trainer_job_title, source)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', 'Ion POP', 'Inspector SSM', 'app') $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_app_source_complete"',
  'and its material and duration'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, source)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', 601, 'paper') $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_duration_range"',
  'a duration a paper training gives keeps its range'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, trainer_name, source)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', '  ', 'paper') $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_trainer_name_length"',
  'and a trainer it names is not blank'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select isnt(
  public.save_training(
    'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', 'paper',
    '[{"employee_id": "ee000000-0000-4000-8000-000000000001", "occupation": "Vânzător"}]',
    p_duration_minutes => 60::smallint
  ),
  null,
  'a member saves a paper training typed without its trainer or material'
);

select throws_ok(
  $$ select public.save_training(
       'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2021-05-10', 'app',
       '[{"employee_id": "ee000000-0000-4000-8000-000000000001", "occupation": "Vânzător"}]',
       p_duration_minutes => 60::smallint, p_material => 'M') $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_app_source_complete"',
  'but not one held in the app'
);

select lives_ok(
  $$ insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, source)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', 'su', 'annual', '2021-05-10', 'TPSU', 'paper') $$,
  'a paper test result may name no examiner'
);

select pg_temp.act_as_postgres();

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'employees', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001');

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"people": []}'
where id = '10000000-0000-4000-8000-000000000001';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, $payload$ {
       "employees": [
         { "key": "p1", "job_position_id": "dddddddd-0000-4000-8000-000000000001", "last_name": "Popescu",
           "first_name": "Ion", "job_title": "Vânzător", "hired_at": "2015-03-02", "status": "active" }
       ],
       "trainings": [
         { "key": "t1", "domain": "ssm", "phase": "periodic", "held_on": "2021-04-12",
           "records": [{ "employee_key": "p1" }] },
         { "key": "t2", "domain": "su", "phase": "periodic", "held_on": "2021-04-13",
           "duration_minutes": null, "material": "IPSU", "trainer_name": null,
           "records": [{ "employee_key": "p1" }] }
       ],
       "test_results": [
         { "employee_key": "p1", "domain": "su", "test": "annual", "taken_on": "2021-04-13",
           "material": "Testul anual" }
       ],
       "files": [],
       "quality": {}
     } $payload$::jsonb) $$,
  'an import confirms trainings and a test whose sheet names no trainer, material, duration or examiner'
);

select pg_temp.act_as_postgres();

select results_eq(
  $$ select t.held_on, t.duration_minutes::integer, t.material, t.trainer_name, t.trainer_job_title, t.source::text
     from public.trainings t
     join public.training_records r on r.training_id = t.id
     join public.employees e on e.id = r.employee_id
     where e.last_name = 'Popescu' order by t.held_on $$,
  $$ values ('2021-04-12'::date, null::integer, null::text, null::text, null::text, 'paper'),
            ('2021-04-13'::date, null::integer, 'IPSU', null::text, null::text, 'paper') $$,
  'the trainings hold the sheet''s values and nothing in place of the missing ones'
);

select results_eq(
  $$ select x.examiner_name, x.examiner_job_title
     from public.test_results x join public.employees e on e.id = x.employee_id
     where e.last_name = 'Popescu' $$,
  $$ values (null::text, null::text) $$,
  'and the test result names no examiner'
);

select * from finish();
rollback;
