begin;
select plan(10);

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
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Other client of A', '66', 'client'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client');

insert into public.job_positions (id, organization_id, client_id, name, work_zone) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Gestionar', 'Depozit'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor', 'Hală');

insert into public.risk_evaluations (id, organization_id, client_id, kind, job_position_id) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000002');

insert into public.risk_factors (id, organization_id, client_id, evaluation_id, component, factor_group, description, gravity_class, probability_class, sort_order) values
  ('fa000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'executant', 'Cădere', 'Cădere de pe scară', 4, 4, 0),
  ('fa000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'executant', 'Efort', 'Ridicarea baxurilor', 4, 5, 1),
  ('fa000000-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000002', 'means_of_production', 'Termic', 'Arsuri', 5, 5, 0);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.risk_zone_ignored_factors (factor_id, organization_id, client_id)
     values ('fa000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  'a member ignores the suggestion of a factor of their client'
);

select throws_ok(
  $$ insert into public.risk_zone_ignored_factors (factor_id, organization_id, client_id)
     values ('fa000000-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  '23503', null,
  'a factor of another client is not ignored under this one'
);

select throws_ok(
  $$ insert into public.risk_zone_ignored_factors (factor_id, organization_id, client_id)
     values ('fa000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  '23505', null,
  'a factor is ignored once'
);

select throws_ok(
  $$ update public.risk_zone_ignored_factors set created_at = now() where factor_id = 'fa000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'an ignored factor is never edited, only restored'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select count(*)::int from public.risk_zone_ignored_factors),
  0,
  'another organization reads none of them'
);

select throws_ok(
  $$ insert into public.risk_zone_ignored_factors (factor_id, organization_id, client_id)
     values ('fa000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  '42501', null,
  'another organization ignores none of them'
);

delete from public.risk_zone_ignored_factors where factor_id = 'fa000000-0000-4000-8000-000000000001';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.risk_zone_ignored_factors),
  1,
  'another organization restores none of them'
);

select lives_ok(
  $$ delete from public.risk_zone_ignored_factors where factor_id = 'fa000000-0000-4000-8000-000000000001' $$,
  'a member restores the suggestion'
);

insert into public.risk_zone_ignored_factors (factor_id, organization_id, client_id)
values ('fa000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001');

reset role;
update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000001';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ delete from public.risk_zone_ignored_factors where factor_id = 'fa000000-0000-4000-8000-000000000002' $$,
  'CLA01', null,
  'an archived client''s ignored suggestions do not change'
);

reset role;
update public.clients set archived_at = null where id = 'c1c1c1c1-0000-4000-8000-000000000001';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

delete from public.risk_factors where id = 'fa000000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.risk_zone_ignored_factors),
  0,
  'a deleted factor takes its ignored suggestion with it'
);

select * from finish();
rollback;
