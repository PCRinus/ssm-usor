begin;
select plan(22);

-- Fixtures: two organizations with one member and one client each, positions in each.
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

insert into public.clients (id, organization_id, legal_name, cui, archived_at) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', null),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', now()),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null);

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Frozen'),
  ('f2f2f2f2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Zidar');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select is(
  (select needs_instructions from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  null,
  'a new position is undecided about instructions'
);

-- Owner A -------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select lives_ok(
  $$ insert into public.instruction_modules (id, organization_id, title, module_group, created_by)
     values ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Sudură oxiacetilenică', 'work_equipment', 'aaaaaaaa-0000-4000-8000-000000000001'),
            ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Birouri', 'work_activity', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member adds modules to the library'
);

select throws_ok(
  $$ insert into public.instruction_modules (organization_id, title, module_group)
     values ('11111111-0000-4000-8000-000000000001', '  birouri ', 'work_activity') $$,
  '23505',
  null,
  'a title is unique within the organization, ignoring case and spaces'
);

select lives_ok(
  $$ insert into public.instruction_module_versions (id, organization_id, module_id, number, docx_path, sha256, size_bytes, article_count, created_by)
     values ('b0b0b0b0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
             '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/1.docx',
             repeat('a', 64), 1234, 12, 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a version names its file under the organization and the module'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, docx_path, sha256, size_bytes)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
             '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/1.docx', repeat('b', 64), 10) $$,
  '23505',
  null,
  'a module has one file per version number'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, docx_path, sha256, size_bytes)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 2,
             'elsewhere/2.docx', repeat('b', 64), 10) $$,
  '23514',
  null,
  'a version cannot name a path outside its folder'
);

select ok(
  public.is_instruction_module_path('11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/1.docx'),
  'the storage policy accepts the path a version of the organization names'
);

select ok(
  not public.is_instruction_module_path('11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/2.docx'),
  'and refuses a path no version names'
);

select lives_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, created_by)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member applies a module to a position of their active client'
);

select is(
  (select needs_instructions from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  true,
  'the first module applied decides that the position needs instructions'
);

select throws_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001') $$,
  '23505',
  null,
  'a module is applied once per position'
);

select throws_ok(
  $$ update public.job_positions set needs_instructions = false where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'INS01',
  null,
  '"needs none" is refused while modules are applied'
);

select throws_ok(
  $$ update public.job_positions set needs_instructions = true where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'INS02',
  null,
  '"needs instructions" without any is refused'
);

select lives_ok(
  $$ update public.job_positions set needs_instructions = false where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'a position without modules can be decided as needing none'
);

select throws_ok(
  $$ update public.instruction_modules set archived_at = now() where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  'INS04',
  null,
  'archiving is refused while a position applies the module'
);

select throws_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000003', 'a0a0a0a0-0000-4000-8000-000000000001') $$,
  'CLA01',
  null,
  'nothing is applied under an archived client'
);

-- Specialist B ---------------------------------------------------------------------
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002', '{"provider":"email"}');

select is(
  (select count(*)::int from public.instruction_modules),
  0,
  'a member of another organization reads none of the modules'
);

select throws_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'f2f2f2f2-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001') $$,
  '23503',
  null,
  'nor applies them to their own positions'
);

-- Owner A again -------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

delete from public.job_position_instructions where job_position_id = 'f1f1f1f1-0000-4000-8000-000000000001';

select is(
  (select needs_instructions from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  null,
  'removing the last module leaves the position undecided again'
);

select lives_ok(
  $$ update public.instruction_modules set archived_at = now() where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  'a module nobody applies can be archived'
);

select throws_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001') $$,
  'INS03',
  null,
  'an archived module cannot be applied'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, docx_path, sha256, size_bytes)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 2,
             '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/2.docx', repeat('c', 64), 10) $$,
  'INS05',
  null,
  'an archived module takes no new file'
);

select * from finish();
rollback;
