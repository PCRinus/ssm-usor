begin;
select plan(47);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Brutăria Dulce SRL', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Arhivat SRL', '14399840', 'client'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Alt Client SRL', '5022670', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', ' Vânzător '),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 'Șofer');

insert into public.client_workplaces (id, organization_id, client_id, name) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Magazinul din centru');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, birth_place) values
  ('ee000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'Ionescu', 'Maria', 'Vânzătoare', '2020-01-10', 'Iași'),
  ('ee000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003',
    'dddddddd-0000-4000-8000-000000000003', 'Stan', 'Petre', 'Șofer', '2019-04-01', null);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create or replace function pg_temp.payload()
returns jsonb language sql as $$
  select $payload$ {
    "employees": [
      { "key": "p1", "job_position_id": "dddddddd-0000-4000-8000-000000000001",
        "workplace_id": "eeeeeeee-0000-4000-8000-000000000001", "last_name": "Popescu",
        "first_name": "Ion", "cnp": "1900101123459", "birth_date": "1990-01-01",
        "blood_group": "A(II)", "rh_factor": "+", "job_title": "Vânzător",
        "hired_at": "2015-03-02", "status": "active" },
      { "key": "p2", "job_position_id": "dddddddd-0000-4000-8000-000000000001",
        "last_name": "Dumitru", "first_name": "Ana", "job_title": "Vânzător",
        "hired_at": "2018-01-08", "status": "terminated", "terminated_at": "2022-06-30" },
      { "key": "p3", "id": "ee000000-0000-4000-8000-000000000001", "replace": ["job_title"],
        "birth_place": "Cluj-Napoca", "home_address": "Str. Lungă 1, Iași",
        "job_title": "Vânzător principal", "hired_at": "2019-01-01" }
    ],
    "trainings": [
      { "key": "t1", "domain": "ssm", "phase": "introductory_general", "held_on": "2015-03-02",
        "duration_minutes": 480, "material": "Legislația SSM", "trainer_name": "Vasile Georgescu",
        "trainer_job_title": "Inspector SSM", "verifier_name": "Elena Marin",
        "verifier_job_title": "Administrator",
        "records": [{ "employee_key": "p1" }, { "employee_key": "p3" }] },
      { "key": "t2", "domain": "ssm", "phase": "workplace", "held_on": "2015-03-03",
        "duration_minutes": 480, "material": "Riscurile postului", "trainer_name": "Elena Marin",
        "trainer_job_title": "Administrator",
        "records": [{ "employee_key": "p1", "admitted_on": "2015-03-04",
          "admitted_by_name": "Elena Marin", "admitted_by_job_title": "Administrator" }] },
      { "key": "t3", "domain": "psi", "phase": "periodic", "held_on": "2023-05-10",
        "duration_minutes": 60, "material": "Stingătoare", "trainer_name": "Vasile Georgescu",
        "trainer_job_title": "Cadru tehnic PSI",
        "records": [{ "employee_key": "p1" }, { "employee_key": "p2" }, { "employee_key": "p3" }] }
    ],
    "test_results": [
      { "employee_key": "p1", "domain": "ssm", "test": "hiring", "taken_on": "2015-03-02",
        "material": "Testul la angajare", "examiner_name": "Elena Marin",
        "examiner_job_title": "Administrator" },
      { "employee_key": "p1", "domain": "psi", "test": "hiring", "taken_on": "2015-03-03",
        "material": "Testul la angajare", "examiner_name": "Elena Marin",
        "examiner_job_title": "Administrator" },
      { "employee_key": "p3", "domain": "psi", "test": "annual", "taken_on": "2024-05-10",
        "material": "Testul anual", "examiner_name": "Vasile Georgescu",
        "examiner_job_title": "Cadru tehnic PSI" }
    ],
    "files": [
      { "employee_key": "p1", "import_file_id": "f0000000-0000-4000-8000-000000000001" },
      { "employee_key": "p1", "import_file_id": "f0000000-0000-4000-8000-000000000002" },
      { "employee_key": "p1", "import_file_id": "f0000000-0000-4000-8000-000000000003" },
      { "employee_key": "p3", "import_file_id": "f0000000-0000-4000-8000-000000000001" },
      { "employee_key": "p3", "import_file_id": "f0000000-0000-4000-8000-000000000001" }
    ],
    "quality": { "people": { "changed": 1, "unticked": 0, "kept": 2 },
      "rows": { "changed": 0, "unticked": 1, "kept": 5 },
      "tests": { "changed": 0, "unticked": 0, "kept": 3 } }
  } $payload$::jsonb;
$$;

create temp table applied (result jsonb);
grant select, insert on applied to authenticated;

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'employees', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'employees', 'cccccccc-0000-4000-8000-000000000002', true, 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'employees', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.import_files (id, import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256) values
  ('f0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Fise/IMG_0001.jpg', 'IMG_0001.jpg', 'image/jpeg', 3145728, repeat('a', 64)),
  ('f0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Fise/IMG_0002.HEIC', 'IMG_0002.HEIC', 'image/heic', 2097152, repeat('b', 64)),
  ('f0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001',
    'Fise/Popescu verso.pdf', 'Popescu verso.pdf', 'application/pdf', 409600, repeat('c', 64)),
  ('f0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001',
    'IMG_0009.jpg', 'IMG_0009.jpg', 'image/jpeg', 1048576, repeat('d', 64));

update public.import_files set state = 'read', is_scan = true,
  derived_path = regexp_replace(storage_path, '\.jpg$', '.jpeg'), derived_size_bytes = 512000, derived_sha256 = repeat('1', 64)
where id = 'f0000000-0000-4000-8000-000000000001';
update public.import_files set state = 'read', is_scan = true,
  derived_path = regexp_replace(storage_path, '\.heic$', '.jpg'), derived_size_bytes = 480000, derived_sha256 = repeat('2', 64)
where id = 'f0000000-0000-4000-8000-000000000002';
update public.import_files set state = 'read', is_scan = true, page_count = 1
where id = 'f0000000-0000-4000-8000-000000000003';

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"people": []}'
where id in (
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

select pg_temp.act_as_postgres();
update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000002';

select has_column('public', 'client_files', 'import_file_id', 'an employee''s file names the import file it is a copy of');
select ok(
  has_function_privilege('authenticated', 'public.apply_employee_import(uuid, integer, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.apply_employee_import(uuid, integer, jsonb)', 'execute'),
  'members confirm an employee import, the anonymous do not'
);
select ok(
  not has_column_privilege('authenticated', 'public.client_files', 'import_file_id', 'insert')
    and not has_column_privilege('authenticated', 'public.client_files', 'import_file_id', 'update'),
  'and no member writes the link of a file to an import'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, pg_temp.payload()) $$,
  'P0002',
  null,
  'another organization''s member confirms nothing'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000002', 0, '{}') $$,
  '22023',
  null,
  'a client import is not confirmed as an employee import'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0, '{"client": {}}') $$,
  '22023',
  null,
  'nor an employee import as a client import'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000004', 0, '{}') $$,
  'IMP01',
  null,
  'an import still uploading is not confirmed'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 1, pg_temp.payload()) $$,
  'IMP02',
  null,
  'nor one confirmed on an older version'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000003', 0, '{}') $$,
  'CLA01',
  null,
  'an archived client takes no employees'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, pg_temp.payload() || '{"clients": []}') $$,
  '22023',
  null,
  'a payload list the contract does not name is refused'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{employees,2,id}', '"ee000000-0000-4000-8000-000000000003"')) $$,
  '22023',
  null,
  'another client''s employee is not completed'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       pg_temp.payload() #- '{employees,0,job_position_id}') $$,
  '22023',
  null,
  'a new employee without a job position is refused rather than given one made from their title'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{employees,0,job_position_id}', '"dddddddd-0000-4000-8000-000000000003"')) $$,
  '22023',
  null,
  'and so is one with another client''s position'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{employees,1,terminated_at}', '"2017-01-01"')) $$,
  '23514',
  'new row for relation "employees" violates check constraint "employees_terminated_after_hire"',
  'a leaver keeps the employees'' rules'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,duration_minutes}', '601')) $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_duration_range"',
  'a training over 600 minutes is refused by the trainings'' rule'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,duration_minutes}', '40000')) $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_duration_range"',
  'by the same rule beyond what the column holds'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,duration_minutes}', '0')) $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_duration_range"',
  'and under a minute'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,2,held_on}', '"2099-01-01"')) $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_held_on_past"',
  'a training dated after today is refused'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{test_results,2,taken_on}', '"2099-01-01"')) $$,
  '23514',
  'new row for relation "test_results" violates check constraint "test_results_taken_on_past"',
  'and so is a test'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,2,records,0}',
         '{"employee_key": "p1", "admitted_on": "2023-05-10", "admitted_by_name": "Elena Marin", "admitted_by_job_title": "Administrator"}')) $$,
  '23514',
  'new row for relation "training_records" violates check constraint "training_records_admission_on_workplace_training"',
  'the admission goes only on a workplace training'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,verifier_job_title}', 'null')) $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_verifier_whole"',
  'a verifier has a name and a function'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,phase}', '"supplementary"')) $$,
  '23514',
  'new row for relation "trainings" violates check constraint "trainings_supplementary_reason_matches_phase"',
  'a supplementary training has its reason'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,2,records,1,employee_key}', '"p1"')) $$,
  '22023',
  null,
  'an employee attends a training once'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,2,records}', '[]')) $$,
  '22023',
  null,
  'a training has attendees'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,records,0,employee_key}', '"p9"')) $$,
  '22023',
  null,
  'a record names one of the payload''s employees'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{trainings,0,records,0}', '{"employee_id": "ee000000-0000-4000-8000-000000000003"}')) $$,
  '22023',
  null,
  'and never an employee by id'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       pg_temp.payload() #- '{test_results,0,examiner_name}' #- '{test_results,0,examiner_job_title}') $$,
  '23514',
  'new row for relation "test_results" violates check constraint "test_results_paper_has_examiner"',
  'a paper test result has its examiner'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{test_results,1,domain}', '"ssm"')) $$,
  '23514',
  'new row for relation "test_results" violates check constraint "test_results_hiring_once"',
  'an employee passes the hiring test of a domain once'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0,
       jsonb_set(pg_temp.payload(), '{files,0,import_file_id}', '"f0000000-0000-4000-8000-000000000004"')) $$,
  '22023',
  null,
  'a file of another import is not taken'
);

select is(
  (select count(*)::integer from public.employees where client_id = 'cccccccc-0000-4000-8000-000000000001'),
  1,
  'a refused confirmation leaves nothing behind'
);

select lives_ok(
  $$ insert into applied select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, pg_temp.payload()) $$,
  'a member confirms the import'
);

select pg_temp.act_as_postgres();

select is(
  (select result -> 'employees' ->> 'p3' from applied),
  'ee000000-0000-4000-8000-000000000001',
  'the existing employee is completed, not duplicated'
);

select results_eq(
  $$ select e.last_name, e.first_name, e.cnp, e.birth_date, e.blood_group, e.rh_factor, e.job_title,
            e.hired_at, e.status::text, e.terminated_at, e.job_position_id, e.workplace_id, e.created_by
     from public.employees e
     where e.id in (select (value #>> '{}')::uuid from applied, jsonb_each(result -> 'employees')
                    where key in ('p1', 'p2'))
     order by e.last_name $$,
  $$ values
     ('Dumitru', 'Ana', null::text, null::date, null::text, null::text, 'Vânzător', '2018-01-08'::date,
       'terminated', '2022-06-30'::date, 'dddddddd-0000-4000-8000-000000000001'::uuid, null::uuid,
       'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
     ('Popescu', 'Ion', '1900101123459', '1990-01-01'::date, 'A(II)', '+', 'Vânzător', '2015-03-02'::date,
       'active', null::date, 'dddddddd-0000-4000-8000-000000000001'::uuid,
       'eeeeeeee-0000-4000-8000-000000000001'::uuid, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'new employees are created on the position named, a leaver as a former employee'
);

select is(
  (select count(*)::integer from public.job_positions where client_id = 'cccccccc-0000-4000-8000-000000000001'),
  1,
  'and no position is made from a job title'
);

select results_eq(
  $$ select birth_place, home_address, job_title, hired_at from public.employees
     where id = 'ee000000-0000-4000-8000-000000000001' $$,
  $$ values ('Iași', 'Str. Lungă 1, Iași', 'Vânzător principal', '2020-01-10'::date) $$,
  'the existing employee keeps their values, gains the empty ones and takes the one replaced'
);

select results_eq(
  $$ select t.domain::text, t.phase::text, t.held_on, t.duration_minutes::integer, t.source::text,
            t.verifier_name, count(r.id)::integer
     from public.trainings t
     join public.training_records r on r.training_id = t.id
     where t.client_id = 'cccccccc-0000-4000-8000-000000000001'
     group by t.id
     order by t.held_on $$,
  $$ values
     ('ssm', 'introductory_general', '2015-03-02'::date, 480, 'paper', 'Elena Marin', 2),
     ('ssm', 'workplace', '2015-03-03'::date, 480, 'paper', null::text, 1),
     ('psi', 'periodic', '2023-05-10'::date, 60, 'paper', null::text, 3) $$,
  'trainings are held from paper, each with the records of all its attendees'
);

select results_eq(
  $$ select distinct occupation from public.training_records
     where client_id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('Vânzător') $$,
  'a record prints the name of the attendee''s position'
);

select results_eq(
  $$ select r.admitted_on, r.admitted_by_name, r.admitted_by_job_title
     from public.training_records r
     join public.trainings t on t.id = r.training_id
     where t.client_id = 'cccccccc-0000-4000-8000-000000000001' and r.admitted_on is not null $$,
  $$ values ('2015-03-04'::date, 'Elena Marin', 'Administrator') $$,
  'the admission is on the workplace record'
);

select is(
  (select jsonb_array_length(result -> 'training_record_ids') from applied),
  6,
  'the records created are returned for the signed sheets'
);

select results_eq(
  $$ select x.domain::text, x.test::text, x.taken_on, x.grade, x.source::text, x.examiner_name
     from public.test_results x
     where x.client_id = 'cccccccc-0000-4000-8000-000000000001'
     order by x.taken_on $$,
  $$ values
     ('ssm', 'hiring', '2015-03-02'::date, 'admis', 'paper', 'Elena Marin'),
     ('psi', 'hiring', '2015-03-03'::date, 'admis', 'paper', 'Elena Marin'),
     ('psi', 'annual', '2024-05-10'::date, 'admis', 'paper', 'Vasile Georgescu') $$,
  'the paper test results are recorded with their examiner'
);

select is(
  (select jsonb_array_length(result -> 'test_result_ids') from applied),
  3,
  'and returned for the signed sheets'
);

select results_eq(
  $$ select e.last_name, cf.name, cf.original_file_name, cf.mime_type, cf.size_bytes, cf.sha256,
            cf.import_path, cf.uploaded_by
     from public.client_files cf
     join public.employees e on e.id = cf.employee_id
     where cf.import_id = '10000000-0000-4000-8000-000000000001'
     order by e.last_name, cf.name $$,
  $$ values
     ('Ionescu', 'IMG_0001', 'IMG_0001.jpg', 'image/jpeg', 512000, repeat('1', 64), null::text,
       'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
     ('Popescu', 'IMG_0001', 'IMG_0001.jpg', 'image/jpeg', 512000, repeat('1', 64), null::text,
       'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
     ('Popescu', 'IMG_0002', 'IMG_0002.jpg', 'image/jpeg', 480000, repeat('2', 64), null::text,
       'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
     ('Popescu', 'Popescu verso', 'Popescu verso.pdf', 'application/pdf', 409600, repeat('c', 64), null::text,
       'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'each employee gets the upright copy of their photographs and their PDF, once, a shared one as a file of each'
);

select results_eq(
  $$ select c.source_path, c.target_path = cf.storage_path
     from public.import_folder_copies('10000000-0000-4000-8000-000000000001') c
     join public.client_files cf on cf.id = c.client_file_id
     order by c.source_path $$,
  $$ select p, true from (values
       ('11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.jpeg'),
       ('11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001.jpeg'),
       ('11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002.jpg'),
       ('11111111-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003.pdf')
     ) as v (p) order by p $$,
  'the copy job copies the converted photographs and the PDF into each employee''s file'
);

select is(
  (select jsonb_array_length(result -> 'files') from applied),
  4,
  'and the confirmation returns them'
);

select is(
  (select count(*)::integer from public.import_files
   where import_id = '10000000-0000-4000-8000-000000000001' and client_file_id is not null),
  0,
  'the import''s files are not one client file each, as a client import''s are'
);

select results_eq(
  $$ select status::text, confirmed_by, confirmed_at is not null, client_id, quality -> 'rows' ->> 'unticked'
     from public.imports where id = '10000000-0000-4000-8000-000000000001' $$,
  $$ values ('confirmed', 'bbbbbbbb-0000-4000-8000-000000000001'::uuid, true,
       'cccccccc-0000-4000-8000-000000000001'::uuid, '1') $$,
  'the import is confirmed with its counts'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, pg_temp.payload()) $$,
  'IMP01',
  null,
  'and is not confirmed twice'
);

select * from finish();
rollback;
