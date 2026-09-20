begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Archived later', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Stays active', '5022670');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Nobody here'),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor');

insert into public.employees (id, organization_id, client_id, last_name, first_name, job_title, hired_at, job_position_id) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'f1f1f1f1-0000-4000-8000-000000000001'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'f1f1f1f1-0000-4000-8000-000000000003');

insert into public.client_workplaces (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu');

insert into public.client_documents (id, organization_id, client_id, type_key, title, decision_number) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Decizia nr. 1', 1);

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path) values
  ('e9e9e9e9-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select ok(
  public.is_draft_document_path('11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx'),
  'a draft''s file can be written while the client is active'
);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000001';

select throws_ok(
  $$ update public.employees set status = 'terminated', terminated_at = '2026-01-01' where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'a leaver of an archived client is not recorded'
);
select throws_ok(
  $$ update public.job_positions set name = 'Sudor autorizat' where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'a job position of an archived client is not edited'
);
select throws_ok(
  $$ delete from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'CLA01', null, 'nor deleted'
);
select throws_ok(
  $$ update public.client_workplaces set name = 'Sediu nou' where id = 'b1b1b1b1-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'a workplace of an archived client is not edited'
);
select throws_ok(
  $$ update public.document_revisions set edited_at = now() where id = 'e9e9e9e9-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'a draft of an archived client is not saved'
);
select throws_ok(
  $$ delete from public.document_revisions where id = 'e9e9e9e9-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'nor deleted'
);
select throws_ok(
  $$ select public.issue_document_revision('e9e9e9e9-0000-4000-8000-000000000001', repeat('a', 64)) $$,
  'CLA01', null, 'nor issued, although issuing runs past the policies'
);
select ok(
  not public.is_draft_document_path('11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx'),
  'and its file is no longer writable'
);
select throws_ok(
  $$ update public.clients set legal_name = 'Renamed' where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'CLA01', null, 'the archived client itself is not edited'
);
select lives_ok(
  $$ update public.employees set phone = '0700000000' where id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'an active client of the same organization is untouched'
);

select lives_ok(
  $$ update public.clients set archived_at = null where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  'restoring is the one change an archived client takes'
);
select lives_ok(
  $$ update public.employees set status = 'terminated', terminated_at = '2026-01-01' where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'and then the leaver is recorded'
);

select * from finish();
rollback;
