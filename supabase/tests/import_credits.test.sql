begin;
select plan(43);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000061', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'credits-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000061', 'Credits Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000061', 'owner');

insert into public.imports (id, organization_id, kind, into_existing_client, status, started_at) values
  ('22222222-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000061', 'client', false, 'reading', now()),
  ('22222222-0000-4000-8000-000000000062', '11111111-0000-4000-8000-000000000061', 'client', false, 'reading', now()),
  ('22222222-0000-4000-8000-000000000063', '11111111-0000-4000-8000-000000000061', 'client', false, 'reading', now());

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

-- This month is the calendar month here; the API passes the subscription's.
create or replace function pg_temp.month_start(shift int default 0)
returns timestamptz language sql as $$
  select date_trunc('month', now()) + make_interval(months => shift);
$$;

create or replace function pg_temp.charge(
  import_n int, kind text, credits int, key text, require boolean, shift int default 0
)
returns table (charged int, refused boolean, balance int, gift_left int)
language sql as $$
  select * from public.charge_credits(
    '11111111-0000-4000-8000-000000000061', kind::public.credit_entry_kind, credits,
    ('22222222-0000-4000-8000-0000000000' || import_n::text)::uuid, null,
    case when kind = 'scanned_page' then 1 end, key, require,
    pg_temp.month_start(shift), pg_temp.month_start(shift + 1), 300,
    pg_temp.month_start(shift - 1), pg_temp.month_start(shift), 300
  );
$$;

create or replace function pg_temp.balance(shift int default 0)
returns table (granted int, used int, shortfall int, balance int, gift_left int)
language sql as $$
  select * from public.credit_balance(
    '11111111-0000-4000-8000-000000000061',
    pg_temp.month_start(shift), pg_temp.month_start(shift + 1), 300,
    pg_temp.month_start(shift - 1), pg_temp.month_start(shift), 300
  );
$$;

-- One statement per page, as the API makes one call per page.
create or replace function pg_temp.scans(import_n int, pages int, shift int default 0)
returns int language plpgsql as $$
declare
  total int := 0;
  one int;
begin
  for n in 1..pages loop
    select c.charged into one
    from pg_temp.charge(import_n, 'scanned_page', 1, 'page:' || import_n || ':' || shift || ':' || n, false) c;
    total := total + one;
  end loop;
  return total;
end;
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000061');

select throws_ok($$ select * from public.credit_entries $$, '42501', null, 'a member cannot read the ledger');
select throws_ok($$ select * from public.credit_periods $$, '42501', null, 'a member cannot read the months');
select throws_ok(
  $$ select * from public.credit_balance('11111111-0000-4000-8000-000000000061', now(), now() + interval '1 month', 300, null, null, null) $$,
  '42501', null, 'a member cannot read a balance directly'
);
select throws_ok(
  $$ select * from public.charge_credits('11111111-0000-4000-8000-000000000061', 'import_start', 1, null, null, null, 'x', true, now(), now() + interval '1 month', 300, null, null, null) $$,
  '42501', null, 'a member cannot charge'
);
select throws_ok(
  $$ select public.grant_credits('11111111-0000-4000-8000-000000000061', now(), now() + interval '1 month', 300, null, null, null, 1000, 'Myself', 'me') $$,
  '42501', null, 'a member cannot grant credits'
);
select throws_ok(
  $$ select public.grant_welcome_gift('11111111-0000-4000-8000-000000000061', 10000) $$,
  '42501', null, 'a member cannot grant a gift'
);
select throws_ok(
  $$ select public.refund_import_credits('22222222-0000-4000-8000-000000000061') $$,
  '42501', null, 'a member cannot refund'
);
select throws_ok(
  $$ select public.give_back_import_credits('22222222-0000-4000-8000-000000000061', 5, 'x') $$,
  '42501', null, 'a member cannot give credits back'
);

reset role;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.credit_entries'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.credit_periods'::regclass),
  'row-level security is on for both tables'
);

set local role service_role;

select results_eq(
  $$ select granted, used, shortfall, balance, gift_left from pg_temp.balance() $$,
  $$ values (0, 0, 0, 300, 0) $$,
  'a month with nothing used has its allowance'
);

select results_eq(
  $$ select charged, refused, balance from pg_temp.charge(61, 'import_start', 25, 'start:61', true) $$,
  $$ values (25, false, 275) $$,
  'an import starts on the credits its known part needs'
);

select results_eq(
  $$ select charged, refused, balance from pg_temp.charge(61, 'import_start', 25, 'start:61', true) $$,
  $$ values (25, false, 275) $$,
  'the same start delivered again answers what it charged'
);

select is(
  (select count(*)::int from public.credit_entries where key = 'start:61'),
  1,
  'and is charged once'
);

select results_eq(
  $$ select charged, refused, balance from pg_temp.charge(62, 'import_start', 276, 'start:62', true) $$,
  $$ values (0, true, 275) $$,
  'an import whose known part the balance does not cover is refused'
);

select is(
  (select count(*)::int from public.credit_entries where key = 'start:62'),
  0,
  'and nothing is recorded for it'
);

select is(pg_temp.scans(61, 275), 275, 'scanned pages use the month down to zero');

select results_eq(
  $$ select charged, balance from pg_temp.charge(61, 'scanned_page', 1, 'page:61:0:1', false) $$,
  $$ values (1, 0) $$,
  'a scanned page delivered again is charged once'
);

select is(pg_temp.scans(61, 160, 100), 150, 'past zero the pages are charged down to 150 below, no further');

select results_eq(
  $$ select balance, used from pg_temp.balance() $$,
  $$ values (-150, 450) $$,
  'the balance stops at 150 below zero'
);

select is(
  (select count(*)::int from public.credit_entries where kind = 'scanned_page' and credits = 0),
  10,
  'the pages past the floor are recorded at nothing, and the import goes on'
);

select results_eq(
  $$ select charged, refused from pg_temp.charge(63, 'import_start', 1, 'start:63', true) $$,
  $$ values (0, true) $$,
  'a new import cannot start below zero'
);

select results_eq(
  $$ select shortfall, balance from pg_temp.balance(1) $$,
  $$ values (150, 150) $$,
  'the next month starts short by what this one ended below zero'
);

select is(
  public.grant_welcome_gift('11111111-0000-4000-8000-000000000061', 2500),
  2500,
  'the first payment brings the gift'
);
select is(
  public.grant_welcome_gift('11111111-0000-4000-8000-000000000061', 2500),
  0,
  'and only once'
);
select is(
  public.grant_welcome_gift('11111111-0000-4000-8000-000000000061', 10000),
  7500,
  'moving up to Profesional brings the difference'
);
select is(
  public.grant_welcome_gift('11111111-0000-4000-8000-000000000061', 10000)
  + public.grant_welcome_gift('11111111-0000-4000-8000-000000000061', 2500),
  0,
  'once, and moving down takes nothing'
);
select is(
  (select count(*)::int from public.subscription_changes
   where organization_id = '11111111-0000-4000-8000-000000000061' and change = 'welcome_gift'),
  2,
  'each gift is in the change log'
);

select results_eq(
  $$ select balance, gift_left from pg_temp.balance() $$,
  $$ values (-150, 10000) $$,
  'the gift is a balance of its own, which does not make up the month'
);

select results_eq(
  $$ select charged, refused, balance, gift_left from pg_temp.charge(62, 'import_start', 200, 'start:62:next', true, 1) $$,
  $$ values (200, false, 0, 9950) $$,
  'the month''s credits go first, then the gift'
);

select results_eq(
  $$ select credits, gift_credits from public.credit_entries where key = 'start:62:next' $$,
  $$ values (-200, -50) $$,
  'the entry keeps what the gift paid'
);

update public.imports set status = 'failed', failure_reason = 'Serviciul nu a răspuns.', failed_at = now()
where id = '22222222-0000-4000-8000-000000000062';

select results_eq(
  $$ select credits, gift_credits from public.credit_entries
     where import_id = '22222222-0000-4000-8000-000000000062' and kind = 'refund' $$,
  $$ values (200, 50) $$,
  'an import that fails while running gets everything back, the gift its part'
);

select is(
  public.refund_import_credits('22222222-0000-4000-8000-000000000062'),
  0,
  'and only once'
);

select results_eq(
  $$ select charged from pg_temp.charge(62, 'scanned_page', 1, 'page:62:late', false, 1) $$,
  $$ values (0) $$,
  'a page read after the refund is not charged'
);

update public.imports set status = 'ready', ready_at = now() where id = '22222222-0000-4000-8000-000000000061';
update public.imports set status = 'failed', failure_reason = 'Lăsat 14 zile.', failed_at = now()
where id = '22222222-0000-4000-8000-000000000061';

select is(
  (select count(*)::int from public.credit_entries
   where import_id = '22222222-0000-4000-8000-000000000061' and kind = 'refund'),
  0,
  'an import left after its reading is not refunded'
);

select is(
  public.grant_credits(
    '11111111-0000-4000-8000-000000000061',
    pg_temp.month_start(1), pg_temp.month_start(2), 300,
    pg_temp.month_start(0), pg_temp.month_start(1), 300,
    500, 'A rămas fără credite', 'mircea'
  ),
  650,
  'credits granted by hand go to the month, which keeps the shortfall it started with'
);

select results_eq(
  $$ select reason, actor from public.credit_entries where kind = 'grant' $$,
  $$ values ('A rămas fără credite'::text, 'mircea'::text) $$,
  'the grant keeps why and who'
);

select is(
  (select count(*)::int from public.subscription_changes
   where organization_id = '11111111-0000-4000-8000-000000000061' and change = 'credits_granted'
     and details ->> 'actor' = 'mircea'),
  1,
  'and is in the change log'
);

select throws_ok(
  $$ select public.grant_credits('11111111-0000-4000-8000-000000000061', now(), now() + interval '1 month', 300, null, null, null, 10, ' ', 'me') $$,
  '22023', null,
  'a grant needs a reason'
);

select results_eq(
  $$ select shortfall, allowance from public.credit_periods
     where organization_id = '11111111-0000-4000-8000-000000000061'
       and period_start = pg_temp.month_start(1) $$,
  $$ values (150, 300) $$,
  'the month opened with its first charge keeps the shortfall carried in'
);

select results_eq(
  $$ select shortfall from public.credit_balance(
       '11111111-0000-4000-8000-000000000061',
       pg_temp.month_start(0), pg_temp.month_start(1), 300,
       pg_temp.month_start(-1), pg_temp.month_start(0), 300) $$,
  $$ values (0) $$,
  'a month after one with nothing used carries nothing'
);

select pg_temp.charge(63, 'import_start', 10, 'start:63:next', true, 1);
select is(
  public.give_back_import_credits('22222222-0000-4000-8000-000000000063', 3, 'pages:63'),
  3,
  'an employee import gets back the pages its PDFs did not have'
);
select is(
  public.give_back_import_credits('22222222-0000-4000-8000-000000000063', 3, 'pages:63'),
  0,
  'once'
);

select throws_ok(
  $$ insert into public.credit_entries (organization_id, kind, credits) values ('11111111-0000-4000-8000-000000000061', 'grant', 10) $$,
  '23514', null,
  'a grant cannot be written without its reason and who ran it'
);

select * from finish();
rollback;
