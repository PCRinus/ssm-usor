begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Tâmplăria Stejar SRL', '1590082', 'client');

insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
select '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Pas', 'Lucrător ' || n, 'Tâmplar', '2024-01-01'
from generate_series(1, 251) n;

insert into public.subscriptions (organization_id, plan, status, access_until)
values ('11111111-0000-4000-8000-000000000001', 'start', 'active', null);
update public.subscriptions set employees_over_step_since = now() - interval '1 month' - interval '2 days';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by, company_cui) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '18547290'),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '5022670');

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"client": {}}';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0, '{
       "client": {"legal_name": "Croitoria Ac SRL", "cui": "18547290"},
       "workplaces": [{"key": "workplace-1", "name": "Sediu", "is_registered_office": true}],
       "employees": [
         {"key": "employee-1", "workplace_key": "workplace-1", "last_name": "Rus", "first_name": "Ion", "job_title": "Croitor", "hired_at": "2025-01-10"},
         {"key": "employee-2", "workplace_key": "workplace-1", "last_name": "Pop", "first_name": "Ana", "job_title": "Croitor", "hired_at": "2025-01-10"}
       ]
     }') $$,
  'STP01',
  null,
  'a month past the step, a new client with employees is refused'
);

reset role;
select is((select count(*)::int from public.clients where cui = '18547290'), 0, 'and nothing of it is left behind, the client');
select is((select count(*)::int from public.employees where last_name = 'Rus'), 0, 'nor its employees');
select is(
  (select status::text from public.imports where id = '10000000-0000-4000-8000-000000000001'),
  'ready',
  'and the import stays to be confirmed'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{
       "client": {"legal_name": "Birou Unic SRL", "cui": "5022670"},
       "workplaces": [{"key": "workplace-1", "name": "Sediu", "is_registered_office": true}]
     }') $$,
  'a new client without employees goes through'
);

select * from finish();
rollback;
