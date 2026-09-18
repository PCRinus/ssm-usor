-- pgTAP checks for changing roles and removing members.
-- Run with: pnpm supabase:test (supabase test db)
begin;
select plan(15);

-- Fixtures: organization A with two owners and a specialist, organization B with an owner.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second-owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.profiles (user_id, full_name) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Sorin Specialist');

insert into public.clients (organization_id, legal_name, cui, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'aaaaaaaa-0000-4000-8000-000000000002');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

-- Specialist of A -----------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.change_organization_member_role('aaaaaaaa-0000-4000-8000-000000000003', 'specialist') $$,
  '42501', 'not_owner',
  'a specialist cannot change roles'
);

select throws_ok(
  $$ select public.remove_organization_member('aaaaaaaa-0000-4000-8000-000000000003') $$,
  '42501', 'not_owner',
  'a specialist cannot remove members'
);

-- No policy lets a signed-in user write memberships, so this touches no row.
update public.organization_members set role = 'owner'
  where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
select results_eq(
  $$ select role::text from public.current_membership() $$,
  $$ values ('specialist') $$,
  'a member cannot promote themselves by writing the table'
);

select throws_ok(
  $$ select public.lock_members_as_owner() $$,
  '42501', null,
  'the locking helper is not callable by signed-in users'
);

-- Owner of A ----------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.change_organization_member_role('aaaaaaaa-0000-4000-8000-000000000001', 'specialist') $$,
  'MEM01', 'own_membership',
  'an owner cannot demote themselves'
);

select throws_ok(
  $$ select public.remove_organization_member('aaaaaaaa-0000-4000-8000-000000000001') $$,
  'MEM01', 'own_membership',
  'an owner cannot remove themselves'
);

select is(
  public.change_organization_member_role('aaaaaaaa-0000-4000-8000-000000000002', 'owner'),
  true,
  'an owner promotes a specialist'
);

select is(
  public.change_organization_member_role('aaaaaaaa-0000-4000-8000-000000000003', 'specialist'),
  true,
  'an owner demotes another owner'
);

select is(
  public.change_organization_member_role('bbbbbbbb-0000-4000-8000-000000000001', 'specialist'),
  false,
  'an owner cannot change a role in another organization'
);

select is(
  public.remove_organization_member('bbbbbbbb-0000-4000-8000-000000000001'),
  false,
  'an owner cannot remove a member of another organization'
);

select is(
  public.remove_organization_member('aaaaaaaa-0000-4000-8000-000000000003'),
  true,
  'an owner removes a member'
);

select is(
  public.remove_organization_member('aaaaaaaa-0000-4000-8000-000000000003'),
  false,
  'removing twice changes nothing'
);

-- The demoted, then removed, former owner -----------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000003');

select is_empty(
  $$ select * from public.current_membership() $$,
  'a removed member has no membership'
);

select is(
  (select count(*) from public.clients),
  0::bigint,
  'and no longer sees the organization''s clients'
);

-- What removal leaves behind ------------------------------------------------------
reset role;
insert into public.organization_members (user_id, organization_id, role)
values ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'owner');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000003');
select public.remove_organization_member('aaaaaaaa-0000-4000-8000-000000000002');
reset role;

select results_eq(
  $$ select (select count(*) from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
            (select count(*) from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
            (select count(*) from public.clients where created_by = 'aaaaaaaa-0000-4000-8000-000000000002') $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'removal keeps the account, the profile, and what the person created'
);

select * from finish();
rollback;
