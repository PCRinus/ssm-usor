begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nobody@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.legal_acts (id, name, portal_id, portal_status, last_consolidated_on) values
  ('lege-319-2006', 'Legea 319/2006', 73772, 'in_force', '2021-07-25'),
  ('omai-163-2007', 'OMAI 163/2007', null, null, null);

insert into public.legal_changes (id, act_id, consolidated_on, amending_act) values
  ('d1d1d1d1-0000-4000-8000-000000000001', 'lege-319-2006', '2021-07-25', 'LEGE 208 21/07/2021');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select throws_ok(
  $$ insert into public.legal_changes (act_id, consolidated_on) values ('lege-319-2006', '2021-07-25') $$,
  '23505',
  null,
  'a consolidated form of an act is one change, however often it is seen'
);

select throws_ok(
  $$ insert into public.legal_changes (act_id, consolidated_on, resolution) values ('lege-319-2006', '2022-01-01', 'ignored') $$,
  '23514',
  null,
  'a change is open, without impact, or answered by a template version'
);

select throws_ok(
  $$ insert into public.legal_changes (act_id, consolidated_on, resolution) values ('lege-319-2006', '2022-01-01', 'no_impact') $$,
  '23514',
  null,
  'a resolved change has the time it was resolved'
);

select throws_ok(
  $$ update public.legal_acts set portal_status = 'abrogat' where id = 'lege-319-2006' $$,
  '23514',
  null,
  'the portal status is in force or repealed'
);

select fk_ok(
  'public', 'document_template_versions', 'resolves_legal_change_id',
  'public', 'legal_changes', 'id',
  'a template version can name the change it answers'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is((select count(*) from public.legal_acts), 2::bigint, 'a member reads every watched act');
select is((select count(*) from public.legal_changes), 1::bigint, 'a member reads the legal changes');

select throws_ok(
  $$ insert into public.legal_acts (id, name) values ('lege-1-2000', 'Legea 1/2000') $$,
  '42501',
  null,
  'a member cannot add a watched act'
);

select throws_ok(
  $$ update public.legal_acts set verified_consolidated_on = '2021-07-25' where id = 'lege-319-2006' $$,
  '42501',
  null,
  'a member cannot change a watched act'
);

select throws_ok(
  $$ update public.legal_changes set resolution = 'no_impact', resolved_at = now() $$,
  '42501',
  null,
  'a member cannot resolve a change'
);

select throws_ok(
  $$ delete from public.legal_changes $$,
  '42501',
  null,
  'a member cannot delete a change'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is((select count(*) from public.legal_changes), 1::bigint, 'a member of another organization reads the same changes');

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000003');

select is((select count(*) from public.legal_acts), 0::bigint, 'an account without an organization reads no act');
select is((select count(*) from public.legal_changes), 0::bigint, 'an account without an organization reads no change');

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.legal_acts $$,
  '42501',
  null,
  'anonymous callers cannot read the watched acts'
);

reset role;
set local role service_role;

select lives_ok(
  $$ update public.legal_changes set resolution = 'no_impact', resolved_at = now(), resolved_by_note = 'Nicio citare atinsă.'
     where id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  'the secret key resolves a change'
);

select * from finish();
rollback;
