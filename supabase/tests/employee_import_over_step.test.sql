begin;
select plan(2);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Tâmplăria Stejar SRL', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Tâmplar');

insert into public.client_workplaces (id, organization_id, client_id, name, is_registered_office, office_has_activity) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Sediu social', true, false),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Atelier', false, true);

insert into public.employees (id, organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title, hired_at, status) values
  ('ee000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'Pop', 'Ana', 'Contabil', '2024-03-01', 'active'),
  ('ee000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'Ilie', 'Dan', 'Tâmplar', '2023-05-02', 'active');

insert into public.employees (organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title, hired_at)
select '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'Pas', 'Lucrător ' || n, 'Tâmplar', '2024-01-01'
from generate_series(1, 249) n;

insert into public.subscriptions (organization_id, plan, status, access_until)
values ('11111111-0000-4000-8000-000000000001', 'start', 'active', null);
update public.subscriptions set employees_over_step_since = now() - interval '1 month' - interval '2 days';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'employees', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001');

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"people": []}';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, '{
       "employees": [
         {"key": "p1", "id": "ee000000-0000-4000-8000-000000000001", "home_address": "Str. Morii 3, Arad"},
         {"key": "p2", "job_position_id": "dddddddd-0000-4000-8000-000000000001",
           "workplace_id": "eeeeeeee-0000-4000-8000-000000000002", "last_name": "Marin",
           "first_name": "Ioan", "job_title": "Tâmplar", "hired_at": "2025-01-06", "status": "active"}
       ]
     }') $$,
  'STP01',
  null,
  'a month past the step, an import with a new person is refused whole'
);

select lives_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, '{
       "employees": [
         {"key": "p1", "id": "ee000000-0000-4000-8000-000000000001", "home_address": "Str. Morii 3, Arad"}
       ]
     }') $$,
  'one that only completes the people already there confirms'
);

select * from finish();
rollback;
