begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seeded-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Tester@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Seeded Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
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
select public.create_organization('Tester SSM SRL', 'Tina Tester', '2026-09-23');

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
  $$ select * from public.subscription_changes $$,
  '42501', null,
  'a member cannot read the change log'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '90 days', 'Tester') $$,
  '42501', null,
  'a member cannot extend a trial'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select is_empty(
  $$ select * from public.subscriptions $$,
  'a member of another organization sees no subscription'
);

reset role;

select results_eq(
  $$ select source, change from public.subscription_changes
     where organization_id = (select organization_id from public.organization_members where user_id = 'bbbbbbbb-0000-4000-8000-000000000001') $$,
  $$ values ('onboarding', 'trial_started') $$,
  'starting the trial is logged'
);

-- Ending and extending -------------------------------------------------------------
update public.subscriptions set access_until = now() - interval '1 day', trial_ends_at = now() - interval '1 day';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select is(
  (select access from public.current_membership()),
  'read_only'::public.access_level,
  'after the trial ends the organization is read-only'
);

reset role;
set local role service_role;

select throws_ok(
  $$ select * from public.extend_trial('nobody@test', now() + interval '90 days', 'Tester') $$,
  'SUB01', 'owner_not_found',
  'an unknown owner email is refused'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() - interval '1 day', 'Tester') $$,
  'SUB03', 'trial_end_not_in_future',
  'an end in the past is refused'
);

select throws_ok(
  $$ select * from public.extend_trial('tester@test', now() + interval '90 days', ' ') $$,
  '22023', 'reason_required',
  'a reason is required'
);

select results_eq(
  $$ select organization_name from public.extend_trial(' TESTER@test ', now() + interval '90 days', 'Tester round one') $$,
  $$ values ('Tester SSM SRL') $$,
  'the owner is found by email whatever its case'
);

select results_eq(
  $$ select status::text, access_until > now() + interval '89 days' from public.subscriptions s
     join public.organization_members m on m.organization_id = s.organization_id
     where m.user_id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  $$ values ('trialing', true) $$,
  'extending moves the trial end and full access with it'
);

select results_eq(
  $$ select source, change, reason from public.subscription_changes where change = 'trial_extended' $$,
  $$ values ('workflow', 'trial_extended', 'Tester round one') $$,
  'the extension is logged with its reason'
);

select lives_ok(
  $$ select * from public.extend_trial('seeded-owner@test', now() + interval '60 days', 'Converted to a trial') $$,
  'an organization without a subscription starts a trial when extended'
);

select * from finish();
rollback;
