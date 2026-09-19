begin;
select plan(13);

-- Fixtures: two organizations, an owner in each, and a platform admin without membership.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-admin@test', 'x', now(), '{"provider":"email","role":"admin"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'specialist');

insert into public.clients (organization_id, legal_name, cui) values
  ('11111111-0000-4000-8000-000000000001', 'Client of A', '1590082'),
  ('22222222-0000-4000-8000-000000000002', 'Client of B', '5022670');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

-- Owner A -------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select results_eq(
  $$ select legal_name from public.clients order by legal_name $$,
  $$ values ('Client of A') $$,
  'a member sees only clients of their organization'
);

select results_eq(
  $$ select organization_id::text, role::text from public.current_membership() $$,
  $$ values ('11111111-0000-4000-8000-000000000001', 'owner') $$,
  'current_membership returns the caller membership'
);

select throws_ok(
  $$ insert into public.clients (organization_id, legal_name, cui) values ('22222222-0000-4000-8000-000000000002', 'Sneaky', '11') $$,
  '42501',
  null,
  'a member cannot insert a client into another organization'
);

select lives_ok(
  $$ insert into public.clients (organization_id, legal_name, cui) values ('11111111-0000-4000-8000-000000000001', 'Second of A', '22') $$,
  'a member can insert a client into their organization'
);

select throws_ok(
  $$ insert into public.clients (organization_id, legal_name, cui) values ('11111111-0000-4000-8000-000000000001', 'Duplicate', '1590082') $$,
  '23505',
  null,
  'the CUI is unique within an organization'
);

select is(
  (select count(*) from public.impersonations),
  0::bigint,
  'members cannot read impersonations'
);

select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'members cannot start impersonations'
);

-- Only app_metadata is trusted; a role claim in user_metadata is ignored.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email"},"user_metadata":{"role":"admin"}}', true);
select is(public.is_platform_admin(), false, 'user_metadata cannot grant platform admin');

-- Platform admin ------------------------------------------------------------------
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000003', '{"provider":"email","role":"admin"}');

select is(public.is_platform_admin(), true, 'app_metadata.role = admin marks a platform admin');

select is(
  (select count(*) from public.clients),
  0::bigint,
  'a platform admin without membership sees no clients'
);

select lives_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, reason) values ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'reproduce bug') $$,
  'a platform admin can start an impersonation'
);

select results_eq(
  $$ select legal_name from public.clients order by legal_name $$,
  $$ values ('Client of B') $$,
  'during impersonation the admin sees the target organization clients'
);

update public.impersonations set ended_at = now()
  where admin_user_id = 'cccccccc-0000-4000-8000-000000000003' and ended_at is null;

select is(
  (select count(*) from public.clients),
  0::bigint,
  'ending the impersonation removes access again'
);

select * from finish();
rollback;
