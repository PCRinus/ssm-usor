begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000421', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sheet-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000421', 'Sheet Credits Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000421', '11111111-0000-4000-8000-000000000421', 'owner');

insert into public.imports (id, organization_id, kind, into_existing_client, status, started_at) values
  ('22222222-0000-4000-8000-000000000421', '11111111-0000-4000-8000-000000000421', 'client', false, 'reading', now());

create or replace function pg_temp.month_start(shift int default 0)
returns timestamptz language sql as $$
  select date_trunc('month', now()) + make_interval(months => shift);
$$;

create or replace function pg_temp.sheet(key text, credits int default 3, import_id uuid default null)
returns table (charged int, refused boolean, balance int, gift_left int)
language sql as $$
  select * from public.charge_credits(
    '11111111-0000-4000-8000-000000000421', 'safety_sheet', credits, import_id, null, null, key, true,
    pg_temp.month_start(), pg_temp.month_start(1), 10, null, null, null
  );
$$;

create or replace function pg_temp.balance()
returns int language sql as $$
  select balance from public.credit_balance(
    '11111111-0000-4000-8000-000000000421',
    pg_temp.month_start(), pg_temp.month_start(1), 10, null, null, null
  );
$$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-4000-8000-000000000421', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.refund_safety_sheet_credits('sheet:x') $$,
  '42501', null, 'a member cannot give a reading back'
);

reset role;
set local role service_role;

select results_eq(
  $$ select charged, refused, balance from pg_temp.sheet('sheet:1') $$,
  $$ values (3, false, 7) $$,
  'a reading of a safety data sheet takes 3 credits from the month'
);

select results_eq(
  $$ select charged, refused, balance from pg_temp.sheet('sheet:1') $$,
  $$ values (3, false, 7) $$,
  'the same reading sent again is charged once'
);

select throws_ok(
  $$ select * from pg_temp.sheet('sheet:2', 3, '22222222-0000-4000-8000-000000000421') $$,
  '22023', 'not_a_charge', 'a reading of a sheet belongs to no import'
);

select is(public.refund_safety_sheet_credits('sheet:1'), 3, 'a failed reading gives its credits back');
select is(public.refund_safety_sheet_credits('sheet:1'), 0, 'once');
select is(pg_temp.balance(), 10, 'and the month has them again');
select is(public.refund_safety_sheet_credits('sheet:none'), 0, 'a reading never charged gives nothing back');

select results_eq(
  $$ select charged, refused, balance from pg_temp.sheet('sheet:3', 11) $$,
  $$ values (0, true, 10) $$,
  'a reading the balance does not cover is refused and recorded nowhere'
);

select is(
  (select count(*)::int from public.credit_entries where key = 'sheet:3'),
  0,
  'nothing is written for a refused reading'
);

select throws_ok(
  $$ insert into public.credit_entries (organization_id, kind, credits, import_id, key)
     values ('11111111-0000-4000-8000-000000000421', 'safety_sheet_refund', 3, '22222222-0000-4000-8000-000000000421', 'refund:x') $$,
  '23514', null, 'a sheet''s refund names no import'
);

select * from finish();
rollback;
