begin;
select plan(19);

-- Fixtures: two organizations with one member and one client each, a position in each.
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
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Frozen'),
  ('f2f2f2f2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Zidar');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select is(
  (select needs_protective_equipment from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  null,
  'a new position is undecided about equipment'
);

-- Owner A -------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select lives_ok(
  $$ insert into public.job_position_equipment (id, organization_id, client_id, job_position_id, risk, item, quantity, duration_months, created_by)
     values ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Împroșcare, stropire (față, ochi)', 'Mască de sudură', 1, 24, 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member adds an entry to a position of their active client'
);

select is(
  (select needs_protective_equipment from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  true,
  'the first entry decides that the position needs equipment'
);

select lives_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, allocation, created_by)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Pulberi', 'Mănuși de unică folosință', 'consumable', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a consumable has no duration'
);

select throws_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, allocation, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Pulberi', 'Mănuși', 'consumable', 6) $$,
  '23514',
  null,
  'a consumable cannot carry a duration'
);

select throws_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, allocation)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Lovituri', 'Bocanci', 'section_inventory') $$,
  '23514',
  null,
  'inventory needs a duration'
);

select throws_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, quantity, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Lovituri', 'Bocanci', 0, 12) $$,
  '23514',
  null,
  'at least one piece is granted'
);

select throws_ok(
  $$ update public.job_positions set needs_protective_equipment = false where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'EQP01',
  null,
  'a position with entries cannot be marked as needing none'
);

select throws_ok(
  $$ update public.job_positions set needs_protective_equipment = true where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'EQP02',
  null,
  'a position without entries cannot be marked as needing equipment by hand'
);

select lives_ok(
  $$ update public.job_positions set needs_protective_equipment = false where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'a position without entries can be marked as needing none'
);

select lives_ok(
  $$ update public.job_positions set needs_protective_equipment = null where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'and the decision can be taken back'
);

select throws_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f2f2f2f2-0000-4000-8000-000000000001', 'Lovituri', 'Cască', 24) $$,
  '23503',
  null,
  'an entry cannot point at a position of another client'
);

select throws_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000003', 'Lovituri', 'Cască', 24) $$,
  'CLA01',
  null,
  'a member cannot add an entry under an archived client'
);

select throws_ok(
  $$ insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, duration_months)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'f2f2f2f2-0000-4000-8000-000000000001', 'Lovituri', 'Cască', 24) $$,
  '42501',
  null,
  'a member cannot add an entry in another organization'
);

select lives_ok(
  $$ update public.job_position_equipment set quantity = 2, duration_months = 12 where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'a member edits an entry'
);

select throws_ok(
  $$ update public.job_position_equipment set job_position_id = 'f1f1f1f1-0000-4000-8000-000000000002' where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'an entry cannot be moved to another position'
);

-- Specialist B --------------------------------------------------------------------
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002', '{"provider":"email"}');

select is(
  (select count(*)::int from public.job_position_equipment),
  0,
  'a member of another organization reads none of the entries'
);

-- Owner A again -------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

delete from public.job_position_equipment where job_position_id = 'f1f1f1f1-0000-4000-8000-000000000001';

select is(
  (select needs_protective_equipment from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  null,
  'deleting the last entry leaves the position undecided again'
);

insert into public.job_position_equipment (organization_id, client_id, job_position_id, risk, item, duration_months)
values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000002', 'Lovituri', 'Cască', 24);
delete from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.job_position_equipment where job_position_id = 'f1f1f1f1-0000-4000-8000-000000000002'),
  0,
  'the entries go with a position deleted as a mistake'
);

select * from finish();
rollback;
