begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Brutăria Demo', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Atelier Demo', '14399840', 'client');

insert into public.client_workplaces (id, organization_id, client_id, name, is_registered_office) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu social', true),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Brutărie', false),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sediu social', true);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
-- The trigger is deferred to the commit, which a test inside one transaction never reaches.
set constraints public.client_workplaces_office_needs_another immediate;

select is(
  (select office_has_activity from public.client_workplaces where id = 'd1d1d1d1-0000-4000-8000-000000000001'),
  true,
  'a workplace has activity unless a member says otherwise'
);

select throws_ok(
  $$ update public.client_workplaces set office_has_activity = false where id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  '23514',
  null,
  'a point of work cannot be answered "no"'
);

select lives_ok(
  $$ update public.client_workplaces set office_has_activity = false where id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  'a registered office beside a point of work can be answered "no"'
);

select throws_ok(
  $$ update public.client_workplaces set is_registered_office = false where id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'an office answered "no" stops being the office only with the answer back to "yes"'
);

select throws_ok(
  $$ update public.client_workplaces set office_has_activity = false where id = 'd1d1d1d1-0000-4000-8000-000000000003' $$,
  'WPL01',
  null,
  'a client whose only workplace is its registered office cannot answer "no"'
);

select throws_ok(
  $$ update public.client_workplaces set archived_at = now() where id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  'WPL01',
  null,
  'the last point of work beside an office answered "no" is not archived'
);

select throws_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name, is_registered_office, office_has_activity)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Al doilea sediu', false, false) $$,
  '23514',
  null,
  'a new point of work cannot be answered "no"'
);

select lives_ok(
  $$ insert into public.client_workplaces (organization_id, client_id, name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Depozit') $$,
  'a second point of work is added'
);

select lives_ok(
  $$ update public.client_workplaces set archived_at = now() where id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  'a point of work is archived while another stays beside the office'
);

set constraints public.client_workplaces_office_needs_another deferred;

update public.client_workplaces set office_has_activity = false
where id = 'd1d1d1d1-0000-4000-8000-000000000003';
insert into public.client_workplaces (organization_id, client_id, name)
values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Atelier');

select lives_ok(
  $$ set constraints public.client_workplaces_office_needs_another immediate $$,
  'the answer may come before the point of work it needs, in one transaction'
);

select * from finish();
rollback;
