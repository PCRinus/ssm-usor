begin;
select plan(39);

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
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Other client of A', '66', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Lead of A', '77', 'lead'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client');

insert into public.client_workplaces (id, organization_id, client_id, name, archived_at) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu', null),
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Depozit vechi', now()),
  ('a0a0a0a0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Hală', null);

insert into public.job_positions (id, organization_id, client_id, name, work_zone) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Electrician', 'Atelier'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor', 'Hală');

insert into public.risk_evaluations (id, organization_id, client_id, kind, job_position_id, name) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001', null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'other', null, 'Vizitatori'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000003', null);

insert into public.risk_factors (id, organization_id, client_id, evaluation_id, component, factor_group, description, gravity_class, probability_class, sort_order) values
  ('fa000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'means_of_production', 'Factori de risc electric', 'Electrocutare', 6, 4, 0),
  ('fa000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'work_environment', 'Factori de risc fizic', 'Zgomot', 4, 5, 1),
  ('fa000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'executant', 'Acțiuni greșite', 'Alunecare', 3, 3, 0),
  ('fa000000-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000003', 'means_of_production', 'Factori de risc termic', 'Arsuri', 5, 5, 0);

insert into public.risk_zones (organization_id, client_id, name, measures, updated_at) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'depozitul de substanțe ', 'Măsuri vechi', now() - interval '1 day'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Șantier', 'Cască de protecție', now()),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Zonă arhivată', 'x', now()),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Zonă B', 'x', now());

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000002';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.state(client_id text)
returns text language sql as $$
  select risk_zones_state::text from public.clients where id = client_id::uuid;
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(pg_temp.state('c1c1c1c1-0000-4000-8000-000000000001'), 'undecided', 'a client starts undecided about its risk zones');

select throws_ok(
  $$ update public.clients set risk_zones_state = 'listed' where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'RZN01', null,
  'nobody writes listed by hand'
);

select lives_ok(
  $$ update public.clients set risk_zones_state = 'none' where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'a member declares that the client has no such zones'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Tablou electric', '{}') $$,
  'RZN02', null,
  'a zone needs a linked factor or measures of its own'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Tablou electric', '{}', p_measures => '   ') $$,
  'RZN02', null,
  'blank measures are no measures'
);

select is(
  public.save_risk_zone(
    p_client_id => 'c1c1c1c1-0000-4000-8000-000000000001',
    p_name => 'Tablou electric',
    p_factor_ids => array['fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002']::uuid[],
    p_workplace_id => 'a0a0a0a0-0000-4000-8000-000000000001',
    p_location => 'parter, camera tehnică'
  ) is not null,
  true,
  'a member adds a zone linked to the client''s factors'
);

select is(pg_temp.state('c1c1c1c1-0000-4000-8000-000000000001'), 'listed', 'adding a zone replaces the declaration');

select is(
  (select count(*)::int from public.risk_zone_factors l join public.risk_zones z on z.id = l.zone_id where z.name = 'Tablou electric'),
  2,
  'a factor sent twice is linked once'
);

select is(
  (select organization_id from public.risk_zones where name = 'Tablou electric'),
  '11111111-0000-4000-8000-000000000001'::uuid,
  'the zone is the client''s organization''s'
);

select throws_ok(
  $$ update public.clients set risk_zones_state = 'none' where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'RZN01', null,
  'a client with zones cannot declare it has none'
);

select lives_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Depozit de substanțe', '{}', p_measures => 'Acces restricționat') $$,
  'a zone may carry only measures of its own'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', ' tablou ELECTRIC ', '{}', p_measures => 'Altele') $$,
  '23505', null,
  'two zones of a client differ in more than case and spaces'
);

select lives_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000003', 'Tablou electric', '{fa000000-0000-4000-8000-000000000009}') $$,
  'another client may use the same name'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Hală', '{fa000000-0000-4000-8000-000000000009}') $$,
  'RZN04', null,
  'a zone links only its own client''s factors'
);

select throws_ok(
  $$ insert into public.risk_zone_factors (zone_id, factor_id, organization_id, client_id)
     select z.id, 'fa000000-0000-4000-8000-000000000009', z.organization_id, z.client_id
     from public.risk_zones z where z.name = 'Depozit de substanțe' $$,
  '23503', null,
  'a link cannot reach another client''s factor directly either'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Hală', '{}', p_measures => 'x', p_workplace_id => 'a0a0a0a0-0000-4000-8000-000000000003') $$,
  'RZN03', null,
  'a zone names only its own client''s workplace'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Magazie', '{}', p_measures => 'x', p_workplace_id => 'a0a0a0a0-0000-4000-8000-000000000002') $$,
  'RZN03', null,
  'a new zone names no archived workplace'
);

select throws_ok(
  $$ insert into public.risk_zones (organization_id, client_id, name, workplace_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Hală', 'a0a0a0a0-0000-4000-8000-000000000003') $$,
  '23503', null,
  'a zone cannot reach another client''s workplace directly either'
);

select lives_ok(
  $$ select public.save_risk_zone(
       'c1c1c1c1-0000-4000-8000-000000000001', 'Tablou electric general',
       '{fa000000-0000-4000-8000-000000000002,fa000000-0000-4000-8000-000000000003}',
       p_zone_id => (select id from public.risk_zones where name = 'Tablou electric' and client_id = 'c1c1c1c1-0000-4000-8000-000000000001'),
       p_measures => 'Ușă încuiată') $$,
  'a member saves a zone again'
);

select results_eq(
  $$ select z.name, z.workplace_id, z.location, z.measures, array_agg(l.factor_id order by l.factor_id)
     from public.risk_zones z join public.risk_zone_factors l on l.zone_id = z.id
     where z.name = 'Tablou electric general' group by z.id $$,
  $$ values ('Tablou electric general', null::uuid, null::text, 'Ușă încuiată', array['fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000003']::uuid[]) $$,
  'saving replaces the fields and the linked factors'
);

update public.client_workplaces set archived_at = null where id = 'a0a0a0a0-0000-4000-8000-000000000002';
select lives_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Depozit de substanțe', '{}',
       p_zone_id => (select id from public.risk_zones where name = 'Depozit de substanțe'),
       p_measures => 'Acces restricționat', p_workplace_id => 'a0a0a0a0-0000-4000-8000-000000000002') $$,
  'a zone names a current workplace'
);
update public.client_workplaces set archived_at = now() where id = 'a0a0a0a0-0000-4000-8000-000000000002';
select lives_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Depozitul de substanțe', '{}',
       p_zone_id => (select id from public.risk_zones where name = 'Depozit de substanțe'),
       p_measures => 'Acces restricționat', p_workplace_id => 'a0a0a0a0-0000-4000-8000-000000000002') $$,
  'a zone keeps a workplace archived after it named it'
);

select results_eq(
  $$ select name, measures from public.risk_zone_names() $$,
  $$ values ('Depozitul de substanțe', 'Acces restricționat'), ('Șantier', 'Cască de protecție'),
       ('Tablou electric', null), ('Tablou electric general', 'Ușă încuiată') $$,
  'the names used before come once each, with the latest measures, in Romanian order, without archived clients'
);

select results_eq(
  $$ select name, measures from public.risk_zone_names('c1c1c1c1-0000-4000-8000-000000000001') $$,
  $$ values ('depozitul de substanțe', 'Măsuri vechi'), ('Șantier', 'Cască de protecție'), ('Tablou electric', null) $$,
  'the names of one client are left out on request'
);

select is(
  public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Nicio zonă', '{}', p_measures => 'x', p_zone_id => gen_random_uuid()),
  null,
  'a zone is saved only through its own client'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000004', 'Tablou', '{}', p_measures => 'x') $$,
  'CLL01', null,
  'a lead holds no zone'
);

select throws_ok(
  $$ insert into public.risk_zones (organization_id, client_id, name, measures)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Tablou', 'x') $$,
  '42501', null,
  'a member cannot add a zone in another organization'
);

select throws_ok(
  $$ update public.risk_zones set client_id = 'c1c1c1c1-0000-4000-8000-000000000003' where name = 'Tablou electric general' $$,
  '42501', null,
  'a zone cannot be moved to another client'
);

delete from public.risk_factors where id = 'fa000000-0000-4000-8000-000000000003';

select is(
  (select count(*)::int from public.risk_zone_factors where factor_id = 'fa000000-0000-4000-8000-000000000003'),
  0,
  'deleting a factor is not refused and takes its links with it'
);

delete from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001';

select results_eq(
  $$ select z.name, count(l.factor_id)::int from public.risk_zones z
     left join public.risk_zone_factors l on l.zone_id = z.id
     where z.client_id = 'c1c1c1c1-0000-4000-8000-000000000001' group by z.name order by z.name $$,
  $$ values ('Depozitul de substanțe', 0), ('Tablou electric general', 0) $$,
  'a zone stays when its last factor goes with a deleted position'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.risk_zones where organization_id <> '22222222-0000-4000-8000-000000000002')
    + (select count(*)::int from public.risk_zone_factors where organization_id <> '22222222-0000-4000-8000-000000000002'),
  0,
  'a member of another organization reads none of the zones'
);

select results_eq(
  $$ select name from public.risk_zone_names() $$,
  $$ values ('Zonă B') $$,
  'nor their names'
);

select is(
  public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Intrus', '{}', p_measures => 'x'),
  null,
  'nor adds one to another organization''s client'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

delete from public.risk_zones where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and name = 'Depozitul de substanțe';

select is(pg_temp.state('c1c1c1c1-0000-4000-8000-000000000001'), 'listed', 'the state stays listed while a zone is left');

select lives_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000001', 'Acoperiș', '{}', p_measures => 'Centură de siguranță') $$,
  'a member adds another zone'
);

delete from public.risk_zones where client_id = 'c1c1c1c1-0000-4000-8000-000000000001';

select is(pg_temp.state('c1c1c1c1-0000-4000-8000-000000000001'), 'undecided', 'deleting the last zones at once leaves the question open again');

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

select throws_ok(
  $$ delete from public.risk_zones where client_id = 'c1c1c1c1-0000-4000-8000-000000000003' $$,
  'CLA01', null,
  'a zone under an archived client does not change'
);

select throws_ok(
  $$ select public.save_risk_zone('c1c1c1c1-0000-4000-8000-000000000003', 'Alta', '{}', p_measures => 'x') $$,
  'CLA01', null,
  'nor is one added under it'
);

select is(
  (select risk_zones_state::text from public.clients where id = 'c1c1c1c1-0000-4000-8000-000000000003'),
  'listed',
  'the archived client keeps its state'
);

select * from finish();
rollback;
