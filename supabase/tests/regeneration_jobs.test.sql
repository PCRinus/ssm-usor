begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Behind', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Layout only', '14399840'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived', '22'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Uploaded', '33'),
  ('c1c1c1c1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'Edited draft', '44'),
  ('c1c1c1c1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'Issued after editing', '55'),
  ('c1c1c1c1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'Regenerated', '66'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670');

-- Made-up types, so the built-in templates a local stack has registered change nothing.
select from public.register_built_in_template_version('behind_test', 'Behind test', 'built-in/behind_test/1.docx', repeat('1', 64), 'correction', null);
select from public.register_built_in_template_version('behind_test', 'Behind test', 'built-in/behind_test/2.docx', repeat('2', 64), 'legal', 'Art. 7 în forma în vigoare.');
select from public.register_built_in_template_version('behind_test', 'Behind test', 'built-in/behind_test/3.docx', repeat('3', 64), 'layout', 'Spațiere.');
select from public.register_built_in_template_version('layout_test', 'Layout test', 'built-in/layout_test/1.docx', repeat('4', 64), 'correction', null);
select from public.register_built_in_template_version('layout_test', 'Layout test', 'built-in/layout_test/2.docx', repeat('5', 64), 'layout', 'Spațiere.');

create or replace function pg_temp.version_id(p_sha text)
returns uuid language sql as $$
  select id from public.document_template_versions where sha256 = repeat(p_sha, 64);
$$;

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000006', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000007', 'behind_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'layout_test', 'Layout', 'documentation_set'),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'behind_test', 'Test', 'documentation_set');

insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, docx_path, edited_at, issued_at, docx_sha256, superseded_at) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'draft', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/1/1/1.docx', null, null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'draft', pg_temp.version_id('2'), '11111111-0000-4000-8000-000000000001/2/2/1.docx', null, null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 1, 'draft', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/3/3/1.docx', null, null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 1, 'draft', null, '11111111-0000-4000-8000-000000000001/4/4/1.docx', now(), null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000005', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/5/5/1.docx', null, now(), repeat('a', 64), null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000005', 2, 'draft', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/5/5/2.docx', now(), null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000006', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/6/6/1.docx', now(), now(), repeat('b', 64), null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000007', 1, 'issued', pg_temp.version_id('1'), '11111111-0000-4000-8000-000000000001/7/7/1.docx', null, now(), repeat('c', 64), null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000007', 2, 'draft', pg_temp.version_id('3'), '11111111-0000-4000-8000-000000000001/7/7/2.docx', null, null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000008', 1, 'draft', pg_temp.version_id('4'), '11111111-0000-4000-8000-000000000001/8/8/1.docx', null, null, null, null),
  ('22222222-0000-4000-8000-000000000002', 'd2d2d2d2-0000-4000-8000-000000000001', 1, 'draft', pg_temp.version_id('1'), '22222222-0000-4000-8000-000000000002/1/1/1.docx', null, null, null, null);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.documents_behind'::regclass),
  'the documents behind answer to the caller''s policies'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_name, revision_version, edited_draft from public.documents_behind order by client_name $$,
  $$ values ('Behind', 1, false), ('Edited draft', 1, true), ('Issued after editing', 1, false) $$,
  'a document is behind a legal or correction version, whatever its status; a layout version, an upload, an archived client and a regenerated document are not'
);

select results_eq(
  $$ select distinct type_key, template_title, newest_version, newest_kind, newest_note from public.documents_behind $$,
  $$ values ('behind_test', 'Behind test', 3, 'layout', 'Spațiere.') $$,
  'each row names the newest version of its template, of whatever kind'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_name from public.documents_behind $$,
  $$ values ('Client of B') $$,
  'a member sees only the documents of their organization'
);

select pg_temp.act_as_postgres();
set local role service_role;

select results_eq(
  $$ select count(*)::int from public.documents_behind where type_key in ('behind_test', 'layout_test') $$,
  $$ values (4) $$,
  'the secret key sees every organization''s documents behind'
);

select results_eq(
  $$ select total_count, done_count, finished_at is null from public.start_regeneration_job(
       '11111111-0000-4000-8000-000000000001', 'behind_test', 'aaaaaaaa-0000-4000-8000-000000000001',
       array['c1c1c1c1-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005',
             'c1c1c1c1-0000-4000-8000-000000000001', 'c2c2c2c2-0000-4000-8000-000000000001']::uuid[]) $$,
  $$ values (2, 0, true) $$,
  'a job holds each client of its organization once, and no other organization''s'
);

select throws_ok(
  $$ select public.start_regeneration_job(
       '11111111-0000-4000-8000-000000000001', 'behind_test', 'aaaaaaaa-0000-4000-8000-000000000001',
       array['c1c1c1c1-0000-4000-8000-000000000006']::uuid[]) $$,
  '23505',
  null,
  'a second job of the same type waits for the first to finish'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select j.type_key, i.status, i.client_id::text from public.regeneration_jobs j
     join public.regeneration_job_items i on i.job_id = j.id order by i.client_id $$,
  $$ values ('behind_test', 'queued', 'c1c1c1c1-0000-4000-8000-000000000001'),
            ('behind_test', 'queued', 'c1c1c1c1-0000-4000-8000-000000000005') $$,
  'a member reads their organization''s jobs and items'
);

select throws_ok(
  $$ update public.regeneration_jobs set done_count = 2 $$,
  '42501',
  null,
  'a member cannot change a job'
);

select throws_ok(
  $$ update public.regeneration_job_items set status = 'done' $$,
  '42501',
  null,
  'a member cannot change an item'
);

select throws_ok(
  $$ select public.start_regeneration_job(
       '11111111-0000-4000-8000-000000000001', 'layout_test', 'aaaaaaaa-0000-4000-8000-000000000001',
       array['c1c1c1c1-0000-4000-8000-000000000001']::uuid[]) $$,
  '42501',
  null,
  'a member cannot start a job past the API'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is_empty(
  $$ select 1 from public.regeneration_jobs union all select 1 from public.regeneration_job_items $$,
  'another organization''s member reads none of it'
);

select pg_temp.act_as_postgres();
set local role service_role;

select is(
  public.record_regeneration_item(
    (select id from public.regeneration_jobs where type_key = 'behind_test'),
    'c1c1c1c1-0000-4000-8000-000000000005', 'skipped', 'Ciorna are modificări făcute de mână.'),
  true,
  'an item is recorded once'
);

select is(
  public.record_regeneration_item(
    (select id from public.regeneration_jobs where type_key = 'behind_test'),
    'c1c1c1c1-0000-4000-8000-000000000005', 'done', null),
  false,
  'a second delivery of the same client changes nothing'
);

select throws_ok(
  $$ select public.record_regeneration_item(
       (select id from public.regeneration_jobs where type_key = 'behind_test'),
       'c1c1c1c1-0000-4000-8000-000000000001', 'queued', null) $$,
  '22023',
  null,
  'an item ends done, skipped or failed'
);

select results_eq(
  $$ select done_count, skipped_count, failed_count, finished_at is null from public.regeneration_jobs where type_key = 'behind_test' $$,
  $$ values (0, 1, 0, true) $$,
  'the job counts what was recorded and runs until every client is'
);

select public.record_regeneration_item(
  (select id from public.regeneration_jobs where type_key = 'behind_test'),
  'c1c1c1c1-0000-4000-8000-000000000001', 'done', null);

select results_eq(
  $$ select done_count, skipped_count, finished_at is not null from public.regeneration_jobs where type_key = 'behind_test' $$,
  $$ values (1, 1, true) $$,
  'the last client finishes the job'
);

select lives_ok(
  $$ select public.start_regeneration_job(
       '11111111-0000-4000-8000-000000000001', 'behind_test', 'aaaaaaaa-0000-4000-8000-000000000001',
       array['c1c1c1c1-0000-4000-8000-000000000006']::uuid[]) $$,
  'a finished job lets the next one start'
);

update public.regeneration_jobs set requested_at = now() - interval '2 hours'
where type_key = 'behind_test' and finished_at is null;

select lives_ok(
  $$ select public.start_regeneration_job(
       '11111111-0000-4000-8000-000000000001', 'behind_test', 'aaaaaaaa-0000-4000-8000-000000000001',
       array['c1c1c1c1-0000-4000-8000-000000000001']::uuid[]) $$,
  'a job unfinished after an hour does not block the next one'
);

select results_eq(
  $$ select j.failed_count, j.finished_at is not null, i.status, i.detail
     from public.regeneration_jobs j join public.regeneration_job_items i on i.job_id = j.id
     where i.client_id = 'c1c1c1c1-0000-4000-8000-000000000006' $$,
  $$ values (1, true, 'failed', 'Regenerarea nu s-a încheiat într-o oră.') $$,
  'the stale job is closed, its waiting clients failed'
);

select * from finish();
rollback;
