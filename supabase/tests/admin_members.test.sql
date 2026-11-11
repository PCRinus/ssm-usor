begin;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), v.app_metadata::jsonb, '{}', now(), now(), v.signed_in::timestamptz
from (values
  ('eeeeeeee-0000-4000-8000-0000000000b1', 'admin-members@example.com', '{"provider":"email","role":"admin"}', null),
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'Ana.Ionescu@example.com', '{"provider":"email"}', '2026-11-10T08:00:00Z'),
  ('aaaaaaaa-0000-4000-8000-0000000000b2', 'b-specialist@example.com', '{"provider":"email"}', null),
  ('aaaaaaaa-0000-4000-8000-0000000000b3', 'mihai@example.com', '{"provider":"email"}', null),
  ('dddddddd-0000-4000-8000-0000000000b1', 'participant-members@example.com', '{"provider":"phone"}', null)
) as v (id, email, app_metadata, signed_in);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-0000000000b1', 'Zzz Protecția Muncii Test SRL'),
  ('11111111-0000-4000-8000-0000000000b2', 'Zzz Ștefănescu Consult SRL');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', '11111111-0000-4000-8000-0000000000b1', 'owner'),
  ('aaaaaaaa-0000-4000-8000-0000000000b2', '11111111-0000-4000-8000-0000000000b1', 'specialist'),
  ('aaaaaaaa-0000-4000-8000-0000000000b3', '11111111-0000-4000-8000-0000000000b2', 'owner');

insert into public.profiles (user_id, full_name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'Ana Ionescu'),
  ('aaaaaaaa-0000-4000-8000-0000000000b3', 'Mihai Țurcanu');

insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until) values
  ('11111111-0000-4000-8000-0000000000b2', 'start', 'trialing', now() + interval '14 days', now() + interval '14 days');

create or replace function pg_temp.act_as(p_user_id text, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', p_user_id, 'role', 'authenticated', 'aal', p_aal,
           'app_metadata', case when p_user_id = 'eeeeeeee-0000-4000-8000-0000000000b1'
             then '{"provider":"email","role":"admin"}'::json else '{"provider":"email"}'::json end
         )::text, true),
         set_config('request.headers', '{}', true);
$$;

create or replace function pg_temp.act_as_secret_key()
returns void language sql as $$
  select set_config('role', 'service_role', true),
         set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.headers', '{}', true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true),
         set_config('request.jwt.claims', '', true),
         set_config('request.headers', '', true);
$$;

grant execute on all functions in schema pg_temp to authenticated, service_role;


select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000b1', 'aal2');
select throws_ok(
  $$ select * from public.admin_list_members(null, 25, 0) $$,
  '42501', null, 'not even an admin''s own token lists the members'
);

select pg_temp.act_as_secret_key();
select results_eq(
  $$ select user_id, email, full_name, organization_name, role::text, subscription_plan::text, subscription_status::text, last_sign_in_at
     from public.admin_list_members('ZZZ', 25, 0) $$,
  $$ values
     ('aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, 'Ana.Ionescu@example.com', 'Ana Ionescu', 'Zzz Protecția Muncii Test SRL', 'owner', null::text, null::text, '2026-11-10T08:00:00Z'::timestamptz),
     ('aaaaaaaa-0000-4000-8000-0000000000b2'::uuid, 'b-specialist@example.com', null, 'Zzz Protecția Muncii Test SRL', 'specialist', null, null, null),
     ('aaaaaaaa-0000-4000-8000-0000000000b3'::uuid, 'mihai@example.com', 'Mihai Țurcanu', 'Zzz Ștefănescu Consult SRL', 'owner', 'start', 'trialing', null) $$,
  'the secret key lists the members by organization, then name, with their account and subscription'
);
select results_eq(
  $$ select user_id, total from public.admin_list_members('zzz', 2, 0) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, 3::bigint), ('aaaaaaaa-0000-4000-8000-0000000000b2'::uuid, 3::bigint) $$,
  'a page carries the total of the filtered list'
);
select results_eq(
  $$ select user_id from public.admin_list_members('zzz', 2, 2) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b3'::uuid) $$,
  'and the next page the rest'
);
select results_eq(
  $$ select user_id from public.admin_list_members('ana.IONESCU@', 25, 0) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b1'::uuid) $$,
  'the search matches the email, whatever the case'
);
select results_eq(
  $$ select user_id from public.admin_list_members('turcanu', 25, 0) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b3'::uuid) $$,
  'the name, without diacritics'
);
select results_eq(
  $$ select user_id from public.admin_list_members('  ȘTEFĂNESCU ', 25, 0) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b3'::uuid) $$,
  'and the organization''s name'
);
select is(
  (select count(*) from public.admin_list_members('   ', 1000, 0)),
  (select count(*) from public.organization_members),
  'a blank search lists every member'
);
select is(
  (select count(*) from public.admin_list_members(null, 1000, 0)),
  (select count(*) from public.organization_members),
  'as does none'
);
select is(
  (select count(*) from public.admin_list_members('participant-members', 25, 0)),
  0::bigint,
  'an account without a membership is not listed'
);
select results_eq(
  $$ select user_id, email, full_name, organization_name, role::text
     from public.admin_accounts(array['aaaaaaaa-0000-4000-8000-0000000000b3', 'dddddddd-0000-4000-8000-0000000000b1']::uuid[])
     order by user_id $$,
  $$ values
     ('aaaaaaaa-0000-4000-8000-0000000000b3'::uuid, 'mihai@example.com', 'Mihai Țurcanu', 'Zzz Ștefănescu Consult SRL', 'owner'),
     ('dddddddd-0000-4000-8000-0000000000b1'::uuid, 'participant-members@example.com', null, null, null) $$,
  'the secret key names the accounts asked for, with their membership while they have one'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000b1', 'aal2');
select throws_ok(
  $$ select * from public.admin_accounts(array['aaaaaaaa-0000-4000-8000-0000000000b3']::uuid[]) $$,
  '42501', null, 'and only the secret key'
);


select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000b1', 'aal2');
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id) values ('eeeeeeee-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000b1') $$,
  '23514', null, 'an impersonation without a reason is refused'
);
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, reason) values ('eeeeeeee-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000b1', E' \t ') $$,
  '23514', null, 'as is one with a blank reason'
);
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, reason) values ('eeeeeeee-0000-4000-8000-0000000000b1', 'dddddddd-0000-4000-8000-0000000000b1', 'Portal') $$,
  'IMS02', 'Only a member of an organization is impersonated.', 'a participant without a membership is not impersonated'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000b1');
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, reason) values ('aaaaaaaa-0000-4000-8000-0000000000b1', 'dddddddd-0000-4000-8000-0000000000b1', 'Portal') $$,
  '42501', null, 'a member the policies refuse is told nothing about who is a member'
);

select pg_temp.act_as_secret_key();
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, reason) values ('eeeeeeee-0000-4000-8000-0000000000b1', 'dddddddd-0000-4000-8000-0000000000b1', 'Portal') $$,
  'IMS02', null, 'the secret key does not impersonate a non-member either'
);


select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000b1');
select throws_ok(
  $$ select public.start_impersonation('aaaaaaaa-0000-4000-8000-0000000000b1', 'Reproduce #77') $$,
  '42501', null, 'a password-only admin session starts no impersonation'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000b1');
select throws_ok(
  $$ select public.start_impersonation('aaaaaaaa-0000-4000-8000-0000000000b3', 'Reproduce #77') $$,
  '42501', null, 'nor does a member'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000b1', 'aal2');
select results_eq(
  $$ select admin_user_id, target_user_id, reason, started_at = now(), ended_at from public.start_impersonation('aaaaaaaa-0000-4000-8000-0000000000b1', 'Reproduce #77') $$,
  $$ values ('eeeeeeee-0000-4000-8000-0000000000b1'::uuid, 'aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, 'Reproduce #77', true, null::timestamptz) $$,
  'an admin past the second factor starts one with his own token'
);
select throws_ok(
  $$ select public.start_impersonation('aaaaaaaa-0000-4000-8000-0000000000b3', '  ') $$,
  '23514', null, 'a switch with a blank reason is refused'
);
select throws_ok(
  $$ select public.start_impersonation('dddddddd-0000-4000-8000-0000000000b1', 'Portal') $$,
  'IMS02', null, 'as is a switch to a non-member'
);
select throws_ok(
  $$ select public.start_impersonation('eeeeeeee-0000-4000-8000-0000000000b1', 'Myself') $$,
  '23514', null, 'and one to himself'
);
select is(
  (select target_user_id from public.impersonations where ended_at is null),
  'aaaaaaaa-0000-4000-8000-0000000000b1'::uuid,
  'a refused switch leaves the open impersonation as it was'
);
select lives_ok(
  $$ select public.start_impersonation('aaaaaaaa-0000-4000-8000-0000000000b3', 'Reproduce #78') $$,
  'switching member is one call'
);
select results_eq(
  $$ select target_user_id, ended_at is null from public.impersonations order by ended_at nulls last $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, false), ('aaaaaaaa-0000-4000-8000-0000000000b3'::uuid, true) $$,
  'which ends the first and starts the second'
);

select pg_temp.act_as_postgres();
select results_eq(
  $$ select e.action, e.actor_id, e.impersonating_user_id, e.organization_id, e.source
     from audit.events e join public.impersonations i on i.id = e.row_id
     where e.table_name = 'impersonations' and i.admin_user_id = 'eeeeeeee-0000-4000-8000-0000000000b1'
     order by e.id $$,
  $$ values
     ('impersonation_started', 'eeeeeeee-0000-4000-8000-0000000000b1'::uuid, 'aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, '11111111-0000-4000-8000-0000000000b1'::uuid, 'user'),
     ('impersonation_ended', 'eeeeeeee-0000-4000-8000-0000000000b1'::uuid, 'aaaaaaaa-0000-4000-8000-0000000000b1'::uuid, '11111111-0000-4000-8000-0000000000b1'::uuid, 'user'),
     ('impersonation_started', 'eeeeeeee-0000-4000-8000-0000000000b1'::uuid, 'aaaaaaaa-0000-4000-8000-0000000000b3'::uuid, '11111111-0000-4000-8000-0000000000b2'::uuid, 'user') $$,
  'each start and end is recorded once, with the admin as the actor'
);

update public.impersonations set started_at = now() - interval '3 hours', expires_at = now() - interval '1 hour 30 minutes'
where ended_at is null and admin_user_id = 'eeeeeeee-0000-4000-8000-0000000000b1';
select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000b1', 'aal2');
select lives_ok(
  $$ select public.start_impersonation('aaaaaaaa-0000-4000-8000-0000000000b2', 'Reproduce #79') $$,
  'an expired impersonation never ended does not stand in the way of the next'
);

select * from finish();
rollback;
