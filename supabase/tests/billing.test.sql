begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Paying Org'),
  ('22222222-0000-4000-8000-000000000001', 'Other Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'owner');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

set local role service_role;

insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
values ('11111111-0000-4000-8000-000000000001', 'start', 'trialing', now() + interval '10 days', now() + interval '10 days');

select results_eq(
  $$ select employee_packs, extra_members, stripe_subscription_id is null, invoice_email is null
     from public.subscriptions where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  $$ values (0, 0, true, true) $$,
  'a trial has no packs, no extra members and nothing in Stripe'
);

select throws_ok(
  $$ update public.subscriptions set stripe_subscription_id = 'sub_1Abc'
     where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a Stripe subscription needs its customer, interval and price version'
);

select throws_ok(
  $$ update public.subscriptions set stripe_customer_id = 'cus_1Abc'
     where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a Stripe customer needs the account it lives in'
);

select lives_ok(
  $$ update public.subscriptions
     set stripe_account = 'acct_1Pfa', stripe_customer_id = 'cus_1Abc',
         stripe_subscription_id = 'sub_1Abc', billing_interval = 'year', price_version = 'v1',
         employee_packs = 2, extra_members = 1, invoice_email = 'contabilitate@firma.ro',
         current_period_end = now() + interval '1 year'
     where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  'a chosen plan records its Stripe ids, interval, price version and quantities'
);

select throws_ok(
  $$ insert into public.subscriptions (organization_id, plan, status, stripe_account, stripe_customer_id, stripe_subscription_id, billing_interval, price_version)
     values ('22222222-0000-4000-8000-000000000001', 'start', 'active', 'acct_1Pfa', 'cus_2Abc', 'sub_1Abc', 'month', 'v1') $$,
  '23505', null,
  'a Stripe subscription belongs to one organization'
);

select throws_ok(
  $$ update public.subscriptions set employee_packs = -1
     where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'packs are never negative'
);

select throws_ok(
  $$ update public.subscriptions set invoice_email = 'not an email'
     where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'the email for invoices is an email'
);

select throws_ok(
  $$ update public.subscriptions set price_version = '1'
     where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a price version reads like v1'
);

insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency, issued_at, oblio_series, oblio_number, oblio_link)
values
  ('in_1Paid', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', 47190, 'eur', now(), 'SSMUSOR', '0001', 'https://www.oblio.eu/docs/preview/invoice/1'),
  ('in_1Other', '22222222-0000-4000-8000-000000000001', 'acct_1Pfa', 'proforma', 4719, 'eur', now(), 'TEST', '0001', 'https://www.oblio.eu/docs/preview/proforma/1');

select lives_ok(
  $$ insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency)
     values ('in_1Pending', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', 4719, 'eur') $$,
  'a paid invoice is recorded before Oblio issues it'
);

select throws_ok(
  $$ insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency, issued_at)
     values ('in_1Half', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', 4719, 'eur', now()) $$,
  '23514', null,
  'an issued invoice carries its Oblio series, number and link'
);

select lives_ok(
  $$ insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency, storno_of)
     values ('re_1Refund', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', -47190, 'eur', 'in_1Paid') $$,
  'a refund is recorded as a storno of the invoice it reverses'
);

select throws_ok(
  $$ insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency, storno_of)
     values ('re_2Refund', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', 47190, 'eur', 'in_1Paid') $$,
  '23514', null,
  'a storno takes the amount back'
);

select throws_ok(
  $$ insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency)
     values ('in_1Minus', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', -100, 'eur') $$,
  '23514', null,
  'an invoice is never negative'
);

select lives_ok(
  $$ insert into public.stripe_events (id, type) values ('evt_1First', 'invoice.paid') $$,
  'the service role records a webhook event'
);

select throws_ok(
  $$ insert into public.stripe_events (id, type) values ('evt_1First', 'invoice.paid') $$,
  '23505', null,
  'and the same event cannot be recorded twice'
);

reset role;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select results_eq(
  $$ select stripe_invoice_id from public.billing_invoices order by stripe_invoice_id $$,
  $$ values ('in_1Paid'), ('in_1Pending'), ('re_1Refund') $$,
  'a member reads its own organization''s invoices and no other'
);

select results_eq(
  $$ select billing_interval::text, employee_packs, invoice_email from public.subscriptions $$,
  $$ values ('year', 2, 'contabilitate@firma.ro') $$,
  'a member reads its subscription''s billing fields'
);

select throws_ok(
  $$ update public.subscriptions set invoice_email = 'eu@firma.ro' $$,
  '42501', null,
  'a member cannot change where invoices go through the data API'
);

select throws_ok(
  $$ insert into public.billing_invoices (stripe_invoice_id, organization_id, stripe_account, kind, amount_cents, currency)
     values ('in_1Forged', '11111111-0000-4000-8000-000000000001', 'acct_1Pfa', 'invoice', 0, 'eur') $$,
  '42501', null,
  'a member cannot record an invoice'
);

select throws_ok(
  $$ update public.billing_invoices set amount_cents = 0 $$,
  '42501', null,
  'a member cannot change an invoice'
);

select throws_ok(
  $$ delete from public.billing_invoices $$,
  '42501', null,
  'a member cannot delete an invoice'
);

select throws_ok(
  $$ select * from public.stripe_events $$,
  '42501', null,
  'a member cannot read the webhook events'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.billing_invoices $$,
  '42501', null,
  'an anonymous caller cannot read invoices'
);

select throws_ok(
  $$ select * from public.stripe_events $$,
  '42501', null,
  'an anonymous caller cannot read the webhook events'
);

reset role;

select * from finish();
rollback;
