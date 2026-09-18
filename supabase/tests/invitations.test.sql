-- pgTAP checks for profiles and organization invitations (ADR 003).
-- Run with: pnpm supabase:test (supabase test db)
begin;
select plan(45);

-- Fixtures: organization A with an owner and a specialist, organization B with an owner,
-- two accounts without a membership, a fresh account for the new-person path, and a
-- platform admin.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'loner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-admin@test', 'x', now(), '{"provider":"email","role":"admin"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.profiles (user_id, full_name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ana Owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Bogdan Owner');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb default '{"provider":"email"}')
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

-- The API's secret key.
create or replace function pg_temp.act_as_service()
returns void language sql as $$
  select set_config('role', 'service_role', true),
         set_config('request.jwt.claims', '{"role":"service_role"}', true);
$$;

-- Stands in for the API setting the hash after an invitation is created.
create or replace function pg_temp.set_token(invitee text, hash_character text)
returns void language sql as $$
  update public.organization_invitations
  set token_hash = repeat(hash_character, 64), sent_at = now()
  where email = invitee and accepted_at is null and revoked_at is null;
$$;

-- Specialist of A -----------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select is(public.is_organization_owner(), false, 'a specialist is not an owner');

select throws_ok(
  $$ select * from public.create_organization_invitation('new@test') $$,
  '42501', 'not_owner',
  'a specialist cannot invite'
);

select results_eq(
  $$ select email, full_name, role::text from public.organization_member_list() order by email $$,
  $$ values ('owner-a@test', 'Ana Owner', 'owner'), ('specialist-a@test', null, 'specialist') $$,
  'a member lists the members of their organization with names and emails'
);

select results_eq(
  $$ select full_name from public.profiles order by full_name $$,
  $$ values ('Ana Owner') $$,
  'a member reads profiles of their organization only'
);

select lives_ok(
  $$ insert into public.profiles (user_id, full_name) values ('aaaaaaaa-0000-4000-8000-000000000002', 'Sorin Specialist') $$,
  'a user creates their own profile'
);

select throws_ok(
  $$ insert into public.profiles (user_id, full_name) values ('dddddddd-0000-4000-8000-000000000001', 'Someone Else') $$,
  '42501', null,
  'a user cannot create a profile for someone else'
);

select throws_ok(
  $$ update public.profiles set terms_version = '2026-09', terms_accepted_at = now() where user_id = 'aaaaaaaa-0000-4000-8000-000000000002' $$,
  '42501', null,
  'a user cannot record terms acceptance themselves'
);

update public.profiles set full_name = 'Hijacked' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select lives_ok(
  $$ update public.profiles set full_name = 'Sorin S.' where user_id = 'aaaaaaaa-0000-4000-8000-000000000002' $$,
  'a user renames themselves'
);

-- Owner of A ----------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(public.is_organization_owner(), true, 'an owner is an owner');

select is(
  (select full_name from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Ana Owner',
  'a user cannot rename someone else'
);

select results_eq(
  $$ select email, role::text, sent_at is null from public.create_organization_invitation('new@test') $$,
  $$ values ('new@test', 'specialist', true) $$,
  'an owner invites an address, as a specialist by default'
);

select throws_ok(
  $$ select * from public.create_organization_invitation('specialist-a@test') $$,
  'INV01', 'already_member',
  'a member of the organization cannot be invited'
);

select lives_ok(
  $$ select * from public.create_organization_invitation('owner-b@test', 'owner') $$,
  'a member of another organization is invited like anyone else'
);

select lives_ok(
  $$ select * from public.create_organization_invitation('loner@test') $$,
  'an account without a membership is invited like anyone else'
);

select results_eq(
  $$ select role::text from public.create_organization_invitation('new@test', 'owner') $$,
  $$ values ('owner') $$,
  'inviting an address again renews its invitation'
);

select is(
  (select count(*) from public.organization_invitations where email = 'new@test'),
  1::bigint,
  'renewing does not add a second open invitation'
);

select throws_ok(
  $$ select token_hash from public.organization_invitations $$,
  '42501', null,
  'an owner cannot read token hashes'
);

select throws_ok(
  $$ insert into public.organization_invitations (organization_id, email, token_hash) values ('11111111-0000-4000-8000-000000000001', 'forged@test', repeat('f', 64)) $$,
  '42501', null,
  'an owner cannot insert an invitation with a token of their own'
);

select throws_ok(
  $$ update public.organization_invitations set token_hash = repeat('f', 64) $$,
  '42501', null,
  'an owner cannot set a token hash'
);

select throws_ok(
  $$ select * from public.organization_invitation_by_token(repeat('a', 64)) $$,
  '42501', null,
  'the token lookup is not callable by signed-in users'
);

select throws_ok(
  $$ select public.accept_invitation_as(repeat('a', 64), 'aaaaaaaa-0000-4000-8000-000000000001', 'X Y', null) $$,
  '42501', null,
  'accepting on behalf of a chosen user is not callable by signed-in users'
);

-- Other readers -------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');
select is(
  (select count(*) from public.organization_invitations),
  0::bigint,
  'a specialist does not see invitations'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select is(
  (select count(*) from public.organization_invitations),
  0::bigint,
  'an owner does not see invitations of another organization'
);

select is(
  public.revoke_organization_invitation((select id from public.organization_invitations limit 1)),
  false,
  'an owner cannot revoke what they cannot see'
);

-- Lookup and the new-person path (secret key) ---------------------------------------
reset role;
select pg_temp.set_token('new@test', 'a');
select pg_temp.set_token('owner-b@test', 'b');
select pg_temp.set_token('loner@test', 'c');
select pg_temp.act_as_service();

select results_eq(
  $$ select organization_name, email, role::text, status, inviter_name, account_exists from public.organization_invitation_by_token(repeat('a', 64)) $$,
  $$ values ('Org A', 'new@test', 'owner', 'open', 'Ana Owner', true) $$,
  'the lookup describes an open invitation'
);

select is_empty(
  $$ select * from public.organization_invitation_by_token(repeat('0', 64)) $$,
  'the lookup returns nothing for an unknown token'
);

select throws_ok(
  $$ select public.accept_invitation_as(repeat('a', 64), 'dddddddd-0000-4000-8000-000000000002', 'Wrong Person', '2026-09') $$,
  'INV04', 'email_mismatch',
  'an invitation is accepted only by the account it was sent to'
);

select is(
  public.accept_invitation_as(repeat('a', 64), 'eeeeeeee-0000-4000-8000-000000000001', 'Nou Venit', '2026-09'),
  '11111111-0000-4000-8000-000000000001'::uuid,
  'accepting returns the organization'
);

select results_eq(
  $$ select m.role::text, p.full_name, p.terms_version, p.terms_accepted_at is not null
     from public.organization_members m join public.profiles p using (user_id)
     where m.user_id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  $$ values ('owner', 'Nou Venit', '2026-09', true) $$,
  'accepting adds the membership with the invited role and the profile with the terms'
);

select throws_ok(
  $$ select public.accept_invitation_as(repeat('a', 64), 'eeeeeeee-0000-4000-8000-000000000001', 'Nou Venit', '2026-09') $$,
  'INV03', 'accepted',
  'an invitation is accepted once'
);

select results_eq(
  $$ select status from public.organization_invitation_by_token(repeat('a', 64)) $$,
  $$ values ('accepted') $$,
  'the lookup reports an accepted invitation'
);

select throws_ok(
  $$ select public.accept_invitation_as(repeat('b', 64), 'bbbbbbbb-0000-4000-8000-000000000001', null, null) $$,
  'INV05', 'already_in_organization',
  'an account that belongs to an organization cannot join another'
);

-- The signed-in path --------------------------------------------------------------
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.accept_organization_invitation(repeat('c', 64), 'Not Me', '2026-09') $$,
  'INV04', 'email_mismatch',
  'a signed-in account cannot accept an invitation sent to another address'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.accept_organization_invitation(repeat('c', 64), 'Lone Ranger', '2026-09') $$,
  'an account without a membership signs in and accepts'
);

select results_eq(
  $$ select organization_id::text, role::text from public.current_membership() $$,
  $$ values ('11111111-0000-4000-8000-000000000001', 'specialist') $$,
  'and becomes a member of the inviting organization'
);

-- Revoking and expiry -------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$ select * from public.create_organization_invitation('revoked@test') $$,
  'an owner invites a second address'
);
select lives_ok(
  $$ select * from public.create_organization_invitation('expired@test') $$,
  'and a third'
);

select is(
  public.revoke_organization_invitation((select id from public.organization_invitations where email = 'revoked@test')),
  true,
  'an owner revokes an open invitation'
);

select is(
  public.revoke_organization_invitation((select id from public.organization_invitations where email = 'revoked@test')),
  false,
  'revoking twice changes nothing'
);

reset role;
update public.organization_invitations set token_hash = repeat('d', 64) where email = 'revoked@test';
update public.organization_invitations set token_hash = repeat('e', 64), expires_at = now() - interval '1 minute' where email = 'expired@test';
select pg_temp.act_as_service();

select throws_ok(
  $$ select public.accept_invitation_as(repeat('d', 64), 'dddddddd-0000-4000-8000-000000000002', 'A B', null) $$,
  'INV03', 'revoked',
  'a revoked invitation cannot be accepted'
);

select throws_ok(
  $$ select public.accept_invitation_as(repeat('e', 64), 'dddddddd-0000-4000-8000-000000000002', 'A B', null) $$,
  'INV03', 'expired',
  'an expired invitation cannot be accepted'
);

-- The limit -----------------------------------------------------------------------
reset role;
insert into public.organization_invitations (organization_id, email, expires_at)
select '22222222-0000-4000-8000-000000000002', 'open-' || n || '@test', now() + interval '1 day'
from generate_series(1, 19) n;
insert into public.organization_invitations (organization_id, email, expires_at)
values ('22222222-0000-4000-8000-000000000002', 'lapsed@test', now() - interval '1 day');

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select lives_ok(
  $$ select * from public.create_organization_invitation('twentieth@test') $$,
  'expired invitations do not count towards the limit'
);

select throws_ok(
  $$ select * from public.create_organization_invitation('twenty-first@test') $$,
  'INV02', 'too_many_open_invitations',
  'an organization holds at most 20 open invitations'
);

-- Impersonation -------------------------------------------------------------------
reset role;
insert into public.impersonations (admin_user_id, target_user_id, reason)
values ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'help with invitations');

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000003', '{"provider":"email","role":"admin"}');
select lives_ok(
  $$ select * from public.create_organization_invitation('via-support@test') $$,
  'a platform admin impersonating an owner invites for that organization'
);

select is(
  (select invited_by from public.organization_invitations where email = 'via-support@test'),
  'cccccccc-0000-4000-8000-000000000003'::uuid,
  'and the invitation records the admin, not the impersonated owner'
);

select * from finish();
rollback;
