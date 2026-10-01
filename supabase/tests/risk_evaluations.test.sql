begin;
select plan(34);

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

insert into public.clients (id, organization_id, legal_name, cui, archived_at, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', null, 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', null, 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Other client of A', '66', null, 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Lead of A', '77', null, 'lead'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null, 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Frozen'),
  ('f2f2f2f2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Zidar'),
  ('f2f2f2f2-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Dulgher');

insert into public.risk_evaluations (id, organization_id, client_id, kind, job_position_id) values
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000003'),
  ('e1e1e1e1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'sensitive_groups', null),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'job_position', 'f2f2f2f2-0000-4000-8000-000000000001');

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000002';

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select lives_ok(
  $$ insert into public.risk_evaluations (id, organization_id, client_id, kind, job_position_id, means_of_production)
     values ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001', 'Aparat de sudură') $$,
  'a member evaluates a position of their active client'
);

select is(
  (select exposure from public.risk_evaluations where id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  '8 h / schimb',
  'the exposure is a shift unless said otherwise'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, job_position_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001') $$,
  '23505',
  null,
  'a position has one evaluation at most'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position') $$,
  '23514',
  null,
  'a position evaluation names its position'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, job_position_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'sensitive_groups', 'f1f1f1f1-0000-4000-8000-000000000002') $$,
  '23514',
  null,
  'a client-level evaluation names no position'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'other') $$,
  '23514',
  null,
  'another client-level evaluation needs a name'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'sensitive_groups', 'Grupuri') $$,
  '23514',
  null,
  'the sensitive groups carry no name of their own'
);

select lives_ok(
  $$ insert into public.risk_evaluations (id, organization_id, client_id, kind)
     values ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'sensitive_groups') $$,
  'a member evaluates the sensitive groups of their client'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'sensitive_groups') $$,
  '23505',
  null,
  'a client has one evaluation of the sensitive groups'
);

select lives_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'other', 'Vizitatori') $$,
  'a member adds another named evaluation'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'other', ' vizitatori ') $$,
  '23505',
  null,
  'two named evaluations of a client differ in more than case and spaces'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, job_position_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f2f2f2f2-0000-4000-8000-000000000002') $$,
  '23503',
  null,
  'an evaluation cannot point at a position of another client'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'other', 'Vizitatori') $$,
  'CLL01',
  null,
  'a lead holds no evaluation'
);

select throws_ok(
  $$ insert into public.risk_evaluations (organization_id, client_id, kind, name)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'other', 'Vizitatori') $$,
  '42501',
  null,
  'a member cannot add an evaluation in another organization'
);

select throws_ok(
  $$ update public.risk_evaluations set job_position_id = 'f1f1f1f1-0000-4000-8000-000000000002' where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'an evaluation cannot be moved to another position'
);

select is(
  public.save_risk_factor(
    p_evaluation_id => 'e1e1e1e1-0000-4000-8000-000000000001',
    p_component => 'means_of_production',
    p_factor_group => 'Factori de risc electric',
    p_description => 'Electrocutare prin atingere indirectă',
    p_gravity_class => 5::smallint,
    p_probability_class => 2::smallint,
    p_actions => 'Verificarea prizelor',
    p_deadline => 'Trimestrial',
    p_responsible_person => 'Administrator',
    p_measures => '[{"kind":"technical","description":"Verificarea împământării"},{"kind":"organizational","description":"Instruirea lucrătorilor"}]'
  ) is not null,
  true,
  'a member saves a factor with its measures'
);

select results_eq(
  $$ select kind::text, description, sort_order from public.prevention_measures order by sort_order $$,
  $$ values ('technical', 'Verificarea împământării', 0), ('organizational', 'Instruirea lucrătorilor', 1) $$,
  'the measures keep the order they were sent in'
);

select lives_ok(
  $$ select public.save_risk_factor(
    p_evaluation_id => 'e1e1e1e1-0000-4000-8000-000000000001',
    p_component => 'executant',
    p_factor_group => 'Acțiuni greșite',
    p_description => 'Utilizarea necorespunzătoare a echipamentului electric',
    p_gravity_class => 3::smallint,
    p_probability_class => 4::smallint,
    p_measures => '[]') $$,
  'a factor can have no measures'
);

select throws_ok(
  $$ select public.save_risk_factor('e1e1e1e1-0000-4000-8000-000000000001', 'executant', 'Acțiuni greșite', 'Lovire', 8::smallint, 1::smallint, '[]') $$,
  '23514',
  null,
  'the gravity class runs from 1 to 7'
);

select throws_ok(
  $$ select public.save_risk_factor('e1e1e1e1-0000-4000-8000-000000000001', 'executant', 'Acțiuni greșite', 'Lovire', 7::smallint, 7::smallint, '[]') $$,
  '23514',
  null,
  'the probability class runs from 1 to 6'
);

select is(
  (select array_agg(sort_order order by sort_order) from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  array[0, 1],
  'new factors go after the others'
);

select is(
  public.save_risk_factor(
    p_evaluation_id => 'e1e1e1e1-0000-4000-8000-000000000001',
    p_factor_id => (select id from public.risk_factors where sort_order = 0 and evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
    p_component => 'means_of_production',
    p_factor_group => 'Factori de risc electric',
    p_description => 'Electrocutare prin atingere indirectă',
    p_gravity_class => 5::smallint,
    p_probability_class => 3::smallint,
    p_measures => '[{"kind":"hygienic_sanitary","description":"Trusă de prim ajutor"}]'
  ) is not null,
  true,
  'a member saves a factor again'
);

select results_eq(
  $$ select kind::text, description from public.prevention_measures $$,
  $$ values ('hygienic_sanitary', 'Trusă de prim ajutor') $$,
  'saving a factor replaces its measures'
);

select is(
  public.save_risk_factor(
    p_evaluation_id => 'e1e1e1e1-0000-4000-8000-000000000002',
    p_factor_id => (select id from public.risk_factors where sort_order = 0 and evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
    p_component => 'executant',
    p_factor_group => 'Acțiuni greșite',
    p_description => 'Lovire',
    p_gravity_class => 1::smallint,
    p_probability_class => 1::smallint,
    p_measures => '[]'
  ),
  null,
  'a factor is saved only through its own evaluation'
);

select throws_ok(
  $$ update public.prevention_measures set description = 'Altceva' $$,
  '42501',
  null,
  'a measure is replaced, never changed in place'
);

select is(
  public.reorder_risk_factors(
    'e1e1e1e1-0000-4000-8000-000000000001',
    array(select id from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001' order by sort_order limit 1)
  ),
  false,
  'reordering names every factor of the evaluation'
);

select is(
  public.reorder_risk_factors(
    'e1e1e1e1-0000-4000-8000-000000000001',
    array(select id from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001' order by sort_order desc)
  ),
  true,
  'a member reorders the factors'
);

select is(
  (select factor_group from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001' and sort_order = 0),
  'Acțiuni greșite',
  'the factors take the new order'
);

select is(
  public.copy_risk_factors('e1e1e1e1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000001'),
  2,
  'a member copies the factors of another evaluation of the client'
);

select results_eq(
  $$ select f.description, f.sort_order, count(m.id)::int
     from public.risk_factors f left join public.prevention_measures m on m.factor_id = f.id
     where f.evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000002'
     group by f.id order by f.sort_order $$,
  $$ values ('Utilizarea necorespunzătoare a echipamentului electric', 0, 0), ('Electrocutare prin atingere indirectă', 1, 1) $$,
  'the copies keep their order and their measures'
);

select throws_ok(
  $$ select public.copy_risk_factors('e1e1e1e1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000009') $$,
  'RSK01',
  null,
  'factors are copied only within one client'
);

select throws_ok(
  $$ update public.risk_evaluations set exposure = '4 h / schimb' where id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  'CLA01',
  null,
  'an evaluation under an archived client does not change'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002', '{"provider":"email"}');

select is(
  (select count(*)::int from public.risk_evaluations) + (select count(*)::int from public.risk_factors) + (select count(*)::int from public.prevention_measures),
  1,
  'a member of another organization reads only their own evaluation'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

delete from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.risk_factors where evaluation_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  0,
  'the evaluation and its factors go with a position deleted as a mistake'
);

select * from finish();
rollback;
