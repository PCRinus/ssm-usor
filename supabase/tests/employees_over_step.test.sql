begin;
select plan(48);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Big client', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Small client', '14399840', 'client'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Empty archived client', '18547290', 'client');

update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.hire(p_client uuid, p_count integer, p_status text default 'active')
returns void language sql as $$
  insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, status, terminated_at)
  select '11111111-0000-4000-8000-000000000001', p_client, 'Popescu', 'Ion ' || n, 'Sudor', date '2020-01-01',
    p_status::public.employee_status, case when p_status = 'terminated' then date '2021-01-01' end
  from generate_series(1, p_count) n;
$$;

create or replace function pg_temp.as_secret_key()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create or replace function pg_temp.since()
returns timestamptz language sql as $$
  select employees_over_step_since from public.subscriptions
  where organization_id = '11111111-0000-4000-8000-000000000001';
$$;

create or replace function pg_temp.set_since(p_since timestamptz)
returns void language sql as $$
  update public.subscriptions set employees_over_step_since = p_since
  where organization_id = '11111111-0000-4000-8000-000000000001';
$$;

create or replace function pg_temp.a_month_ago()
returns timestamptz language sql as $$
  select now() - interval '1 month' - interval '2 days';
$$;

select is(public.employees_over_step_last_day('2026-11-14 10:00+02'), date '2026-12-14', 'the last day is the same day a month later');
select is(public.employees_over_step_last_day('2026-11-14 23:30+00'), date '2026-12-15', 'the day is the Romanian one');
select is(public.employees_over_step_last_day('2027-01-31 10:00+02'), date '2027-02-28', 'a shorter month ends on its last day, as Stripe''s months do');
select is(public.employees_over_step_blocks_at('2026-11-14 10:00+02'), '2026-12-15 00:00+02'::timestamptz, 'the block starts when the last day ends');

select pg_temp.hire('cccccccc-0000-4000-8000-000000000001', 300);
select is((select count(*)::int from public.employees_over_step('11111111-0000-4000-8000-000000000001')), 0, 'an organization without a subscription has no step');

delete from public.employees;
insert into public.subscriptions (organization_id, plan, status, access_until, stripe_account, stripe_customer_id, stripe_subscription_id, billing_interval, price_version, employee_step)
values ('11111111-0000-4000-8000-000000000001', 'start', 'active', null, 'acct_test', 'cus_test', 'sub_test', 'month', 'v2', 250);

select pg_temp.hire('cccccccc-0000-4000-8000-000000000001', 250);
select is(pg_temp.since(), null, 'exactly the step starts no clock');

select pg_temp.hire('cccccccc-0000-4000-8000-000000000001', 1);
select is(pg_temp.since(), now(), 'one past the step starts the clock at that moment');
select ok(
  exists (select 1 from public.subscription_changes where source = 'database' and change = 'employees over step'),
  'the start is in the change log'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000002', 1) $$, 'within the month a member adds employees');
reset role;
select is(pg_temp.since(), now(), 'adding more keeps the clock where it started');

select is(
  (select row(employees, employee_limit, last_day, blocked)::text from public.employees_over_step('11111111-0000-4000-8000-000000000001')),
  row(252, 250, public.employees_over_step_last_day(now()), false)::text,
  'the state names the count, the step, the last day and no block'
);

select is(
  (select row(kind, employees, employee_limit)::text from public.employees_over_step_notices_due()),
  row('employees_over', 252, 250)::text,
  'the owner is told when the clock starts'
);
insert into public.usage_notices (organization_id, period_start, kind)
values ('11111111-0000-4000-8000-000000000001', now(), 'employees_over');
select is((select count(*)::int from public.employees_over_step_notices_due()), 0, 'once');
select pg_temp.set_since(now() - interval '1 month' + interval '2 days');
select is(
  (select kind from public.employees_over_step_notices_due()),
  'employees_soon',
  'and again three days before the last day'
);

select pg_temp.set_since(
  (select max(d::date + time '12:00') at time zone 'Europe/Bucharest'
   from generate_series((now() at time zone 'Europe/Bucharest')::date - 40, (now() at time zone 'Europe/Bucharest')::date, interval '1 day') d
   where public.employees_over_step_last_day((d::date + time '12:00') at time zone 'Europe/Bucharest') = (now() at time zone 'Europe/Bucharest')::date)
);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select case
  when pg_temp.since() is null then pass('no day a month before ends today')
  else lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000002', 1) $$, 'on the last day a member still adds employees')
end;
reset role;

select pg_temp.set_since(
  (select max(d::date + time '12:00') at time zone 'Europe/Bucharest'
   from generate_series((now() at time zone 'Europe/Bucharest')::date - 40, (now() at time zone 'Europe/Bucharest')::date, interval '1 day') d
   where public.employees_over_step_last_day((d::date + time '12:00') at time zone 'Europe/Bucharest') = (now() at time zone 'Europe/Bucharest')::date - 1)
);
select case
  when pg_temp.since() is null then pass('no day a month before ended yesterday')
  else is(
    (select blocked from public.employees_over_step('11111111-0000-4000-8000-000000000001')),
    true,
    'the day after the last day the organization is blocked'
  )
end;

select pg_temp.set_since(pg_temp.a_month_ago());
select is((select blocked from public.employees_over_step('11111111-0000-4000-8000-000000000001')), true, 'after the month the organization is blocked');

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000002', 1) $$, 'STP01', null, 'a new employee is refused');
select lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000002', 1, 'terminated') $$, 'a former employee, who is not counted, is still recorded');

select throws_ok(
  $$ update public.employees set status = 'active', terminated_at = null
     where status = 'terminated' and client_id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'STP01', null, 'reactivating a former employee is refused'
);
select lives_ok(
  $$ update public.employees set notes = 'Schimbat'
     where client_id = 'cccccccc-0000-4000-8000-000000000001' and first_name = 'Ion 1' $$,
  'editing an employee works'
);
select lives_ok(
  $$ insert into public.clients (id, organization_id, legal_name, cui, stage)
     values ('cccccccc-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'New client', '6720283', 'client') $$,
  'a client without employees is added'
);
select throws_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000004', 1) $$, 'STP01', null, 'but no employee of it');
select lives_ok(
  $$ update public.clients set archived_at = null where id = 'cccccccc-0000-4000-8000-000000000003' $$,
  'a client without employees is restored'
);
select lives_ok(
  $$ update public.employees set status = 'terminated', terminated_at = date '2026-11-01'
     where id = (select id from public.employees
                 where client_id = 'cccccccc-0000-4000-8000-000000000002' and status = 'active' limit 1) $$,
  'an employee leaves'
);
reset role;
select is(pg_temp.since(), pg_temp.a_month_ago(), 'still over, the clock stays');

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$ update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'a client is archived'
);
select throws_ok(
  $$ update public.clients set archived_at = null where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'STP01', null, 'restoring a client with employees is refused'
);
reset role;
select is(pg_temp.since(), pg_temp.a_month_ago(), 'a refused change leaves the clock alone');

select pg_temp.as_secret_key();
select lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000002', 1) $$, 'the secret key is not refused');
delete from public.employees where client_id = 'cccccccc-0000-4000-8000-000000000002' and status = 'active';

update public.subscriptions set employee_step = 500 where organization_id = '11111111-0000-4000-8000-000000000001';
select is(pg_temp.since(), null, 'a step that covers the count clears the clock');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000004', 1) $$, 'and the block is lifted at once');
reset role;
select ok(
  exists (select 1 from public.subscription_changes where source = 'database' and change = 'employees within step'),
  'the end is in the change log'
);

update public.subscriptions set employee_step = 250 where organization_id = '11111111-0000-4000-8000-000000000001';
select is(pg_temp.since(), now(), 'a lower step starts a new clock, never an older one');
select pg_temp.set_since(pg_temp.a_month_ago());
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000004', 1) $$, 'STP01', null, 'blocked again after its month');
select lives_ok(
  $$ update public.employees set archived_at = now()
     where id in (select id from public.employees where client_id = 'cccccccc-0000-4000-8000-000000000001'
                  and archived_at is null and status = 'active'
                  order by id limit (select count(*) - 250 from public.employees e join public.clients c on c.id = e.client_id
                                     where e.status = 'active' and e.archived_at is null and c.archived_at is null)) $$,
  'employees entered by mistake are archived'
);
reset role;
select is(pg_temp.since(), null, 'back at the step clears the clock');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000004', 1) $$, 'adding is open again');
reset role;
select is(pg_temp.since(), now(), 'and passing the step again starts a fresh month');

select pg_temp.set_since(pg_temp.a_month_ago());
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.employees set archived_at = null
     where id in (select id from public.employees where archived_at is not null limit 1) $$,
  'STP01', null, 'bringing back an archived employee is refused'
);
reset role;

delete from public.employees where client_id = 'cccccccc-0000-4000-8000-000000000004';
delete from public.employees where archived_at is not null;
select pg_temp.set_since(pg_temp.a_month_ago());
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.hire('cccccccc-0000-4000-8000-000000000004', 1) $$, 'a stale clock is checked against the live count');
reset role;

delete from public.subscriptions;
insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
values ('11111111-0000-4000-8000-000000000001', 'profesional', 'trialing', now() + interval '10 days', now() + interval '10 days');
select pg_temp.hire('cccccccc-0000-4000-8000-000000000001', 300);
select is(pg_temp.since(), null, 'a trial counts against its own limit, not a step');

update public.subscriptions
set plan = 'start', employee_step = 250, stripe_account = 'acct_test', stripe_customer_id = 'cus_test', stripe_subscription_id = 'sub_test',
  billing_interval = 'month', price_version = 'v2'
where organization_id = '11111111-0000-4000-8000-000000000001';
select is(pg_temp.since(), null, 'a plan chosen during the trial is not counted against its step before the trial ends');

update public.subscriptions set trial_ends_at = now() - interval '1 minute', access_until = now() + interval '14 days'
where organization_id = '11111111-0000-4000-8000-000000000001';
select is(pg_temp.since(), now(), 'when the trial ends the step applies, from then');

delete from public.subscriptions;
insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
values ('11111111-0000-4000-8000-000000000001', 'profesional', 'trialing', now() + interval '10 days', now() + interval '10 days');
-- Emulates the end of a trial, which passes without a write.
alter table public.subscriptions disable trigger subscriptions_employees_over_step_update;
update public.subscriptions set trial_ends_at = now() - interval '1 second';
alter table public.subscriptions enable trigger subscriptions_employees_over_step_update;
select is(pg_temp.since(), null, 'a trial that ended without a write has no clock yet');
select is(
  (select over_since from public.employees_over_step('11111111-0000-4000-8000-000000000001')),
  now(),
  'reading the state starts it from that moment'
);
select is(public.refresh_all_employees_over_step(), 1, 'the daily refresh goes over every subscription with a step');

delete from public.subscriptions;
insert into public.subscriptions (organization_id, plan, status, access_until)
values ('11111111-0000-4000-8000-000000000001', 'enterprise', 'active', null);
select pg_temp.hire('cccccccc-0000-4000-8000-000000000001', 5000);
select is(pg_temp.since(), null, 'Enterprise has no step and no clock');

select * from finish();
rollback;
