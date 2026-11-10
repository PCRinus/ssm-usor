begin;
select plan(4);

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
       "employees": [{"key": "p1", "job_position_id": "dddddddd-0000-4000-8000-000000000001",
         "workplace_id": "eeeeeeee-0000-4000-8000-000000000001", "last_name": "Marin",
         "first_name": "Ioan", "job_title": "Tâmplar", "hired_at": "2025-01-06", "status": "active"}]
     }') $$,
  '22023',
  'No activity takes place at the registered office eeeeeeee-0000-4000-8000-000000000001.',
  'a new employee is not placed at a registered office where no activity takes place'
);

select throws_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, '{
       "employees": [{"key": "p1", "id": "ee000000-0000-4000-8000-000000000002", "replace": ["workplace_id"],
         "workplace_id": "eeeeeeee-0000-4000-8000-000000000001"}]
     }') $$,
  '22023',
  'No activity takes place at the registered office eeeeeeee-0000-4000-8000-000000000001.',
  'nor is an employee moved there'
);

select lives_ok(
  $$ select public.apply_employee_import('10000000-0000-4000-8000-000000000001', 0, '{
       "employees": [
         {"key": "p1", "id": "ee000000-0000-4000-8000-000000000001",
           "workplace_id": "eeeeeeee-0000-4000-8000-000000000001", "home_address": "Str. Morii 3, Arad"},
         {"key": "p2", "job_position_id": "dddddddd-0000-4000-8000-000000000001",
           "workplace_id": "eeeeeeee-0000-4000-8000-000000000002", "last_name": "Marin",
           "first_name": "Ioan", "job_title": "Tâmplar", "hired_at": "2025-01-06", "status": "active"}
       ]
     }') $$,
  'an employee already there keeps it, and a new one goes to the point of work'
);

select results_eq(
  $$ select last_name, workplace_id from public.employees order by last_name $$,
  $$ values ('Ilie', 'eeeeeeee-0000-4000-8000-000000000002'::uuid),
            ('Marin', 'eeeeeeee-0000-4000-8000-000000000002'::uuid),
            ('Pop', 'eeeeeeee-0000-4000-8000-000000000001'::uuid) $$,
  'as written'
);

select * from finish();
rollback;
