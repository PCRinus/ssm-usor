begin;
select plan(27);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sms-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000051', 'SMS Org'),
  ('11111111-0000-4000-8000-000000000052', 'Other Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000051', '11111111-0000-4000-8000-000000000051', 'owner');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.claim(kind text, allowance int, cap int)
returns table (id uuid, refusal text, overage boolean)
language sql as $$
  select * from public.claim_sms_send(
    '11111111-0000-4000-8000-000000000051', kind::public.sms_kind,
    date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
    allowance, cap
  );
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000051');

select throws_ok($$ select * from public.sms_sends $$, '42501', null, 'a member cannot read the SMS log');
select throws_ok($$ select * from public.sms_code_grants $$, '42501', null, 'a member cannot read the codes granted by hand');
select throws_ok($$ select * from public.usage_notices $$, '42501', null, 'a member cannot read the usage notices');
select throws_ok(
  $$ select * from public.claim_sms_send('11111111-0000-4000-8000-000000000051', 'signing_code', now(), now() + interval '1 month', null, null) $$,
  '42501', null,
  'a member cannot record a send'
);
select throws_ok(
  $$ select * from public.sms_period_usage('11111111-0000-4000-8000-000000000051', now(), now() + interval '1 month') $$,
  '42501', null,
  'a member cannot read the counts'
);
select throws_ok(
  $$ select public.grant_signing_codes('11111111-0000-4000-8000-000000000051', now(), now() + interval '1 month', 100, 'Myself', 'me') $$,
  '42501', null,
  'a member cannot grant codes'
);
select throws_ok(
  $$ update public.subscriptions set sms_cap_factor = 20 $$,
  '42501', null,
  'a member cannot raise the cap directly'
);

reset role;
set local role service_role;

select results_eq(
  $$ select refusal, overage from pg_temp.claim('participant_invitation', 0, null) $$,
  $$ values (null::text, false) $$,
  'an invitation is sent whatever the allowance, since it is not counted'
);

select is(
  (select counted from public.sms_sends where kind = 'participant_invitation'),
  false,
  'and it is logged uncounted'
);

select results_eq(
  $$ select refusal, overage from pg_temp.claim('signing_code', 2, null)
     union all select refusal, overage from pg_temp.claim('signing_code', 2, null) $$,
  $$ values (null::text, false), (null::text, false) $$,
  'signing codes go out up to the allowance'
);

select results_eq(
  $$ select id is null, refusal from pg_temp.claim('signing_code', 2, null) $$,
  $$ values (true, 'sms_allowance_reached') $$,
  'a hard stop refuses the next code and records nothing'
);

select results_eq(
  $$ select refusal, overage from pg_temp.claim('signing_code', 2, 3) $$,
  $$ values (null::text, true) $$,
  'past the allowance and below the cap a code goes out as overage'
);

select results_eq(
  $$ select refusal from pg_temp.claim('signing_code', 2, 3) $$,
  $$ values ('sms_cap_reached'::text) $$,
  'at the cap a code is refused'
);

select results_eq(
  $$ select used, overage, granted from public.sms_period_usage('11111111-0000-4000-8000-000000000051', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month') $$,
  $$ values (3, 1, 0) $$,
  'the month counts the signing codes and their overage, not the invitation'
);

select is(
  public.grant_signing_codes(
    '11111111-0000-4000-8000-000000000051',
    date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
    2, 'Tester, runda 1', 'mircea'
  ),
  2,
  'codes granted by hand answer the month''s total'
);

select results_eq(
  $$ select refusal, overage from pg_temp.claim('signing_code', 2, null) $$,
  $$ values (null::text, false) $$,
  'grants raise the allowance'
);

select results_eq(
  $$ select refusal, overage from pg_temp.claim('signing_code', 2, 3) $$,
  $$ values (null::text, true) $$,
  'and the cap'
);

select results_eq(
  $$ select change, reason, details ->> 'codes', details ->> 'actor' from public.subscription_changes
     where organization_id = '11111111-0000-4000-8000-000000000051' $$,
  $$ values ('signing_codes_granted', 'Tester, runda 1', '2', 'mircea') $$,
  'a grant is logged with its reason and who ran it'
);

select throws_ok(
  $$ select public.grant_signing_codes('11111111-0000-4000-8000-000000000051', now(), now() + interval '1 month', 5, ' ', 'mircea') $$,
  '22023', 'reason_required',
  'a grant needs a reason'
);

select results_eq(
  $$ select refusal, overage from public.claim_sms_send('11111111-0000-4000-8000-000000000052', 'signing_code', now(), now() + interval '1 month', null, null) $$,
  $$ values (null::text, false) $$,
  'nothing limits an organization without an allowance'
);

select is(
  (select count(*)::int from public.sms_sends where organization_id = '11111111-0000-4000-8000-000000000052' and counted),
  1,
  'though its codes are still counted'
);

select throws_ok(
  $$ insert into public.sms_sends (organization_id, kind, counted, period_start, period_end)
     values ('11111111-0000-4000-8000-000000000051', 'sign_in_code', true, now(), now() + interval '1 month') $$,
  '23514', null,
  'only signing codes count'
);

select throws_ok(
  $$ insert into public.sms_sends (organization_id, kind, counted, overage, period_start, period_end)
     values ('11111111-0000-4000-8000-000000000051', 'signing_code', false, true, now(), now() + interval '1 month') $$,
  '23514', null,
  'an overage is a counted code'
);

insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
values ('11111111-0000-4000-8000-000000000051', 'profesional', 'trialing', now() + interval '30 days', now() + interval '30 days');

select is(
  (select sms_cap_factor from public.subscriptions where organization_id = '11111111-0000-4000-8000-000000000051'),
  3::smallint,
  'the safety cap is three times the allowance by default'
);

select throws_ok(
  $$ update public.subscriptions set sms_cap_factor = 21 where organization_id = '11111111-0000-4000-8000-000000000051' $$,
  '23514', null,
  'and at most twenty times it'
);

insert into public.usage_notices (organization_id, period_start, kind)
values ('11111111-0000-4000-8000-000000000051', date_trunc('month', now()), 'sms_80');

select throws_ok(
  $$ insert into public.usage_notices (organization_id, period_start, kind)
     values ('11111111-0000-4000-8000-000000000051', date_trunc('month', now()), 'sms_80') $$,
  '23505', null,
  'a usage notice goes once a month'
);

select throws_ok(
  $$ insert into public.usage_notices (organization_id, period_start, kind)
     values ('11111111-0000-4000-8000-000000000051', date_trunc('month', now()), 'mail_80') $$,
  '23514', null,
  'a usage notice is about SMS or credits'
);

select * from finish();
rollback;
