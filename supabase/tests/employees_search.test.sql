begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Șantierul Naval SA', '1590082'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Țesătoria B SRL', '5022670');

insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, employee_number) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Țăranu', 'Ștefan', 'Sudor', '2020-03-01', 'A-17'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', null),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Ionescu', 'Maria', 'Contabil', '2021-06-15', null);

-- Organization B's employee row, to hand to the computed field as someone who cannot read its client.
create temp table b_employee as select * from public.employees where last_name = 'Ionescu';
grant select on b_employee to authenticated;

select is(
  public.unaccent_immutable('Ștefan Țăranu, ş ţ Î â ă'),
  'Stefan Taranu, s t I a a',
  'unaccent_immutable drops the Romanian diacritics, comma and cedilla forms alike'
);

select is(
  (select provolatile from pg_proc where oid = 'public.unaccent_immutable(text)'::regprocedure),
  'i',
  'the wrapper is immutable, so an index can use it'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'employees_search_name_idx'),
  'the employees have a trigram index on their searchable name'
);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select public.employee_search_name(e) from public.employees e where e.employee_number = 'A-17'),
  'taranu stefan',
  'the searchable name is the last and first name, lowercase and without diacritics'
);

select results_eq(
  $$ select last_name from public.employees e
     where public.employee_search_name(e) ilike '%stefan%' and public.employee_search_name(e) ilike '%tara%' $$,
  $$ values ('Țăranu') $$,
  'every word typed without diacritics finds the name written with them'
);

select is(
  (select public.employee_client_search_name(e) from public.employees e where e.employee_number = 'A-17'),
  'santierul naval sa',
  'the client''s searchable name is its legal name, lowercase and without diacritics'
);

select results_eq(
  $$ select last_name from public.employees e
     where public.employee_client_search_name(e) ilike '%santier%' order by last_name $$,
  $$ values ('Popescu'), ('Țăranu') $$,
  'a client''s name finds its employees'
);

select is(
  (select public.employee_client_search_name(row(b.*)::public.employees) from b_employee b),
  null,
  'the client''s name of another organization''s employee is not read'
);

select * from finish();
rollback;
