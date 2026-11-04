begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Lăcătuș'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Fost sudor');

insert into public.instruction_modules (id, organization_id, title, module_group) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Sudură oxiacetilenică', 'work_equipment'),
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Birouri', 'work_activity'),
  ('a0a0a0a0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Fără text', 'work_activity');

insert into public.instruction_module_versions (id, organization_id, module_id, number, body, text_hash) values
  ('b0b0b0b0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
   '{"blocks":[{"kind":"article","paragraphs":["Unu."]}]}', repeat('a', 64)),
  ('b0b0b0b0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 2,
   '{"blocks":[{"kind":"article","paragraphs":["Unu."]},{"kind":"article","paragraphs":["Doi."]}]}', repeat('b', 64)),
  ('b0b0b0b0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000002', 1,
   '{"blocks":[{"kind":"article","paragraphs":["Unu."]}]}', repeat('c', 64));

insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000002', 'a0a0a0a0-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000003', 'a0a0a0a0-0000-4000-8000-000000000001');

update public.job_positions set archived_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select title from public.instruction_module_list order by title $$,
  $$ values ('Birouri'), ('Sudură oxiacetilenică') $$,
  'the list leaves out a module without a version'
);

select results_eq(
  $$ select version_id, version_number, version_article_count from public.instruction_module_list
     where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  $$ values ('b0b0b0b0-0000-4000-8000-000000000002'::uuid, 2, 2) $$,
  'each module comes with its newest version'
);

select results_eq(
  $$ select applied_count from public.instruction_module_list
     where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  $$ values (2) $$,
  'an archived position does not count among those applying the module'
);

select results_eq(
  $$ select applied_count from public.instruction_module_list
     where id = 'a0a0a0a0-0000-4000-8000-000000000002' $$,
  $$ values (0) $$,
  'a module no position applies counts none'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from public.instruction_module_list $$,
  'another organization sees none of the modules'
);

reset role;
set local role anon;

select throws_ok(
  $$ select 1 from public.instruction_module_list $$,
  '42501',
  null,
  'an anonymous caller cannot read the list'
);

select * from finish();
rollback;
