begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa', '1590082');

insert into public.client_workplaces (id, organization_id, client_id, name, is_registered_office) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu', true),
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Depozit', false),
  ('a0a0a0a0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Șantier', false);

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Operator');

insert into public.employees (organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title, hired_at, status, terminated_at, archived_at) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'Unu', 'Ion', 'Operator', '2024-01-01', 'active', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'Doi', 'Ion', 'Operator', '2024-01-01', 'active', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'Plecat', 'Ion', 'Operator', '2024-01-01', 'terminated', '2025-06-30', null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'Arhivat', 'Ion', 'Operator', '2024-01-01', 'active', null, now()),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000002', 'Trei', 'Ion', 'Operator', '2024-01-01', 'active', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', null, 'Patru', 'Ion', 'Operator', '2024-01-01', 'active', null, null);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select set_eq(
  $$ select name, current_employee_count from public.client_workplace_list $$,
  $$ values ('Sediu'::text, 2), ('Depozit', 1), ('Șantier', 0) $$,
  'a workplace counts its active, unarchived employees, and one without any reads 0'
);

select is_empty(
  $$ select w.name
     from public.client_workplace_list w
     where w.current_employee_count <> (
       select count(*) from public.employee_list e
       where e.client_id = w.client_id and e.archived_at is null and e.status <> 'terminated'
         and e.workplace_id = w.id
     ) $$,
  'each count is the total of the current workers list filtered by its workplace'
);

select is(
  (select count(*)::integer from public.employee_list
   where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'
     and archived_at is null and status <> 'terminated' and workplace_id is null),
  1,
  'the current workers list filtered to no workplace holds the one unassigned employee'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is((select count(*)::integer from public.client_workplace_list), 0, 'another organization sees none of the workplaces');

select * from finish();
rollback;
