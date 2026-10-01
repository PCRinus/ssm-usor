begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, archived_at, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', null, 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Other client of A', '66', null, 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', null, 'client'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null, 'client');

insert into public.risk_evaluations (id, organization_id, client_id, kind, name) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'other', 'Birou'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'other', 'Birou'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'other', 'Birou'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'other', 'Birou');

insert into public.risk_factors (id, organization_id, client_id, evaluation_id, component, factor_group, description, gravity_class, probability_class, deadline, responsible_person, sort_order) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'work_task', 'Suprasolicitare psihică', 'Ritm de muncă intens', 2, 4, null, null, 1),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'means_of_production', 'Factori de risc electric', 'Electrocutare prin atingere indirectă', 5, 3, 'Anual', 'Administratorul', 0),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000002', 'executant', 'Acțiuni greșite', 'Lovire de mobilier', 2, 2, null, null, 0);

insert into public.prevention_measures (organization_id, client_id, factor_id, kind, description, sort_order) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000002', 'organizational', 'Instruirea lucrătorilor', 1),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000002', 'technical', 'Verificarea împământării', 0);

insert into public.evaluation_profiles (id, organization_id, name) values
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Profil B');

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select lives_ok(
  $$ insert into public.evaluation_profiles (id, organization_id, name)
     values ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Lucrător în atelier') $$,
  'a specialist starts a profile in the library'
);

select throws_ok(
  $$ insert into public.evaluation_profiles (organization_id, name)
     values ('11111111-0000-4000-8000-000000000001', ' lucrător ÎN atelier ') $$,
  '23505',
  null,
  'two profiles of an organization differ in more than case and spaces'
);

select throws_ok(
  $$ insert into public.evaluation_profiles (organization_id, name)
     values ('11111111-0000-4000-8000-000000000001', ' L ') $$,
  '23514',
  null,
  'a profile has a name of at least two characters'
);

select throws_ok(
  $$ insert into public.evaluation_profiles (organization_id, name)
     values ('22222222-0000-4000-8000-000000000002', 'Lucrător') $$,
  '42501',
  null,
  'a member cannot add a profile to another organization'
);

select throws_ok(
  $$ update public.evaluation_profiles set organization_id = '22222222-0000-4000-8000-000000000002' where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a profile does not move to another organization'
);

select is(
  public.save_evaluation_profile_factor(
    p_profile_id => 'a1a1a1a1-0000-4000-8000-000000000001',
    p_component => 'means_of_production',
    p_factor_group => 'Factori de risc mecanic',
    p_description => 'Prinderea mâinii în piesele în mișcare',
    p_gravity_class => 4::smallint,
    p_probability_class => 3::smallint,
    p_deadline => 'Permanent',
    p_responsible_person => 'Șeful de echipă',
    p_measures => '[{"kind":"technical","description":"Apărători fixe"},{"kind":"organizational","description":"Instruire la angajare"}]'
  ) is not null,
  true,
  'a member saves a profile factor with its measures'
);

select results_eq(
  $$ select kind::text, description, sort_order from public.evaluation_profile_measures order by sort_order $$,
  $$ values ('technical', 'Apărători fixe', 0), ('organizational', 'Instruire la angajare', 1) $$,
  'the measures keep the order they were sent in'
);

select lives_ok(
  $$ select public.save_evaluation_profile_factor('a1a1a1a1-0000-4000-8000-000000000001', 'work_environment', 'Factori de risc fizic', 'Zgomot', 2::smallint, 5::smallint, '[]') $$,
  'a profile factor can have no measures'
);

select is(
  (select array_agg(sort_order order by sort_order) from public.evaluation_profile_factors where profile_id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  array[0, 1],
  'new profile factors go after the others'
);

select throws_ok(
  $$ select public.save_evaluation_profile_factor('a1a1a1a1-0000-4000-8000-000000000001', 'executant', 'Acțiuni greșite', 'Lovire', 8::smallint, 1::smallint, '[]') $$,
  '23514',
  null,
  'a profile factor has the gravity classes of the method'
);

select is(
  public.save_evaluation_profile_factor(
    p_profile_id => 'a1a1a1a1-0000-4000-8000-000000000001',
    p_factor_id => (select id from public.evaluation_profile_factors where sort_order = 0 and profile_id = 'a1a1a1a1-0000-4000-8000-000000000001'),
    p_component => 'means_of_production',
    p_factor_group => 'Factori de risc mecanic',
    p_description => 'Prinderea mâinii în piesele în mișcare',
    p_gravity_class => 4::smallint,
    p_probability_class => 4::smallint,
    p_deadline => 'Permanent',
    p_responsible_person => 'Șeful de echipă',
    p_measures => '[{"kind":"other","description":"Semnalizare"}]'
  ) is not null,
  true,
  'a member saves a profile factor again'
);

select results_eq(
  $$ select kind::text, description from public.evaluation_profile_measures $$,
  $$ values ('other', 'Semnalizare') $$,
  'saving a profile factor replaces its measures'
);

select is(
  public.save_evaluation_profile_factor(
    p_profile_id => 'b2b2b2b2-0000-4000-8000-000000000001',
    p_component => 'executant',
    p_factor_group => 'Acțiuni greșite',
    p_description => 'Lovire',
    p_gravity_class => 1::smallint,
    p_probability_class => 1::smallint,
    p_measures => '[]'
  ),
  null,
  'another organization''s profile takes no factor'
);

select throws_ok(
  $$ update public.evaluation_profile_measures set description = 'Altceva' $$,
  '42501',
  null,
  'a profile measure is replaced, never changed in place'
);

select ok(
  public.save_risk_evaluation_as_profile('e1e1e1e1-0000-4000-8000-000000000001', '  Lucrător de birou ') is not null,
  'a member saves an evaluation as a profile'
);

select results_eq(
  $$ select p.name, f.description, f.gravity_class::int, f.probability_class::int, f.deadline, f.sort_order, string_agg(m.kind::text || ':' || m.description, ',' order by m.sort_order)
     from public.evaluation_profiles p
     join public.evaluation_profile_factors f on f.profile_id = p.id
     left join public.evaluation_profile_measures m on m.factor_id = f.id
     where p.name = 'Lucrător de birou'
     group by p.id, f.id order by f.sort_order $$,
  $$ values
       ('Lucrător de birou', 'Electrocutare prin atingere indirectă', 5, 3, 'Anual', 0, 'technical:Verificarea împământării,organizational:Instruirea lucrătorilor'),
       ('Lucrător de birou', 'Ritm de muncă intens', 2, 4, null, 1, null) $$,
  'the profile copies the factors in their order, with their classes, plan fields and measures'
);

select throws_ok(
  $$ select public.save_risk_evaluation_as_profile('e1e1e1e1-0000-4000-8000-000000000002', 'LUCRĂTOR DE BIROU') $$,
  '23505',
  null,
  'an evaluation is saved under a name the library does not hold'
);

select ok(
  public.save_risk_evaluation_as_profile('e1e1e1e1-0000-4000-8000-000000000003', 'Din arhivă') is not null,
  'an archived client''s evaluation can still go into the library'
);

select is(
  public.save_risk_evaluation_as_profile('e2e2e2e2-0000-4000-8000-000000000001', 'Străin'),
  null,
  'another organization''s evaluation is not saved as a profile'
);

select is(
  public.apply_evaluation_profile(
    'e1e1e1e1-0000-4000-8000-000000000002',
    (select id from public.evaluation_profiles where name = 'Lucrător de birou')
  ),
  2,
  'a member applies a profile to an evaluation of another client'
);

select results_eq(
  $$ select f.description, f.sort_order, count(m.id)::int
     from public.risk_factors f left join public.prevention_measures m on m.factor_id = f.id
     where f.evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000002'
     group by f.id order by f.sort_order $$,
  $$ values ('Lovire de mobilier', 0, 0), ('Electrocutare prin atingere indirectă', 1, 2), ('Ritm de muncă intens', 2, 0) $$,
  'the profile''s factors go after the evaluation''s own, with their measures'
);

select throws_ok(
  $$ select public.apply_evaluation_profile('e1e1e1e1-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000001') $$,
  'RSK02',
  null,
  'another organization''s profile is not applied'
);

select throws_ok(
  $$ select public.apply_evaluation_profile('e1e1e1e1-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000001') $$,
  'CLA01',
  null,
  'a profile is not applied to an archived client''s evaluation'
);

update public.evaluation_profile_factors set gravity_class = 7
where profile_id = (select id from public.evaluation_profiles where name = 'Lucrător de birou');

select is(
  (select array_agg(gravity_class::int order by sort_order) from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  array[2, 5, 2],
  'a change to the profile does not reach the copies'
);

delete from public.evaluation_profiles where name = 'Lucrător de birou';

select is(
  (select count(*)::int from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  3,
  'deleting a profile leaves its copies in the evaluations'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002', '{"provider":"email"}');

select is(
  (select count(*)::int from public.evaluation_profiles) + (select count(*)::int from public.evaluation_profile_factors) + (select count(*)::int from public.evaluation_profile_measures),
  1,
  'a member of another organization reads only their own library'
);

select * from finish();
rollback;
