begin;
select plan(27);

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

create or replace function pg_temp.body(articles int)
returns jsonb language sql as $$
  select jsonb_build_object('blocks',
    jsonb_build_array(jsonb_build_object('kind', 'heading', 'text', 'Domeniul de aplicare'))
    || (select jsonb_agg(jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array('Articolul ' || n || '.')))
        from generate_series(1, articles) n));
$$;

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
  $$ insert into public.instruction_module_versions (id, organization_id, module_id, number, body, text_hash, created_by)
     values ('b0b0b0b0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
             pg_temp.body(12), repeat('a', 64), 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a version holds the body of the module'
);

select is(
  (select article_count from public.instruction_module_versions where id = 'b0b0b0b0-0000-4000-8000-000000000001'),
  12,
  'the database counts the articles of the body, never its headings'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1, pg_temp.body(2), repeat('b', 64)) $$,
  '23505',
  null,
  'a module has one version per number'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 2, pg_temp.body(12), repeat('b', 64)) $$,
  'INS08',
  null,
  'a version whose body is the current one''s is refused'
);

select lives_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 2,
             jsonb_set(pg_temp.body(12), '{blocks,1,paragraphs,0}', '"ARTICOLUL 1 – sănătatea."'), repeat('a', 64)) $$,
  'a version that changes only diacritics, case or symbols is stored, though it folds to the same text'
);

select lives_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000002', 1, pg_temp.body(3), repeat('a', 64)) $$,
  'another module may hold the same text'
);

select lives_ok(
  $$ select public.create_instruction_module('Scări metalice', 'work_equipment', 'ssm', pg_temp.body(4), repeat('d', 64)) $$,
  'a member creates a module with its first version in one call'
);

select is(
  (select array[v.number, v.article_count] from public.instruction_module_versions v
   join public.instruction_modules m on m.id = v.module_id
   where m.title = 'Scări metalice' and m.organization_id = '11111111-0000-4000-8000-000000000001'
     and m.created_by = 'aaaaaaaa-0000-4000-8000-000000000001' and v.created_by = m.created_by),
  array[1, 4],
  'the module is created in the member''s organization with its body as version 1'
);

select throws_ok(
  $$ select public.create_instruction_module('Lift', 'work_equipment', 'ssm', '{"blocks": []}', repeat('d', 64)) $$,
  '23514',
  null,
  'a body the database refuses is refused with the module'
);

select is(
  (select count(*)::int from public.instruction_modules where title = 'Lift'),
  0,
  'and leaves no module behind to hold the title'
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
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 3, pg_temp.body(2), repeat('c', 64)) $$,
  'INS05',
  null,
  'an archived module takes no new version'
);

select * from finish();
rollback;
