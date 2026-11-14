begin;
select plan(25);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'extras-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000091', 'Extras Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'owner');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.month_start(shift int default 0)
returns timestamptz language sql as $$
  select date_trunc('month', now()) + make_interval(months => shift);
$$;

create or replace function pg_temp.charge(
  credits int, key text, require boolean, block_cents int default 150, shift int default 0
)
returns table (charged int, refused boolean, balance int, gift_left int, extra_blocks int)
language sql as $$
  select * from public.charge_credits(
    '11111111-0000-4000-8000-000000000091', 'safety_sheet', credits, null, null, null, key, require,
    pg_temp.month_start(shift), pg_temp.month_start(shift + 1), 100,
    pg_temp.month_start(shift - 1), pg_temp.month_start(shift), 100,
    null, block_cents
  );
$$;

create or replace function pg_temp.blocks()
returns int language sql as $$
  select count(*)::int from public.credit_extra_blocks
  where organization_id = '11111111-0000-4000-8000-000000000091';
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000091');

select throws_ok($$ select * from public.usage_extras $$, '42501', null, 'a member cannot read the ceilings');
select throws_ok(
  $$ insert into public.usage_extras (organization_id, kind, ceiling_cents) values ('11111111-0000-4000-8000-000000000091', 'sms', 1000) $$,
  '42501', null, 'nor turn extras on directly'
);
select throws_ok($$ select * from public.credit_extra_blocks $$, '42501', null, 'nor read the blocks bought');

reset role;
set local role service_role;

select throws_ok(
  $$ insert into public.usage_extras (organization_id, kind, ceiling_cents) values ('11111111-0000-4000-8000-000000000091', 'sms', 50) $$,
  '23514', null, 'a ceiling is at least 1 €'
);
select throws_ok(
  $$ insert into public.usage_extras (organization_id, kind, ceiling_cents) values ('11111111-0000-4000-8000-000000000091', 'sms', 50100) $$,
  '23514', null, 'and at most 500 €'
);
select throws_ok(
  $$ insert into public.usage_extras (organization_id, kind, ceiling_cents) values ('11111111-0000-4000-8000-000000000091', 'sms', 1050) $$,
  '23514', null, 'in whole euro'
);

insert into public.credit_entries (organization_id, kind, credits, gift_credits, key)
values ('11111111-0000-4000-8000-000000000091', 'gift', 50, 50, 'gift:extras');

select results_eq(
  $$ select charged, refused, balance, gift_left, extra_blocks from pg_temp.charge(140, 'a', true) $$,
  $$ values (140, false, 0, 10, 0) $$,
  'with extras off the month''s credits go first, then the welcome credits'
);

select results_eq(
  $$ select refused, extra_blocks from pg_temp.charge(20, 'b', true) $$,
  $$ values (true, 0) $$,
  'and a charge they cannot cover is refused while the owner has not turned extras on'
);

insert into public.usage_extras (organization_id, kind, ceiling_cents)
values ('11111111-0000-4000-8000-000000000091', 'credits', 1000);

select results_eq(
  $$ select refused from pg_temp.charge(20, 'c', true, null) $$,
  $$ values (true) $$,
  'a subscription not in good standing buys no block, whatever the ceiling'
);

select results_eq(
  $$ select charged, refused, balance, gift_left, extra_blocks from pg_temp.charge(20, 'd', true) $$,
  $$ values (20, false, 90, 0, 1) $$,
  'past the welcome credits one block of 100 is bought, the remaining welcome credits used first'
);

select results_eq(
  $$ select charged, balance, extra_blocks from pg_temp.charge(90, 'e', true) $$,
  $$ values (90, 0, 0) $$,
  'what a block leaves is used before another is bought'
);

select results_eq(
  $$ select charged, balance, extra_blocks from pg_temp.charge(250, 'f', true) $$,
  $$ values (250, 50, 3) $$,
  'a charge buys the blocks it needs at once'
);

select results_eq(
  $$ select refused, balance, extra_blocks from pg_temp.charge(251, 'g', true) $$,
  $$ values (true, 50, 0) $$,
  'a charge the ceiling cannot cover is refused, counting the blocks it can still buy'
);

select results_eq(
  $$ select refused, balance, extra_blocks from pg_temp.charge(250, 'h', true) $$,
  $$ values (false, 0, 2) $$,
  'and one it can is not'
);

select is(pg_temp.blocks(), 6, 'six blocks, the ceiling''s floor of 10 € ÷ 1,50 €');

select results_eq(
  $$ select charged, refused, balance, extra_blocks from pg_temp.charge(5, 'i', false) $$,
  $$ values (5, false, -5, 0) $$,
  'past the ceiling a charge that is never refused goes below zero, as before extras'
);

select results_eq(
  $$ select charged, extra_blocks from pg_temp.charge(5, 'i', false) $$,
  $$ values (5, 0) $$,
  'a key charged before buys nothing again'
);

update public.usage_extras set ceiling_cents = 2000
where organization_id = '11111111-0000-4000-8000-000000000091' and kind = 'credits';

select results_eq(
  $$ select charged, balance, extra_blocks from pg_temp.charge(10, 'j', true) $$,
  $$ values (10, 85, 1) $$,
  'a raised ceiling buys again at once, the block first filling what went below zero'
);

update public.usage_extras set ceiling_cents = 100
where organization_id = '11111111-0000-4000-8000-000000000091' and kind = 'credits';

select results_eq(
  $$ select refused, extra_blocks from pg_temp.charge(86, 'k', true) $$,
  $$ values (true, 0) $$,
  'a lowered ceiling buys nothing more, and what was bought stays'
);

select is(pg_temp.blocks(), 7, 'the blocks already bought stay owed');

select results_eq(
  $$ select granted, used, extra, balance from public.credit_balance(
       '11111111-0000-4000-8000-000000000091', pg_temp.month_start(), pg_temp.month_start(1), 100,
       pg_temp.month_start(-1), pg_temp.month_start(), 100) $$,
  $$ values (0, 715, 700, 85) $$,
  'the month counts the blocks apart from the credits added by hand'
);

select results_eq(
  $$ select shortfall, balance, extra from public.credit_balance(
       '11111111-0000-4000-8000-000000000091', pg_temp.month_start(1), pg_temp.month_start(2), 100,
       pg_temp.month_start(), pg_temp.month_start(1), 100) $$,
  $$ values (0, 100, 0) $$,
  'what a block left unused ends with the month, and next month starts with no blocks'
);

select results_eq(
  $$ select refused, extra_blocks from pg_temp.charge(1, 'l', true, 150, 1) $$,
  $$ values (false, 0) $$,
  'a 1 € ceiling buys no block of 1,50 €, and next month''s credits come first again'
);

delete from public.usage_extras where organization_id = '11111111-0000-4000-8000-000000000091';

select results_eq(
  $$ select refused from pg_temp.charge(101, 'm', true, 150, 1) $$,
  $$ values (true) $$,
  'turned off, extras buy nothing'
);

select throws_ok(
  $$ insert into public.credit_extra_blocks (organization_id, period_start, period_end, number)
     select organization_id, period_start, period_end, number from public.credit_extra_blocks limit 1 $$,
  '23505', null, 'a month''s block is bought once'
);

select * from finish();
rollback;
