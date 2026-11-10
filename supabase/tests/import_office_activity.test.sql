begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Tâmplăria Stejar SRL', '1590082', 'client');

insert into public.client_workplaces (id, organization_id, client_id, name, is_registered_office) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Sediu social', true),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Atelier', false);

insert into public.employees (organization_id, client_id, workplace_id, last_name, first_name, job_title, hired_at) values
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'Pop', 'Ana', 'Contabil', '2024-03-01');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by, company_cui) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '18547290'),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '5022670'),
  ('10000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001', '1590082'),
  ('10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001', '1590082');

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"client": {}}';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0, '{
       "client": {"legal_name": "Croitoria Ac SRL", "cui": "18547290"},
       "workplaces": [
         {"key": "workplace-1", "name": "Sediu", "is_registered_office": true, "office_has_activity": false},
         {"key": "workplace-2", "name": "Atelier", "combustible_materials": "textile, hârtie"}
       ]
     }') $$,
  'a new client''s registered office is written as an address where no activity takes place'
);

select results_eq(
  $$ select w.name, w.is_registered_office, w.office_has_activity, w.combustible_materials
     from public.client_workplaces w join public.clients c on c.id = w.client_id
     where c.cui = '18547290' order by w.name $$,
  $$ values ('Atelier', false, true, 'textile, hârtie'), ('Sediu', true, false, null::text) $$,
  'beside its point of work, which has activity by default'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{
       "client": {"legal_name": "Birou Unic SRL", "cui": "5022670"},
       "workplaces": [{"key": "workplace-1", "name": "Sediu", "is_registered_office": true, "office_has_activity": false}]
     }') $$,
  'WPL01',
  null,
  'never the client''s only workplace, refused inside the confirmation'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{
       "client": {"legal_name": "Birou Unic SRL", "cui": "5022670"},
       "workplaces": [
         {"key": "workplace-1", "name": "Sediu", "is_registered_office": true},
         {"key": "workplace-2", "name": "Depozit", "office_has_activity": false}
       ]
     }') $$,
  '23514',
  null,
  'only the registered office takes "no activity"'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{
       "client": {"legal_name": "Birou Unic SRL", "cui": "5022670"},
       "workplaces": [
         {"key": "workplace-1", "name": "Sediu", "is_registered_office": true, "office_has_activity": false},
         {"key": "workplace-2", "name": "Depozit"}
       ],
       "employees": [{"key": "employee-1", "workplace_key": "workplace-1", "last_name": "Rus", "first_name": "Ion", "job_title": "Gestionar", "hired_at": "2025-01-10"}]
     }') $$,
  'WPL02',
  null,
  'nor an office the import also gives an employee'
);

select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000003', 0, '{
       "client": {},
       "workplaces": [{"key": "workplace-1", "id": "dddddddd-0000-4000-8000-000000000001", "name": "Sediu social", "office_has_activity": false}]
     }') $$,
  'an existing office keeps its own answer unless replaced'
);

select is(
  (select office_has_activity from public.client_workplaces where id = 'dddddddd-0000-4000-8000-000000000001'),
  true,
  'so activity still takes place there'
);


select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000004', 0, '{
       "client": {},
       "workplaces": [{"key": "workplace-1", "id": "dddddddd-0000-4000-8000-000000000001", "office_has_activity": false, "replace": ["office_has_activity"]}]
     }') $$,
  'WPL02',
  null,
  'and replacing it is refused while current employees work there'
);

select is(
  (select office_has_activity from public.client_workplaces where id = 'dddddddd-0000-4000-8000-000000000001'),
  true,
  'leaving the office as it was'
);

select * from finish();
rollback;
