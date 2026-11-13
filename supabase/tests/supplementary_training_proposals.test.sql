begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('11111111-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Termoconstruct Vest SRL', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Zidar');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at) values
  ('ee000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'Popescu', 'Andrei', 'Zidar', '2020-01-10', 'active', null),
  ('ee000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'Marin', 'Gheorghe', 'Zidar', '2019-03-01', 'terminated', '2025-06-30');

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, source) values
  ('f0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-05-12', 'paper'),
  ('f0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'su', 'periodic', '2025-02-20', 'paper');

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'periodic', 'ee000000-0000-4000-8000-000000000001', 'Zidar'),
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'periodic', 'ee000000-0000-4000-8000-000000000002', 'Zidar');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'own_instructions', 'Instrucțiuni proprii', 'documentation_set'),
  ('d0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'fire_own_instructions', 'Instrucțiuni proprii SU', 'fire_safety_set'),
  ('d0000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'training_themes', 'Tematica', 'documentation_set');

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path) values
  ('e0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000001/1.docx'),
  ('e0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 1,
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000002/1.docx'),
  ('e0000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 1,
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/d0000000-0000-4000-8000-000000000003/1.docx');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.issue_document_revision('e0000000-0000-4000-8000-000000000001', repeat('a', 64)) $$,
  'the specialist issues the own instructions'
);

select results_eq(
  $$ select revision_id, domain::text, client_id, dismissed_at is null
     from public.supplementary_training_proposals $$,
  $$ values ('e0000000-0000-4000-8000-000000000001'::uuid, 'ssm', 'cccccccc-0000-4000-8000-000000000001'::uuid, true) $$,
  'which proposes a supplementary training, since a current worker has an occupational safety training'
);

select is(
  (select issued_at from public.supplementary_training_proposals),
  (select issued_at from public.document_revisions where id = 'e0000000-0000-4000-8000-000000000001'),
  'from the moment of the issue'
);

select lives_ok(
  $$ select public.issue_document_revision('e0000000-0000-4000-8000-000000000002', repeat('a', 64)) $$,
  'the fire-safety own instructions are issued'
);

select is_empty(
  $$ select 1 from public.supplementary_training_proposals where domain = 'su' $$,
  'with no proposal: only a worker who left has a fire-safety training'
);

select lives_ok(
  $$ select public.issue_document_revision('e0000000-0000-4000-8000-000000000003', repeat('a', 64)) $$,
  'the training themes are issued'
);

select is(
  (select count(*)::int from public.supplementary_training_proposals),
  1,
  'and no other document proposes a training'
);

select throws_ok(
  $$ insert into public.supplementary_training_proposals (revision_id, organization_id, client_id, document_id, domain, issued_at)
     values ('e0000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'd0000000-0000-4000-8000-000000000003', 'ssm', now()) $$,
  '42501',
  null,
  'a member does not propose one by hand'
);

select throws_ok(
  $$ update public.supplementary_training_proposals set domain = 'su' $$,
  '42501',
  null,
  'nor changes its domain'
);

select results_eq(
  $$ update public.supplementary_training_proposals
     set dismissed_at = now(), dismissed_by = 'bbbbbbbb-0000-4000-8000-000000000001'
     where revision_id = 'e0000000-0000-4000-8000-000000000001'
     returning dismissed_by $$,
  $$ values ('bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'the specialist closes it: no training is needed'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from public.supplementary_training_proposals $$,
  'another organization does not see it'
);

select pg_temp.act_as_postgres();
update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000001';
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ update public.supplementary_training_proposals set dismissed_at = null, dismissed_by = null $$,
  'CLA01',
  null,
  'an archived client''s proposal stays as it is'
);

select pg_temp.act_as_postgres();

select throws_ok(
  $$ update public.supplementary_training_proposals set dismissed_at = null $$,
  '23514',
  null,
  'who closed it is kept only with when'
);

delete from public.document_revisions where id = 'e0000000-0000-4000-8000-000000000001';

select is_empty(
  $$ select 1 from public.supplementary_training_proposals $$,
  'the proposal goes with its revision'
);

select * from finish();
rollback;
