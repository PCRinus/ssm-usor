begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Outdated module', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Current module', '14399840'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Module removed', '22'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Module added', '33'),
  ('c1c1c1c1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'Fire module', '44');

insert into public.instruction_modules (id, organization_id, title, module_group, domain) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Lucrul la înălțime', 'work_activity', 'ssm'),
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Scări metalice', 'work_equipment', 'ssm'),
  ('a0a0a0a0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Lucrul cu foc deschis', 'work_activity', 'psi');

insert into public.instruction_module_versions (id, organization_id, module_id, number, docx_path, sha256, size_bytes, article_count, created_at) values
  ('b0b0b0b0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1, '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/1.docx', repeat('a', 64), 10, 12, '2026-09-26T10:00:00+00:00'),
  ('b0b0b0b0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 2, '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000001/2.docx', repeat('b', 64), 10, 13, '2026-10-12T09:30:00+00:00'),
  ('b0b0b0b0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000002', 1, '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000002/1.docx', repeat('c', 64), 10, 8, '2026-09-26T10:00:00+00:00'),
  ('b0b0b0b0-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000003', 1, '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000003/1.docx', repeat('d', 64), 10, 7, '2026-09-26T10:00:00+00:00'),
  ('b0b0b0b0-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000003', 2, '11111111-0000-4000-8000-000000000001/a0a0a0a0-0000-4000-8000-000000000003/2.docx', repeat('e', 64), 10, 7, '2026-10-13T08:00:00+00:00');

insert into public.job_positions (id, organization_id, client_id, name, archived_at) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Zidar', null),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Zidar', null),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Zidar', null),
  ('f1f1f1f1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'Zidar', null),
  ('f1f1f1f1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'Fost zidar', now()),
  ('f1f1f1f1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'Sudor', null);

insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'ssm'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000002', 'a0a0a0a0-0000-4000-8000-000000000001', 'ssm'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'f1f1f1f1-0000-4000-8000-000000000004', 'a0a0a0a0-0000-4000-8000-000000000001', 'ssm'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'f1f1f1f1-0000-4000-8000-000000000004', 'a0a0a0a0-0000-4000-8000-000000000002', 'ssm'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'f1f1f1f1-0000-4000-8000-000000000005', 'a0a0a0a0-0000-4000-8000-000000000003', 'psi'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'f1f1f1f1-0000-4000-8000-000000000006', 'a0a0a0a0-0000-4000-8000-000000000003', 'psi');

-- Layout versions, so that nothing here is behind its template unless the test says so.
select from public.register_built_in_template_version('training_themes', 'Tematica', 'built-in/training_themes/t.docx', repeat('1', 64), 'layout', null);
select from public.register_built_in_template_version('own_instructions', 'Instrucțiuni proprii', 'built-in/own_instructions/t.docx', repeat('2', 64), 'layout', null);
select from public.register_built_in_template_version('fire_training_themes', 'Tematica PSI', 'built-in/fire_training_themes/t.docx', repeat('3', 64), 'layout', null);

create or replace function pg_temp.version_id(p_sha text)
returns uuid language sql as $$
  select id from public.document_template_versions where sha256 = repeat(p_sha, 64);
$$;

create or replace function pg_temp.themes_snapshot(p_key text, p_version_ids text[])
returns jsonb language sql as $$
  select jsonb_build_object(p_key, jsonb_build_object(
    'ownInstructionsRevision', jsonb_build_object('id', 'd0d0d0d0-0000-4000-8000-000000000001', 'number', 1, 'versionIds', to_jsonb(p_version_ids)),
    'positions', '[]'::jsonb
  ));
$$;

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'training_themes', 'Tematica', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'training_themes', 'Tematica', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'training_themes', 'Tematica', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'training_themes', 'Tematica', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'own_instructions', 'Instrucțiuni proprii', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'fire_training_themes', 'Tematica PSI', 'fire_safety_set');

insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, docx_path, issued_at, docx_sha256, data_snapshot) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/1/1/1.docx', now(), repeat('a', 64),
    pg_temp.themes_snapshot('themes', array['b0b0b0b0-0000-4000-8000-000000000001'])),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/2/2/1.docx', now(), repeat('b', 64),
    pg_temp.themes_snapshot('themes', array['b0b0b0b0-0000-4000-8000-000000000002'])),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/3/3/1.docx', now(), repeat('c', 64),
    pg_temp.themes_snapshot('themes', array['b0b0b0b0-0000-4000-8000-000000000002'])),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/4/4/1.docx', now(), repeat('d', 64),
    pg_temp.themes_snapshot('themes', array['b0b0b0b0-0000-4000-8000-000000000002'])),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000005', 1, 'issued', pg_temp.version_id('2'), '11111111-0000-4000-8000-000000000001/5/5/1.docx', now(), repeat('e', 64),
    jsonb_build_object('annexes', jsonb_build_array(jsonb_build_object('number', 1, 'title', 'Lucrul la înălțime', 'versionId', 'b0b0b0b0-0000-4000-8000-000000000001', 'versionDate', '26.09.2026')))),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000006', 1, 'issued', pg_temp.version_id('3'), '11111111-0000-4000-8000-000000000001/6/6/1.docx', now(), repeat('f', 64),
    pg_temp.themes_snapshot('fireThemes', array['b0b0b0b0-0000-4000-8000-000000000004']));

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_name, type_key, behind_template, instruction_changes::text
     from public.documents_behind
     where type_key in ('training_themes', 'own_instructions', 'fire_training_themes')
     order by client_name, type_key $$,
  $$ values
    ('Fire module', 'fire_training_themes', false, '[{"code": "module_version", "title": "Lucrul cu foc deschis", "newestVersionAt": "2026-10-13T08:00:00+00:00"}]'),
    ('Module added', 'training_themes', false, '[{"code": "module_added", "title": "Scări metalice", "newestVersionAt": null}]'),
    ('Module removed', 'training_themes', false, '[{"code": "module_removed", "title": "Lucrul la înălțime", "newestVersionAt": null}]'),
    ('Outdated module', 'own_instructions', false, '[{"code": "module_version", "title": "Lucrul la înălțime", "newestVersionAt": "2026-10-12T09:30:00+00:00"}]'),
    ('Outdated module', 'training_themes', false, '[{"code": "module_version", "title": "Lucrul la înălțime", "newestVersionAt": "2026-10-12T09:30:00+00:00"}]') $$,
  'an issued document citing modules is behind when the library has a newer version of one, a current position applies one it does not cite, or none applies one it cites; the themes of either set and the own instructions alike'
);

select is(
  (select count(*)::int from public.documents_behind where client_id = 'c1c1c1c1-0000-4000-8000-000000000002'),
  0,
  'a document citing the current versions of the modules the positions apply is not behind'
);

select is(
  (select count(*)::int from public.documents_behind where client_id = 'c1c1c1c1-0000-4000-8000-000000000004' and instruction_changes::text like '%foc deschis%'),
  0,
  'an archived position''s modules, and modules of the other domain, do not count'
);

select results_eq(
  $$ select template_title, newest_version is not null, revision_version from public.documents_behind where document_id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  $$ values ('Tematica', true, (select version from public.document_template_versions where id = pg_temp.version_id('1'))) $$,
  'a row behind on its instructions still names its template and the version it came from'
);

set local role postgres;
select from public.register_built_in_template_version('own_instructions', 'Instrucțiuni proprii', 'built-in/own_instructions/u.docx', repeat('4', 64), 'legal', 'Art. 3 în forma în vigoare.');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select behind_template, jsonb_array_length(instruction_changes) from public.documents_behind where document_id = 'd1d1d1d1-0000-4000-8000-000000000005' $$,
  $$ values (true, 1) $$,
  'a document can be behind its template and its instructions at once'
);

select is(
  (select behind_template from public.documents_behind where document_id = 'd1d1d1d1-0000-4000-8000-000000000001'),
  false,
  'behind_template is false for a document behind its instructions alone'
);

set local role postgres;
insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'f1f1f1f1-0000-4000-8000-000000000003', 'a0a0a0a0-0000-4000-8000-000000000001', 'ssm');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.documents_behind where client_id = 'c1c1c1c1-0000-4000-8000-000000000003'),
  0,
  'applying the cited module again takes the document out of the list'
);

set local role postgres;
insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, docx_path, data_snapshot) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2, 'draft', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/1/1/2.docx',
    pg_temp.themes_snapshot('themes', array['b0b0b0b0-0000-4000-8000-000000000002'])),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 2, 'draft', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/2/2/2.docx',
    '{"themes": {"positions": []}}'::jsonb);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.documents_behind where document_id = 'd1d1d1d1-0000-4000-8000-000000000001'),
  0,
  'a new draft built from the newest versions takes the document out of the list'
);

select results_eq(
  $$ select instruction_changes::text from public.documents_behind where document_id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  $$ values ('[{"code": "module_added", "title": "Lucrul la înălțime", "newestVersionAt": null}]') $$,
  'a snapshot without cited versions counts every applied module as added'
);

select * from finish();
rollback;
