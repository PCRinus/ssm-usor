begin;
select plan(24);

-- Fixtures: organization A with an owner and a specialist, organization B with an owner;
-- one active client each, plus an archived client in A.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.profiles (user_id, full_name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Owner A'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Specialist A');

insert into public.clients (id, organization_id, legal_name, cui, archived_at) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', null),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', now()),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null);

insert into public.employees (id, organization_id, client_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Manager magazin', '2020-03-01'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Ionescu', 'Maria', 'Administrator', '2021-06-15');

insert into public.client_workplaces (organization_id, client_id, name, is_registered_office) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu social', true),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sediu social B', true);

insert into public.client_responsible_persons (organization_id, client_id, employee_id, full_name, job_title, roles) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'Ion Popescu', 'Manager magazin', '{workplace_manager,first_aid}'),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', null, 'Maria Ionescu', 'Administrator', '{workplace_manager}');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select throws_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name)
     values ('11111111-0000-4000-8000-000000000001', 'c2c2c2c2-0000-4000-8000-000000000001', 'Cross') $$,
  '23503',
  null,
  'a workplace cannot reference a client of another organization'
);

select throws_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name, is_registered_office)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Al doilea sediu', true) $$,
  '23505',
  null,
  'a client has one registered office'
);

select throws_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name, county_code)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Punct de lucru', 'XX') $$,
  '23514',
  null,
  'a workplace county must be on the list'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, employee_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001', 'Maria Ionescu', 'Administrator', '{first_aid}') $$,
  '23503',
  null,
  'a responsible person cannot point at an employee of another client'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Fără Rol', 'Operator', '{}') $$,
  '23514',
  null,
  'a responsible person holds at least one role'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, employee_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'Ion Popescu', 'Manager magazin', '{imminent_danger}') $$,
  '23505',
  null,
  'an employee appears once among a client''s responsible persons'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Ana Vasile', 'Vânzătoare', '{workers_representative}') $$,
  '23514',
  null,
  'a workers'' representative is one of the client''s employees'
);

select lives_ok(
  $$ update public.client_responsible_persons
     set roles = '{workplace_manager,first_aid,risk_evaluation_team,imminent_danger,workers_representative}'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'an employee can hold all five roles'
);

select throws_ok(
  $$ update public.clients set training_day_from = 12, training_day_to = 7
     where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'the training days are ordered'
);

-- Owner A -------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select results_eq(
  $$ select name from public.client_workplaces order by name $$,
  $$ values ('Sediu social') $$,
  'a member sees only workplaces of their organization'
);

select results_eq(
  $$ select full_name from public.client_responsible_persons order by full_name $$,
  $$ values ('Ion Popescu') $$,
  'a member sees only responsible persons of their organization'
);

select lives_ok(
  $$ update public.organizations
     set legal_name = 'S.C. ORG A S.R.L.', cui = '1590082', legal_representative_name = 'Owner A', legal_representative_role = 'Administrator'
     where id = '11111111-0000-4000-8000-000000000001' $$,
  'an owner fills in the organization''s legal details'
);

select is(
  (select legal_name from public.organizations where id = '11111111-0000-4000-8000-000000000001'),
  'S.C. ORG A S.R.L.',
  'the legal details are stored'
);

select throws_ok(
  $$ update public.organizations set terms_version = 'forged' where id = '11111111-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'an owner cannot write the accepted terms'
);

select lives_ok(
  $$ update public.profiles set professional_title = 'Evaluator autorizat'
     where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'a person writes their own professional title'
);

select results_eq(
  $$ select professional_title from public.organization_member_list() where email = 'owner-a@test' $$,
  $$ values ('Evaluator autorizat') $$,
  'the member list returns the professional title'
);

select throws_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Punct de lucru') $$,
  'CLA01',
  null,
  'an archived client takes no new workplaces'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sneaky One', 'Operator', '{first_aid}') $$,
  '42501',
  null,
  'a member cannot add a responsible person to another organization'
);

-- Specialist A ---------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002', '{"provider":"email"}');

select lives_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name, county_code, locality)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Punct de lucru Timișoara', 'TM', 'Timișoara') $$,
  'a specialist adds a workplace'
);

select lives_ok(
  $$ update public.clients
     set legal_representative_role = 'Administrator', periodic_training_minutes = 120,
         administrative_training_interval_months = 6, worker_training_interval_months = 3,
         training_first_month = 2, training_day_from = 2, training_day_to = 7
     where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'a specialist sets the representative''s role and the training schedule'
);

select throws_ok(
  $$ update public.clients set periodic_training_minutes = 180
     where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'a periodic training lasts at most two hours'
);

update public.organizations set legal_name = 'S.C. HIJACKED S.R.L.'
  where id = '11111111-0000-4000-8000-000000000001';

select is(
  (select legal_name from public.organizations where id = '11111111-0000-4000-8000-000000000001'),
  'S.C. ORG A S.R.L.',
  'a specialist cannot change the organization''s legal details'
);

-- Owner B ---------------------------------------------------------------------------
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001', '{"provider":"email"}');

update public.organizations set legal_name = 'S.C. HIJACKED S.R.L.'
  where id = '11111111-0000-4000-8000-000000000001';
update public.client_workplaces set name = 'Hijacked' where client_id = 'c1c1c1c1-0000-4000-8000-000000000001';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select is(
  (select legal_name from public.organizations where id = '11111111-0000-4000-8000-000000000001'),
  'S.C. ORG A S.R.L.',
  'an owner of another organization cannot change it'
);

select is(
  (select count(*)::int from public.client_workplaces where name = 'Hijacked'),
  0,
  'a member of another organization cannot change a workplace'
);

select * from finish();
rollback;
