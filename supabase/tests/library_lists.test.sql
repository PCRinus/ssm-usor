begin;
select plan(8);

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
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Activ Unu', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Activ Doi', '14399840'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Arhivat', '22');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Lăcătuș'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Fost sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor');

insert into public.instruction_modules (id, organization_id, title, module_group) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Lucrul la înălțime', 'work_activity'),
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Sudură oxiacetilenică', 'work_equipment'),
  ('a0a0a0a0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Birouri', 'work_activity');

insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
select '11111111-0000-4000-8000-000000000001', id, 1, '{"blocks":[{"kind":"article","paragraphs":["Unu."]}]}', md5(id::text) || md5(title)
from public.instruction_modules where organization_id = '11111111-0000-4000-8000-000000000001';

insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000002', 'a0a0a0a0-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000003', 'a0a0a0a0-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000004', 'a0a0a0a0-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'f1f1f1f1-0000-4000-8000-000000000005', 'a0a0a0a0-0000-4000-8000-000000000002');

insert into public.evaluation_profiles (id, organization_id, name, global_risk_level, unacceptable_factor_count) values
  ('e0e0e0e0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Șofer', 3.33, 1),
  ('e0e0e0e0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Sudor', 4, 1),
  ('e0e0e0e0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Fără factori', null, 0);

insert into public.evaluation_profile_factors (id, organization_id, profile_id, component, factor_group, description, gravity_class, probability_class, sort_order) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'e0e0e0e0-0000-4000-8000-000000000001', 'work_task', 'Rutier', 'Accident de circulație', 5, 2, 0),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'e0e0e0e0-0000-4000-8000-000000000001', 'work_task', 'Efort', 'Ritm intens', 2, 4, 1),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'e0e0e0e0-0000-4000-8000-000000000002', 'work_environment', 'Termic', 'Arsuri', 5, 2, 0);

insert into public.risk_evaluations (id, organization_id, client_id, kind, job_position_id, name) values
  ('d0d0d0d0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001', null),
  ('d0d0d0d0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'sensitive_groups', null, null),
  ('d0d0d0d0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'other', null, 'Vizitatori'),
  ('d0d0d0d0-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000004', null),
  ('d0d0d0d0-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000005', null);

insert into public.risk_factors (organization_id, client_id, evaluation_id, component, factor_group, description, gravity_class, probability_class, sort_order, source_profile_factor_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000001', 'work_task', 'Rutier', 'Accident de circulație', 5, 2, 0, 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000001', 'work_task', 'Efort', 'Ritm intens', 2, 4, 1, 'e1e1e1e1-0000-4000-8000-000000000002'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000002', 'work_task', 'Rutier', 'Accident de circulație', 5, 2, 0, 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'd0d0d0d0-0000-4000-8000-000000000003', 'work_task', 'Rutier', 'Accident de circulație', 5, 2, 0, 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'd0d0d0d0-0000-4000-8000-000000000004', 'work_task', 'Rutier', 'Accident de circulație', 5, 2, 0, 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'd0d0d0d0-0000-4000-8000-000000000005', 'work_environment', 'Termic', 'Arsuri', 5, 2, 0, 'e1e1e1e1-0000-4000-8000-000000000003');

update public.job_positions set archived_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000004';
update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select set_eq(
  $$ select title, applied_count, position_count, client_count from public.instruction_module_list $$,
  $$ values ('Birouri'::text, 0, 0, 0), ('Lucrul la înălțime', 3, 3, 2), ('Sudură oxiacetilenică', 1, 0, 0) $$,
  'an instruction counts the current posts of active clients and their clients; an archived client''s still keeps it from archiving'
);

select set_eq(
  $$ select title from public.instruction_module_list where position_count = 0 $$,
  $$ values ('Birouri'::text), ('Sudură oxiacetilenică') $$,
  'an instruction applied only at an archived client reads as unused'
);

select results_eq(
  $$ select title from public.instruction_module_list where search_text like '%inaltime%' $$,
  $$ values ('Lucrul la înălțime'::text) $$,
  'the instructions search ignores diacritics and case'
);

select set_eq(
  $$ select name, sheet_count, client_count, in_use from public.evaluation_profile_list $$,
  $$ values ('Fără factori'::text, 0, 0, false), ('Sudor', 0, 0, true), ('Șofer', 3, 2, true) $$,
  'an entry counts the sheets of active clients, a post''s or outside the posts, and their clients; an archived client''s or post''s keeps it in use'
);

select results_eq(
  $$ select name, global_risk_level, unacceptable_factor_count from public.evaluation_profile_list
     order by global_risk_level desc nulls last, name $$,
  $$ values ('Sudor'::text, 4.00::numeric, 1), ('Șofer', 3.33, 1), ('Fără factori', null, 0) $$,
  'the risk library sorts by the stored level, an entry without factors last'
);

select results_eq(
  $$ select name from public.evaluation_profile_list where search_text like '%sofer%' $$,
  $$ values ('Șofer'::text) $$,
  'the risk library search ignores diacritics and case'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is((select count(*)::integer from public.instruction_module_list), 0, 'another organization sees none of the instructions');
select is((select count(*)::integer from public.evaluation_profile_list), 0, 'another organization sees none of the risk library');

select * from finish();
rollback;
