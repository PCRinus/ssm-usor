begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Issued', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Never issued', '14399840'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Issued before the ids', '22');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil'),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Vânzător'),
  ('b1b1b1b1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Șofer');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Șef', 'Ion', 'Sudor', '2024-01-01'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Simplu', 'Dan', 'Sudor', '2024-01-01'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000002', 'Nou', 'Ana', 'Contabil', '2024-01-01'),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Plecat', 'Vasile', 'Sudor', '2024-01-01'),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000003', 'Fără', 'Maria', 'Vânzător', '2024-01-01'),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000004', 'Vechi', 'Radu', 'Șofer', '2024-01-01');

update public.employees set status = 'terminated', terminated_at = '2026-11-01'
where id = 'e1e1e1e1-0000-4000-8000-000000000004';

insert into public.document_generations (id, organization_id, client_id, issue_date, document_group) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01', 'documentation_set'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-11-24', 'documentation_set'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', '2026-11-24', 'documentation_set');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm_duties', '13', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm_duties', '13', 'documentation_set');

create or replace function pg_temp.fingerprints(p_annex text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'annexes', jsonb_build_array(
      jsonb_build_object('positionId', 'b1b1b1b1-0000-4000-8000-000000000001', 'fingerprint', p_annex),
      jsonb_build_object('positionId', 'b1b1b1b1-0000-4000-8000-000000000004', 'fingerprint', 'driver')
    ),
    'roles', jsonb_build_array(
      jsonb_build_object('role', 'workplace_manager', 'fingerprint', 'manager'),
      jsonb_build_object('role', 'first_aid', 'fingerprint', 'aid'),
      jsonb_build_object('role', 'imminent_danger', 'fingerprint', 'danger'),
      jsonb_build_object('role', 'workers_representative', 'fingerprint', 'representative')
    )
  );
$$;

create or replace function pg_temp.snapshot(p_holder jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('dutyAnnexes', jsonb_build_array(
    jsonb_build_object(
      'number', 1,
      'positionId', 'b1b1b1b1-0000-4000-8000-000000000001',
      'position', 'Sudor',
      'workplaceManagerDuties', p_holder,
      'firstAidDuties', null
    ),
    jsonb_build_object('number', 2, 'positionId', 'b1b1b1b1-0000-4000-8000-000000000004', 'position', 'Șofer',
      'workplaceManagerDuties', jsonb_build_object('people', 'Vechi Radu'))
  ));
$$;

insert into public.document_revisions (organization_id, document_id, revision, status, generation_id, docx_path, issued_at, docx_sha256, superseded_at, data_snapshot, duty_fingerprints) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'superseded', 'a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001/ack-test/1.docx', '2026-10-01 08:00+00', repeat('a', 64), '2026-11-24 08:00+00',
    pg_temp.snapshot(null), pg_temp.fingerprints('welder-old')),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2, 'issued', 'a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001/ack-test/2.docx', '2026-11-24 08:00+00', repeat('b', 64), null,
    pg_temp.snapshot(jsonb_build_object('people', 'Ion ȘEF', 'employeeIds', jsonb_build_array('e1e1e1e1-0000-4000-8000-000000000001'))),
    pg_temp.fingerprints('welder')),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 3, 'draft', 'a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001/ack-test/3.docx', null, null, null,
    pg_temp.snapshot(null), pg_temp.fingerprints('welder-draft')),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 1, 'issued', 'a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001/ack-test/4.docx', '2026-11-24 08:00+00', repeat('c', 64), null,
    pg_temp.snapshot(null), pg_temp.fingerprints('welder'));

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.state(p_employee text)
returns text language sql as $$
  select state from public.employee_duty_acknowledgement_states where employee_id = p_employee::uuid;
$$;

create or replace function pg_temp.record(p_employee text, p_annex text, p_roles jsonb, p_revision int default 2)
returns void language sql as $$
  insert into public.employee_duty_acknowledgements (
    organization_id, client_id, employee_id, revision_id, job_position_id, position_name,
    annex_number, annex_fingerprint, roles, signed_at
  )
  select '11111111-0000-4000-8000-000000000001', e.client_id, e.id, r.id, e.job_position_id, 'Sudor', 1,
    p_annex, p_roles, '2026-11-25 10:00+00'
  from public.employees e, public.document_revisions r
  where e.id = p_employee::uuid
    and r.document_id = 'd1d1d1d1-0000-4000-8000-000000000001' and r.revision = p_revision;
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(pg_temp.state('e1e1e1e1-0000-4000-8000-000000000002'), 'to_sign', 'a worker of a post in the issued revision has a sheet to sign');
select is(pg_temp.state('e1e1e1e1-0000-4000-8000-000000000003'), 'no_annex', 'a post the issued revision has no annex for has no sheet');
select is(pg_temp.state('e1e1e1e1-0000-4000-8000-000000000005'), 'not_issued', 'a client without an issued document 13 has no sheets');

select is(
  (select revision_id from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  (select id from public.document_revisions where docx_path = '11111111-0000-4000-8000-000000000001/ack-test/2.docx'),
  'the sheet is the issued revision''s, not the draft''s nor the superseded one''s'
);

select is(
  (select row(issue_date, annex_number, position_name, annex_fingerprint)::text from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  row('2026-11-24'::date, 1, 'Sudor', 'welder')::text,
  'it reads the day, number, post and fingerprint the revision printed'
);

select is(
  (select roles from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  '[{"role": "workplace_manager", "fingerprint": "manager"}]'::jsonb,
  'a worker a role block names by id holds that role, with its fingerprint'
);

select is(
  (select roles from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  '[]'::jsonb,
  'a worker no block names holds no role'
);

select is(
  (select roles from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000006'),
  '[]'::jsonb,
  'a revision issued before the blocks kept ids names nobody'
);

select lives_ok(
  $$ select pg_temp.record('e1e1e1e1-0000-4000-8000-000000000002', 'welder', '[]') $$,
  'a member records a sheet signed on paper'
);

select is(pg_temp.state('e1e1e1e1-0000-4000-8000-000000000002'), 'signed', 'a sheet signed on the annex and roles in force is signed');

select is(
  (select recorded_by from public.employee_duty_acknowledgements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'the database records who recorded it'
);

select pg_temp.record('e1e1e1e1-0000-4000-8000-000000000001', 'welder', '[]');
select is(
  (select row(state, annex_changed, roles_changed)::text from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  row('sign_again', false, true)::text,
  'a sheet signed without a role the worker now holds is to be signed again, for the roles'
);

select pg_temp.record('e1e1e1e1-0000-4000-8000-000000000001', 'welder-old', '[{"role": "workplace_manager", "fingerprint": "manager"}]', 1);
select is(
  (select row(state, annex_changed, roles_changed)::text from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  row('sign_again', true, false)::text,
  'the newest record counts: signed on an older annex, it is to be signed again for the annex'
);

select is(
  (select duties_acknowledgement_state from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  'signed',
  'the workers list carries the state'
);

select is(
  (select duties_acknowledgement_state from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000004'),
  null,
  'a former employee carries none in the list'
);

select throws_ok(
  $$ update public.employee_duty_acknowledgements set annex_fingerprint = 'x' $$,
  '42501', null,
  'a record is never changed'
);

select lives_ok(
  $$ delete from public.employee_duty_acknowledgements
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' and annex_fingerprint = 'welder-old' $$,
  'a mistaken record is removed'
);

select is(
  (select row(state, annex_changed, roles_changed)::text from public.employee_duty_acknowledgement_states where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  row('sign_again', false, true)::text,
  'the record before it is current again'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is((select count(*)::int from public.employee_duty_acknowledgements), 0, 'another organization reads no records');
select is((select count(*)::int from public.employee_duty_acknowledgement_states), 0, 'nor any state');

select throws_ok(
  $$ insert into public.employee_duty_acknowledgements (
       organization_id, client_id, employee_id, revision_id, job_position_id, position_name,
       annex_number, annex_fingerprint, signed_at
     ) values (
       '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001',
       'e1e1e1e1-0000-4000-8000-000000000003', gen_random_uuid(),
       'b1b1b1b1-0000-4000-8000-000000000002', 'Contabil', 1, 'x', now()
     ) $$,
  '42501', null,
  'nor records one for another organization'
);

select lives_ok(
  $$ delete from public.employee_duty_acknowledgements $$,
  'deleting from another organization runs'
);

reset role;
select is((select count(*)::int from public.employee_duty_acknowledgements), 2, 'and removes nothing');

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000001';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ select pg_temp.record('e1e1e1e1-0000-4000-8000-000000000002', 'welder', '[]') $$,
  'CLA01', null,
  'an archived client takes no record'
);

reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$ select * from public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  'an archived client with records is deleted'
);
select is((select count(*)::int from public.employee_duty_acknowledgements), 0, 'and its records with it');

select * from finish();
rollback;
