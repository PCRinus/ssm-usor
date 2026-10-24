begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nobody@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.profiles (user_id, full_name, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ana Popescu', '2026-10-10 09:00:00+00');

-- A seeded local database has invented releases of its own.
delete from public.releases;

insert into public.releases (tag, published_at, headline, features, body) values
  ('2026.10.01', '2026-10-01 10:00:00+00', 'Prima versiune publică', '[]', '# Prima versiune publică'),
  ('2026.10.20', '2026-10-20 10:00:00+00', 'Arhiva documentelor', '[]', '# Arhiva documentelor'),
  ('2026.10.23.2', '2026-10-23 10:00:00+00', 'Reamintiri', '[]', '# Reamintiri'),
  ('2026.10.23.10', '2026-10-23 18:00:00+00', 'Teste de verificare', '[{"title": "Teste", "text": "Pe telefon.", "where": null, "icon": "smartphone"}]', '# Teste de verificare');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.unread()
returns text[] language sql as $$
  select coalesce(array_agg(tag order by published_at), '{}') from public.release_list where unread;
$$;

select throws_ok(
  $$ insert into public.releases (tag, published_at, headline, body) values ('2026-10-24', now(), 'Titlu', '# Titlu') $$,
  '23514',
  null,
  'a tag is the release day, with a number for a later release that day'
);

select throws_ok(
  $$ insert into public.releases (tag, published_at, headline, features, body) values ('2026.10.24', now(), 'Titlu', '{}', '# Titlu') $$,
  '23514',
  null,
  'the new features are a list'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is((select count(*) from public.releases), 4::bigint, 'a signed-in user reads every release');

select is(
  pg_temp.unread(),
  array['2026.10.20', '2026.10.23.2', '2026.10.23.10'],
  'the releases published after the profile was created are unread, the one before is not'
);

select is(
  public.acknowledge_releases('2026.10.23.2'),
  '2026.10.23.2',
  'acknowledging records the release'
);

select is(
  pg_temp.unread(),
  array['2026.10.23.10'],
  'a release published later stays unread, though its tag sorts first as text'
);

select is(
  public.acknowledge_releases('2026.10.20'),
  '2026.10.23.2',
  'acknowledging an older release keeps the newer one'
);

select is(public.acknowledge_releases('2026.10.23.10'), '2026.10.23.10', 'acknowledging the newest');
select is(pg_temp.unread(), '{}'::text[], 'nothing is unread after acknowledging the newest');

select throws_ok(
  $$ select public.acknowledge_releases('2026.01.01') $$,
  'REL01',
  null,
  'a release that does not exist cannot be acknowledged'
);

select lives_ok(
  $$ update public.profiles set releases_acknowledged_through = '2026.10.20' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'a user sets the acknowledged release on their own profile'
);

select throws_ok(
  $$ update public.profiles set terms_version = 'x' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'the terms columns stay out of reach'
);

select throws_ok(
  $$ insert into public.releases (tag, published_at, headline, body) values ('2026.10.24', now(), 'Titlu', '# Titlu') $$,
  '42501',
  null,
  'a signed-in user cannot add a release'
);

select throws_ok(
  $$ update public.releases set headline = 'Altul' $$,
  '42501',
  null,
  'a signed-in user cannot change a release'
);

select throws_ok(
  $$ delete from public.releases $$,
  '42501',
  null,
  'a signed-in user cannot delete a release'
);

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000003');

select is((select count(*) from public.release_list), 4::bigint, 'an account without a profile reads the releases');
select is(pg_temp.unread(), '{}'::text[], 'an account without a profile has nothing unread');

select throws_ok(
  $$ select public.acknowledge_releases('2026.10.23.10') $$,
  'REL02',
  null,
  'an account without a profile cannot acknowledge'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.release_list $$,
  '42501',
  null,
  'anonymous callers cannot read the releases'
);

reset role;

delete from public.releases where tag = '2026.10.20';

select is(
  (select releases_acknowledged_through from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  null,
  'deleting the acknowledged release clears the profile''s pointer'
);

select * from finish();
rollback;
