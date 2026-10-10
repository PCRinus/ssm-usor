begin;
select plan(33);

-- Fixtures: organization A with an owner, B with a specialist. A has an active client with two
-- workplaces, a second client with one workplace, a client archived below after its rows are
-- in, and a lead; B has one client with one workplace.
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

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Other client of A', '14399840', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Lead of A', '18547290', 'lead'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client');

insert into public.client_workplaces (id, organization_id, client_id, name, is_registered_office) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu social', true),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Gelaterie', false),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sediu social', true),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sediu social', true),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sediu social', true);

insert into public.employees (id, organization_id, client_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Manager magazin', '2020-03-01');

insert into public.client_fire_safety (client_id, organization_id, periodic_training_hours) values
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 2);
insert into public.fire_equipment (id, organization_id, client_id, workplace_id, kind, agent, capacity) values
  ('e3e3e3e3-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'd1d1d1d1-0000-4000-8000-000000000004', 'extinguisher', 'powder', 6);
insert into public.fire_installations (id, organization_id, client_id, workplace_id, kind) values
  ('f3f3f3f3-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'd1d1d1d1-0000-4000-8000-000000000004', 'detection_alarm');
update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.client_fire_safety (client_id, organization_id, periodic_training_hours, administrative_training_interval_months, worker_training_interval_months, training_first_month, training_day_from, training_day_to, waste_kinds, waste_contractor)
     values ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 2, 3, 3, 2, 2, 7, '{"deșeuri de carton, hârtie, plastic"}', 'Salubris S.A.') $$,
  'a member saves the fire-safety facts of an active client'
);

select throws_ok(
  $$ update public.client_fire_safety set periodic_training_hours = 1 where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'a periodic training lasts two hours at least'
);

select throws_ok(
  $$ update public.client_fire_safety set worker_training_interval_months = 12 where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'no category waits more than six months'
);

select throws_ok(
  $$ update public.client_fire_safety set training_day_from = 8 where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'the training days are in order'
);

select throws_ok(
  $$ update public.client_fire_safety set waste_kinds = '{"x"}' where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'a kind of waste has two characters at least'
);

select throws_ok(
  $$ update public.client_fire_safety set waste_kinds = array_fill('hârtie'::text, array[13]) where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'at most twelve kinds of waste'
);

select throws_ok(
  $$ update public.client_fire_safety set client_id = 'c1c1c1c1-0000-4000-8000-000000000002' where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '42501', null, 'the facts never move to another client'
);

select lives_ok(
  $$ update public.client_fire_safety
     set smoking_policy = 'designated_places', smoking_place = 'În curtea interioară, lângă poarta de acces auto'
     where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'a client that allows smoking in designated places says where'
);

select throws_ok(
  $$ update public.client_fire_safety set smoking_place = repeat('x', 241) where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'the smoking place fits in 240 characters'
);

select throws_ok(
  $$ update public.client_fire_safety set smoking_policy = 'forbidden_everywhere' where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'a client that forbids smoking everywhere keeps no smoking place'
);

select throws_ok(
  $$ update public.client_fire_safety set smoking_policy = null where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  '23514', null, 'nor does a client with no smoking rule'
);

select lives_ok(
  $$ update public.client_fire_safety set smoking_policy = 'forbidden_everywhere', smoking_place = null
     where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'forbidding smoking drops the place in the same save'
);

select lives_ok(
  $$ update public.client_workplaces
     set activity = 'Gelaterie', floor_area_m2 = 85, extinguisher_norm = 'commercial_200', assembly_point = 'Parcarea din fața magazinului',
         combustible_materials = 'Ambalaje de carton', ignition_sources = 'Aparate electrice', fire_risk_equipment = 'Vitrine frigorifice'
     where id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  'a workplace records its fire-safety facts'
);

select lives_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind, agent, capacity, wheeled, label)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'extinguisher', 'powder', 6, false, 'P6-001') $$,
  'an extinguisher has its agent and capacity'
);

select throws_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind, capacity)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'extinguisher', 6) $$,
  '23514', null, 'an extinguisher without an agent is refused'
);

select throws_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind, agent)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'extinguisher', 'co2') $$,
  '23514', null, 'an extinguisher without a capacity is refused'
);

select throws_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind, agent)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'sand_box', 'powder') $$,
  '23514', null, 'a sand box with an agent is refused'
);

select throws_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind, wheeled)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'fire_post', true) $$,
  '23514', null, 'only an extinguisher is wheeled'
);

select lives_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'sand_box') $$,
  'a sand box needs nothing else'
);

select throws_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind, agent, capacity)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 'extinguisher', 'powder', 6) $$,
  '23503', null, 'a unit cannot hang in a workplace of another client'
);

select throws_ok(
  $$ insert into public.fire_installations (organization_id, client_id, workplace_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'other') $$,
  '23514', null, 'an installation of another kind is described'
);

select throws_ok(
  $$ insert into public.fire_installations (organization_id, client_id, workplace_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 'interior_hydrants') $$,
  '23503', null, 'an installation cannot be in a workplace of another client'
);

select lives_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, employee_id, workplace_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'Ion Popescu', 'Manager magazin',
             '{workplace_manager,first_aid,risk_evaluation_team,imminent_danger,workers_representative,fire_safety_coordinator,fire_intervention_leader}') $$,
  'a person may hold all seven roles, for one workplace'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Maria Ionescu', 'Administrator',
             '{workplace_manager,first_aid,risk_evaluation_team,imminent_danger,fire_safety_coordinator,fire_intervention_leader,first_aid,imminent_danger}') $$,
  '23514', null, 'eight roles are refused'
);

select throws_ok(
  $$ insert into public.client_responsible_persons (organization_id, client_id, workplace_id, full_name, job_title, roles)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 'Maria Ionescu', 'Administrator', '{fire_safety_coordinator}') $$,
  '23503', null, 'a person cannot answer for a workplace of another client'
);

select throws_ok(
  $$ insert into public.client_fire_safety (client_id, organization_id)
     values ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001') $$,
  'CLL01', null, 'a lead has no fire-safety facts'
);

select throws_ok(
  $$ update public.client_fire_safety set periodic_training_hours = 3 where client_id = 'c1c1c1c1-0000-4000-8000-000000000003' $$,
  'CLA01', null, 'the fire-safety facts of an archived client are frozen'
);

select throws_ok(
  $$ update public.client_fire_safety set smoking_policy = 'designated_places', smoking_place = 'Lângă poartă'
     where client_id = 'c1c1c1c1-0000-4000-8000-000000000003' $$,
  'CLA01', null, 'its smoking place too'
);

select throws_ok(
  $$ update public.fire_equipment set capacity = 9 where id = 'e3e3e3e3-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'its equipment is not edited'
);

select throws_ok(
  $$ delete from public.fire_installations where id = 'f3f3f3f3-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'nor its installations deleted'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.client_fire_safety)
    + (select count(*)::int from public.fire_equipment)
    + (select count(*)::int from public.fire_installations),
  0,
  'a member of another organization reads none of it'
);

select throws_ok(
  $$ insert into public.fire_equipment (organization_id, client_id, workplace_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 'sand_box') $$,
  '42501', null, 'nor adds to it'
);

select is_empty(
  $$ delete from public.fire_equipment returning id $$,
  'nor deletes it'
);

select * from finish();
rollback;
