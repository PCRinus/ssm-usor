begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now(), '2026-11-01 08:00+00'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now(), '2026-11-02 08:00+00'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now(), '2026-11-03 08:00+00');

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

-- Auth writes `refreshed_at` in UTC, without a zone.
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at) values
  ('5e550000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', now(), now(), '2026-11-10 09:30:00'),
  ('5e550000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', now(), now(), '2026-11-09 09:30:00'),
  ('5e550000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', now(), now(), null),
  ('5e550000-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000001', now(), now(), '2026-11-15 12:00:00');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'aal', 'aal1', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select user_id::text, last_active_at from public.organization_member_activity() order by user_id $$,
  $$ values
       ('aaaaaaaa-0000-4000-8000-000000000001', '2026-11-01 08:00+00'::timestamptz),
       ('aaaaaaaa-0000-4000-8000-000000000002', '2026-11-10 09:30+00'::timestamptz) $$,
  'an owner reads the later of the last sign-in and the newest session renewal, for their own members only'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select is(
  (select count(*) from public.organization_member_activity()),
  0::bigint,
  'a specialist reads no one''s activity'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select user_id::text, last_active_at from public.organization_member_activity() $$,
  $$ values ('bbbbbbbb-0000-4000-8000-000000000001', '2026-11-15 12:00+00'::timestamptz) $$,
  'another organization''s owner reads only their own members'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000009');

select is(
  (select count(*) from public.organization_member_activity()),
  0::bigint,
  'an account without a membership reads nothing'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.organization_member_activity() $$,
  '42501', null,
  'anonymous callers cannot call it'
);

select * from finish();
rollback;
