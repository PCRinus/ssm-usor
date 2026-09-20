begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('dddddddd-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lead of A', '14399840', 'lead');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select legal_name from public.clients order by legal_name $$,
  $$ values ('Client of A') $$,
  'a specialist sees the clients and not the leads'
);

select throws_ok(
  $$ insert into public.clients (organization_id, legal_name, cui, stage)
     values ('11111111-0000-4000-8000-000000000001', 'Another lead', '18547290', 'lead') $$,
  '42501',
  null,
  'a specialist cannot create a lead'
);

select is_empty(
  $$ update public.clients set stage = 'client' where id = 'cccccccc-0000-4000-8000-000000000002' returning id $$,
  'a specialist promotes nothing: the lead is not there for them'
);

select throws_ok(
  $$ insert into public.client_owner_notes (client_id, organization_id, body)
     values ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'x') $$,
  '42501',
  null,
  'a specialist writes no owner notes'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select is_empty(
  $$ select id from public.clients $$,
  'an owner of another organization sees neither'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select legal_name from public.clients order by legal_name $$,
  $$ values ('Client of A'), ('Lead of A') $$,
  'an owner sees both'
);

select throws_ok(
  $$ insert into public.job_positions (organization_id, client_id, name, staff_category)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'Barista', 'execution') $$,
  'CLL01',
  null,
  'no job position starts under a lead'
);

select throws_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name, county_code, locality, address_line)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'Sediu', 'B', 'București', 'Calea Victoriei 1') $$,
  'CLL01',
  null,
  'no workplace starts under a lead'
);

select lives_ok(
  $$ insert into public.client_owner_notes (client_id, organization_id, body)
     values ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Sunat 12.09, revine.') $$,
  'an owner keeps notes about a lead'
);

select is_empty(
  $$ with written as (
       update public.clients set promoted_at = now(), promoted_by = 'aaaaaaaa-0000-4000-8000-000000000001'
       where id = 'cccccccc-0000-4000-8000-000000000002' returning promoted_at
     )
     select 1 from written where promoted_at is not null $$,
  'a promotion is not written by hand'
);

select lives_ok(
  $$ update public.clients set stage = 'client' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'an owner promotes a lead'
);

select results_eq(
  $$ select promoted_by, promoted_at is not null from public.clients where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, true) $$,
  'promotion records who and when'
);

select lives_ok(
  $$ update public.clients set promoted_by = null, promoted_at = null, legal_name = 'Former lead of A'
     where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'a later edit goes through'
);

select results_eq(
  $$ select promoted_by from public.clients where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'and leaves the record of the promotion as it was'
);

select throws_ok(
  $$ update public.clients set stage = 'lead' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'CLL02',
  null,
  'a client does not go back to being a lead'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select legal_name from public.clients order by legal_name $$,
  $$ values ('Client of A'), ('Former lead of A') $$,
  'the team sees the company once it is a client'
);

select is_empty(
  $$ select client_id from public.client_owner_notes $$,
  'and still not the notes of the owners'
);

select * from finish();
rollback;
