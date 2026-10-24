begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.user_guides (user_id, guide, version, status) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'welcome', 1, 'completed');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select throws_ok(
  $$ insert into public.user_guides (user_id, guide, version, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Turul aplicației', 1, 'completed') $$,
  '23514',
  null,
  'a guide id is a lowercase slug'
);

select throws_ok(
  $$ insert into public.user_guides (user_id, guide, version, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'welcome', 1, 'started') $$,
  '23514',
  null,
  'a guide is only completed or skipped'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is((select count(*) from public.user_guides), 0::bigint, 'a user does not see another user''s guides');

select is(
  (select row(g.guide, g.version, g.status) from public.record_user_guide('welcome', 1, 'skipped') g),
  row('welcome'::text, 1, 'skipped'::text),
  'recording a guide stores it for the caller'
);

select is(
  (select user_id from public.user_guides where guide = 'welcome'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'the row belongs to the caller'
);

select is(
  (select row(g.version, g.status) from public.record_user_guide('welcome', 2, 'completed') g),
  row(2, 'completed'::text),
  'recording it again replaces the version and the status'
);

select is((select count(*) from public.user_guides), 1::bigint, 'one row per user and guide');

select throws_ok(
  $$ select public.record_user_guide('welcome', 0, 'completed') $$,
  '23514',
  null,
  'a version starts at one'
);

select throws_ok(
  $$ insert into public.user_guides (user_id, guide, version, status) values ('bbbbbbbb-0000-4000-8000-000000000002', 'clients', 1, 'completed') $$,
  '42501',
  null,
  'a user cannot record a guide for someone else'
);

update public.user_guides set status = 'skipped' where user_id = 'bbbbbbbb-0000-4000-8000-000000000002';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select status from public.user_guides where guide = 'welcome'),
  'completed',
  'a user cannot change someone else''s guide'
);

select throws_ok(
  $$ update public.user_guides set user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a user cannot hand a guide row to someone else'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.user_guides $$,
  '42501',
  null,
  'anonymous callers cannot read guides'
);

reset role;

delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.user_guides where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0::bigint,
  'deleting the account deletes its guides'
);

select * from finish();
rollback;
