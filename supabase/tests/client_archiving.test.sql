begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select lives_ok(
  $$ update public.clients set legal_name = 'Client of A SRL' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'a specialist corrects a client'
);

select throws_ok(
  $$ update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a specialist cannot archive a client'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'an owner archives a client'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select throws_ok(
  $$ update public.clients set archived_at = null where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a specialist cannot restore a client'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.clients set archived_at = null where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'an owner restores a client'
);

select * from finish();
rollback;
