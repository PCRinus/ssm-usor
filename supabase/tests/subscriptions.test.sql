begin;
select plan(30);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seeded-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Tester@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-admin@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'twin@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'TWIN@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Seeded Org'),
  ('33333333-0000-4000-8000-000000000001', 'Twin One'),
  ('33333333-0000-4000-8000-000000000002', 'Twin Two');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('dddddddd-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000001', 'owner'),
  ('dddddddd-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000002', 'owner');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.tester_organization()
returns uuid language sql as $$
  select organization_id from public.organization_members where user_id = 'bbbbbbbb-0000-4000-8000-000000000001';
$$;

-- An organization without a subscription -------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select access from public.current_membership()),
  'full'::public.access_level,
  'an organization without a subscription has full access'
);

-- Onboarding starts the trial ------------------------------------------------------
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select public.create_organization('Tester SSM SRL', 'Tina Tester', '2026-10-26', true);

select results_eq(
  $$ select plan::text, status::text, trial_ends_at = access_until,
            trial_ends_at between now() + interval '30 days' - interval '1 minute' and now() + interval '30 days'
     from public.subscriptions $$,
  $$ values ('profesional', 'trialing', true, true) $$,
  'a new organization starts a 30-day Profesional trial, and its member reads it'
);

select is(
  (select access from public.current_membership()),
  'full'::public.access_level,
  'a trial gives full access'
);

select is(
  public.access_at(now() - interval '1 second'),
  'read_only'::public.access_level,
  'access is read-only once its end has passed'
);

select throws_ok(
  $$ update public.subscriptions set access_until = now() + interval '1 year' $$,
  '42501', null,
  'a member cannot change the subscription'
);

select throws_ok(
  $$ insert into public.subscriptions (organization_id, plan, status) values ('11111111-0000-4000-8000-000000000001', 'start', 'active') $$,
  '42501', null,
  'a member cannot create a subscription'
);

select throws_ok(
  $$ delete from public.subscriptions $$,
  '42501', null,
  'a member cannot delete the subscription'
);

select throws_ok(
  $$ select * from public.subscription_changes $$,
  '42501', null,
  'a member cannot read the change log'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '90 days', 'Tester', 'someone', false) $$,
  '42501', null,
  'a member cannot extend a trial'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select is_empty(
  $$ select organization_id from public.subscriptions $$,
  'a member of another organization sees no subscription'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.access_at(now()) $$,
  '42501', null,
  'an anonymous caller cannot use the access rule'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '90 days', 'Tester', 'someone', false) $$,
  '42501', null,
  'an anonymous caller cannot extend a trial'
);

reset role;

select results_eq(
  $$ select source, change from public.subscription_changes where organization_id = pg_temp.tester_organization() $$,
  $$ values ('onboarding', 'trial_started') $$,
  'starting the trial is logged'
);

select throws_ok(
  $$ update public.subscriptions set status = 'canceled', access_until = null where organization_id = pg_temp.tester_organization() $$,
  '23514', null,
  'only a renewing paid plan may run without an end of access'
);

-- A participant of the tester's client ---------------------------------------------
insert into public.clients (id, organization_id, legal_name, cui, stage)
values ('c1c1c1c1-0000-4000-8000-000000000001', pg_temp.tester_organization(), 'Client One', '1590082', 'client');
insert into public.client_participants (organization_id, client_id, kind, full_name, user_id)
values (pg_temp.tester_organization(), 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', 'Clara Client', 'cccccccc-0000-4000-8000-000000000001');

-- Ending and extending -------------------------------------------------------------
update public.subscriptions set access_until = now() - interval '1 day', trial_ends_at = now() - interval '1 day';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select is(
  (select access from public.current_membership()),
  'read_only'::public.access_level,
  'after the trial ends the organization is read-only'
);

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');
select is(
  (select access from public.current_participations()),
  'read_only'::public.access_level,
  'and so is it for the participants of its clients'
);

reset role;
set local role service_role;

select throws_ok(
  $$ select * from public.extend_trial('nobody@test', now() + interval '90 days', 'Tester', 'mircea', false) $$,
  'TRL01', 'owner_not_found',
  'an unknown owner email is refused'
);

select throws_ok(
  $$ select * from public.extend_trial('twin@test', now() + interval '90 days', 'Tester', 'mircea', false) $$,
  'TRL05', 'owner_ambiguous',
  'an email that matches two owners is refused'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() - interval '1 day', 'Tester', 'mircea', false) $$,
  'TRL03', 'trial_end_not_in_future',
  'an end in the past is refused'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '90 days', ' ', 'mircea', false) $$,
  '22023', 'reason_required',
  'a reason is required'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '90 days', 'Tester', ' ', false) $$,
  '22023', 'actor_required',
  'who runs it is required'
);

select results_eq(
  $$ select organization_name, started from public.extend_trial(' TESTER@test ', now() + interval '90 days', 'Tester round one', 'mircea', false) $$,
  $$ values ('Tester SSM SRL', false) $$,
  'the owner is found by email whatever its case, and the trial is extended, not started'
);

select results_eq(
  $$ select status::text, access_until > now() + interval '89 days' from public.subscriptions where organization_id = pg_temp.tester_organization() $$,
  $$ values ('trialing', true) $$,
  'extending moves the trial end and full access with it'
);

select is(
  (select trial_sms from public.subscriptions where organization_id = pg_temp.tester_organization()),
  false,
  'a trial sends no SMS unless asked'
);

select results_eq(
  $$ select change, reason, details ->> 'actor' from public.subscription_changes
     where organization_id = pg_temp.tester_organization() and source = 'workflow' $$,
  $$ values ('trial_extended', 'Tester round one', 'mircea') $$,
  'the extension is logged with its reason and who ran it'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '60 days', 'Shorter', 'mircea', false) $$,
  'TRL04', 'trial_end_not_later',
  'a trial is never shortened'
);

select results_eq(
  $$ select started from public.extend_trial('seeded-owner@test', now() + interval '60 days', 'Converted to a trial', 'mircea', true) $$,
  $$ values (true) $$,
  'an organization without a subscription starts a trial, and says so'
);

select is(
  (select trial_sms from public.subscriptions where organization_id = '11111111-0000-4000-8000-000000000001'),
  true,
  'and a tester''s trial may include SMS'
);

select results_eq(
  $$ select change from public.subscription_changes where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  $$ values ('trial_started') $$,
  'and logs a start, not an extension'
);

reset role;
update public.subscriptions set status = 'active', access_until = null where organization_id = pg_temp.tester_organization();
set local role service_role;

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '120 days', 'Tester', 'mircea', false) $$,
  'TRL02', 'subscription_not_in_trial',
  'a paid plan gets no trial'
);

select * from finish();
rollback;
