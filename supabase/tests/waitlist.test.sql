-- pgTAP checks that the waitlist is closed to every signed-in or anonymous caller.
-- Run with: pnpm supabase:test (supabase test db)
begin;
select plan(6);

insert into public.waitlist_subscribers (email, confirmation_token_hash, consent_version)
values ('ana@example.ro', repeat('a', 64), '2026-09');

select throws_ok(
  $$ insert into public.waitlist_subscribers (email, confirmation_token_hash, consent_version)
     values ('Ana@Example.ro', repeat('b', 64), '2026-09') $$,
  '23514',
  null,
  'an email must be stored normalized'
);

select throws_ok(
  $$ insert into public.waitlist_subscribers (email, confirmation_token_hash, consent_version)
     values ('ana@example.ro', repeat('c', 64), '2026-09') $$,
  '23505',
  null,
  'an email can subscribe only once'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.waitlist_subscribers $$,
  '42501',
  null,
  'anonymous callers cannot read the waitlist'
);

select throws_ok(
  $$ insert into public.waitlist_subscribers (email, confirmation_token_hash, consent_version)
     values ('anon@example.ro', repeat('d', 64), '2026-09') $$,
  '42501',
  null,
  'anonymous callers cannot subscribe directly'
);

set local role authenticated;

select throws_ok(
  $$ select count(*) from public.waitlist_subscribers $$,
  '42501',
  null,
  'signed-in users cannot read the waitlist'
);

reset role;
set local role service_role;

select is(
  (select count(*) from public.waitlist_subscribers),
  1::bigint,
  'the service role reads the waitlist'
);

select * from finish();
rollback;
