-- pgTAP checks for onboarding: creating an organization and listing one's open invitations.
-- Run with: pnpm supabase:test (supabase test db)
begin;
select plan(14);

-- Fixtures: a fresh confirmed account, an unconfirmed one, an owner with an organization
-- that has invited the fresh account, and an expired and a revoked invitation for it too.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Fresh@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('ffffffff-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconfirmed@test', 'x', null, '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.profiles (user_id, full_name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ana Owner');

insert into public.organization_invitations (organization_id, email, role, invited_by, expires_at, revoked_at) values
  ('11111111-0000-4000-8000-000000000001', 'fresh@test', 'specialist', 'aaaaaaaa-0000-4000-8000-000000000001', now() + interval '3 days', null),
  ('22222222-0000-4000-8000-000000000002', 'fresh@test', 'owner', null, now() - interval '1 day', null),
  ('22222222-0000-4000-8000-000000000002', 'someone-else@test', 'owner', null, now() + interval '3 days', null);
insert into public.organization_invitations (organization_id, email, role, expires_at, revoked_at) values
  ('11111111-0000-4000-8000-000000000001', 'unconfirmed@test', 'specialist', now() + interval '3 days', null);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

-- An unconfirmed account -----------------------------------------------------------
select pg_temp.act_as('ffffffff-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.create_organization('Too Early SRL', 'Una Unconfirmed', '2026-09') $$,
  '42501', 'email_not_confirmed',
  'an account with an unconfirmed email cannot create an organization'
);

select is_empty(
  $$ select * from public.my_open_invitations() $$,
  'and is told nothing about invitations sent to that address'
);

-- A fresh, confirmed account -------------------------------------------------------
select pg_temp.act_as('ffffffff-0000-4000-8000-000000000001');

select results_eq(
  $$ select organization_name, inviter_name, role::text from public.my_open_invitations() $$,
  $$ values ('Org A', 'Ana Owner', 'specialist') $$,
  'open invitations are matched on the address whatever its case, without expired ones or other people''s'
);

select throws_ok(
  $$ select public.create_organization('X', 'Flavia Fresh', '2026-09') $$,
  '23514', null,
  'the organization name keeps its length rule'
);

select throws_ok(
  $$ select public.create_organization('Fresh SSM SRL', 'F', '2026-09') $$,
  '23514', null,
  'the owner name keeps its length rule'
);

select is(
  (select count(*) from public.organizations where name = 'X'),
  0::bigint,
  'a refused creation leaves no organization behind'
);

select lives_ok(
  $$ select public.create_organization('  Fresh SSM SRL ', ' Flavia Fresh ', '2026-09') $$,
  'a confirmed account without a membership creates its organization'
);

select results_eq(
  $$ select organization_id = (select id from public.organizations where name = 'Fresh SSM SRL'), role::text
     from public.current_membership() $$,
  $$ values (true, 'owner') $$,
  'and becomes its owner, with the name trimmed'
);

select results_eq(
  $$ select full_name, terms_version, terms_accepted_at is not null from public.profiles
     where user_id = 'ffffffff-0000-4000-8000-000000000001' $$,
  $$ values ('Flavia Fresh', '2026-09', true) $$,
  'the owner is named and their acceptance recorded on the profile'
);

select throws_ok(
  $$ select public.create_organization('Second SRL', 'Flavia Fresh', '2026-09') $$,
  'ORG01', 'already_in_organization',
  'an account that belongs to an organization cannot create another'
);

reset role;
select results_eq(
  $$ select terms_version, terms_accepted_at is not null, terms_accepted_by::text
     from public.organizations where name = 'Fresh SSM SRL' $$,
  $$ values ('2026-09', true, 'ffffffff-0000-4000-8000-000000000001') $$,
  'the organization records which terms were accepted, when, and by whom'
);

select is(
  (select count(*) from public.organizations where name = 'Second SRL'),
  0::bigint,
  'the refused second organization was not kept'
);

-- An existing owner, and nobody ---------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.create_organization('Another SRL', 'Ana Owner', '2026-09') $$,
  'ORG01', 'already_in_organization',
  'an owner cannot create a second organization'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.create_organization('Anon SRL', 'No Body', '2026-09') $$,
  '42501', null,
  'a visitor who is not signed in cannot create an organization'
);

select * from finish();
rollback;
