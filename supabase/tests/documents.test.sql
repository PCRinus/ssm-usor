-- pgTAP checks for generated documents: templates, revisions, issuing, and the storage
-- policies that follow them (ADR 005).
-- Run with: pnpm supabase:test (supabase test db)
begin;
select plan(32);

-- Fixtures: organizations A and B with one member and one client each, an archived client
-- in A, a document in each organization, and a draft revision in each.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nobody@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, archived_at) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', null),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', now()),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null);

insert into public.client_documents (id, organization_id, client_id, type_key, title, decision_number) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Decizia nr. 1', 1),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'decision_training', 'Decizia nr. 1', 1),
  -- Without a revision, so the foreign key is what refuses the cross-organization insert.
  ('d2d2d2d2-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'decision_first_aid', 'Decizia nr. 3', 3);

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'd2d2d2d2-0000-4000-8000-000000000001', 1,
   '22222222-0000-4000-8000-000000000002/c2c2c2c2-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-000000000001/1.docx');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Built-in templates --------------------------------------------------------------------------

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'decision_training', 'Decizia privind instruirea', 'built-in/decision_training/aaa.docx', repeat('a', 64)) $$,
  $$ values (1, true) $$,
  'the first file of a built-in template is version 1'
);

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'decision_training', 'Decizia privind instruirea', 'built-in/decision_training/aaa.docx', repeat('a', 64)) $$,
  $$ values (1, false) $$,
  'registering the same file again changes nothing'
);

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'decision_training', 'Decizia privind responsabilii cu instruirea', 'built-in/decision_training/bbb.docx', repeat('b', 64)) $$,
  $$ values (2, true) $$,
  'a file with a new hash becomes the next version'
);

select is(
  (select title from public.document_templates where type_key = 'decision_training' and organization_id is null),
  'Decizia privind responsabilii cu instruirea',
  'registering keeps the template title current'
);

-- Schema rules that hold regardless of the caller ------------------------------------------

select throws_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path)
     values ('11111111-0000-4000-8000-000000000001', 'd2d2d2d2-0000-4000-8000-000000000002', 1, '11111111-0000-4000-8000-000000000001/x/y/1.docx') $$,
  '23503',
  null,
  'a revision cannot reference a document of another organization'
);

select throws_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2, '22222222-0000-4000-8000-000000000002/x/y/2.docx') $$,
  '23514',
  null,
  'a revision''s file lives under its own organization'
);

select throws_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2, '11111111-0000-4000-8000-000000000001/x/y/2.docx') $$,
  '23505',
  null,
  'a document has one draft at a time'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Again') $$,
  '23505',
  null,
  'a document type appears once in a client''s set'
);

-- Specialist A ------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select results_eq(
  $$ select count(*)::int from public.document_template_versions $$,
  $$ values (2) $$,
  'a member reads the built-in template versions'
);

select throws_ok(
  $$ insert into public.document_templates (type_key, title) values ('forged', 'Forged') $$,
  '42501',
  null,
  'a member cannot write a template'
);

select results_eq(
  $$ select id from public.document_revisions $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000001'::uuid) $$,
  'a member sees only revisions of their organization'
);

select lives_ok(
  $$ insert into public.document_generations (organization_id, client_id, issue_date)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-19') $$,
  'a member generates for an active client'
);

select throws_ok(
  $$ insert into public.document_generations (organization_id, client_id, issue_date)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', '2026-09-19') $$,
  '42501',
  null,
  'an archived client gets no new documentation'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'cover_decisions', 'Sneaky') $$,
  '42501',
  null,
  'a member cannot create a document in another organization'
);

select lives_ok(
  $$ update public.document_revisions set data_snapshot = '{"client":{"legalName":"Client of A"}}', edited_at = now()
     where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'a member saves a draft'
);

select throws_ok(
  $$ update public.document_revisions set status = 'issued', issued_at = now(), docx_sha256 = repeat('c', 64)
     where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a member cannot issue by updating the row'
);

-- Storage follows the draft.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents',
     '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx') $$,
  'a member uploads the file of their draft'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents',
     '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/99.docx') $$,
  '42501',
  null,
  'a member cannot upload where no draft revision says a file lives'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents',
     '22222222-0000-4000-8000-000000000002/c2c2c2c2-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-000000000001/1.docx') $$,
  '42501',
  null,
  'a member cannot upload the file of another organization''s draft'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('document-templates', 'built-in/forged/x.docx') $$,
  '42501',
  null,
  'a member cannot write a template file'
);

-- Issuing.
select throws_ok(
  $$ select public.issue_document_revision('e2e2e2e2-0000-4000-8000-000000000001', repeat('c', 64)) $$,
  'DOC01',
  null,
  'a member cannot issue a revision of another organization'
);

select lives_ok(
  $$ select public.issue_document_revision('e1e1e1e1-0000-4000-8000-000000000001', repeat('c', 64)) $$,
  'a member issues their draft'
);

select results_eq(
  $$ select status::text, docx_sha256 = repeat('c', 64), issued_by
     from public.document_revisions where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('issued', true, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'issuing records the hash and who issued'
);

select throws_ok(
  $$ select public.issue_document_revision('e1e1e1e1-0000-4000-8000-000000000001', repeat('d', 64)) $$,
  'DOC02',
  null,
  'an issued revision cannot be issued again'
);

update public.document_revisions set data_snapshot = '{}' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
delete from public.document_revisions where id = 'e1e1e1e1-0000-4000-8000-000000000001';

select results_eq(
  $$ select data_snapshot->'client'->>'legalName' from public.document_revisions
     where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('Client of A') $$,
  'a member can neither change nor delete an issued revision'
);

-- Issuing locks the file too: the policy no longer matches it, so this touches nothing.
-- Deleting is refused the same way, but Storage forbids direct SQL deletes to everyone, so
-- that policy is exercised through the Storage API by the API's tests.
update storage.objects set metadata = '{"size": 1}' where name = '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx';

select results_eq(
  $$ select metadata is null from storage.objects where name = '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx' $$,
  $$ values (true) $$,
  'a member cannot replace the file of an issued revision'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'),
  1,
  'a member still reads the issued file'
);

-- A correction is a new revision; issuing it supersedes the earlier one.
select lives_ok(
  $$ insert into public.document_revisions (id, organization_id, document_id, revision, docx_path, created_by)
     values ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2,
       '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/2.docx',
       'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member drafts a correction of an issued document'
);

select lives_ok(
  $$ select public.issue_document_revision('e1e1e1e1-0000-4000-8000-000000000002', repeat('e', 64)) $$,
  'a member issues the correction'
);

select results_eq(
  $$ select revision, status::text, superseded_at is not null from public.document_revisions
     where document_id = 'd1d1d1d1-0000-4000-8000-000000000001' order by revision $$,
  $$ values (1, 'superseded', true), (2, 'issued', false) $$,
  'issuing a correction supersedes the earlier revision'
);

-- The secret key -------------------------------------------------------------------------------
select pg_temp.act_as_postgres();

select throws_ok(
  $$ update public.document_revisions set data_snapshot = '{}' where id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'DOC03',
  null,
  'an issued revision refuses changes even without row-level security'
);

-- An account without an organization ------------------------------------------------------------
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001', '{"provider":"email"}');

select is(
  (select count(*)::int from public.document_templates) + (select count(*)::int from public.document_revisions),
  0,
  'an account without an organization reads no templates and no revisions'
);

select * from finish();
rollback;
