begin;
select plan(6);

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
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Draft', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Issued', '14399840'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Issued, then drafted', '22'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Issued without a generation', '33'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670');

-- Made-up types, so the built-in templates a local stack has registered change nothing.
select from public.register_built_in_template_version('state_test', 'State test', 'built-in/state_test/1.docx', repeat('1', 64), 'correction', null);
select from public.register_built_in_template_version('state_test', 'State test', 'built-in/state_test/2.docx', repeat('2', 64), 'legal', 'Art. 7 în forma în vigoare.');

create or replace function pg_temp.version_id(p_sha text)
returns uuid language sql as $$
  select id from public.document_template_versions where sha256 = repeat(p_sha, 64);
$$;

insert into public.legal_acts (id, name, portal_id, portal_status, last_consolidated_on) values
  ('state-test-act', 'Legea 1/2099', null, null, null);

insert into public.legal_changes (id, act_id, consolidated_on, amending_act) values
  ('e1e1e1e1-0000-4000-8000-000000000001', 'state-test-act', '2099-01-01', 'LEGE 2 01/01/2099');

insert into public.template_version_legal_changes (template_version_id, legal_change_id) values
  (pg_temp.version_id('2'), 'e1e1e1e1-0000-4000-8000-000000000001');

insert into public.document_generations (id, organization_id, client_id, issue_date, document_group) values
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', '2026-10-14', 'documentation_set'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', '2026-09-02', 'documentation_set'),
  ('a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', '2026-08-01', 'documentation_set');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'state_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'state_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'state_test', 'Test', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'state_test', 'Test', 'documentation_set'),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'state_test', 'Test', 'documentation_set');

insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, generation_id, docx_path, issued_at, docx_sha256) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'draft', pg_temp.version_id('1'), null, '11111111-0000-4000-8000-000000000001/1/1/1.docx', null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'issued', pg_temp.version_id('1'), 'a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001/2/2/1.docx', '2026-10-20 08:00+00', repeat('a', 64)),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 1, 'issued', pg_temp.version_id('1'), 'a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001/3/3/1.docx', '2026-09-03 08:00+00', repeat('b', 64)),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 2, 'draft', pg_temp.version_id('1'), 'a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001/3/3/2.docx', null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 1, 'issued', pg_temp.version_id('1'), null, '11111111-0000-4000-8000-000000000001/4/4/1.docx', '2026-11-18 23:30+00', repeat('c', 64)),
  ('22222222-0000-4000-8000-000000000002', 'd2d2d2d2-0000-4000-8000-000000000001', 1, 'issued', pg_temp.version_id('1'), 'a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002/1/1/1.docx', '2026-08-02 08:00+00', repeat('d', 64));

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.documents_behind'::regclass),
  'the documents behind still answer to the caller''s policies'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_name, revision_status::text, revision_issue_date from public.documents_behind
     where type_key = 'state_test' order by client_name $$,
  $$ values ('Draft', 'draft', null::date),
            ('Issued', 'issued', '2026-10-14'::date),
            ('Issued without a generation', 'issued', '2026-11-19'::date),
            ('Issued, then drafted', 'draft', '2026-09-02'::date) $$,
  'each row says whether its newest revision is a draft or issued, and the date it carries, the day it was issued in Bucharest when no generation dated it'
);

select results_eq(
  $$ select distinct newest_version_id from public.documents_behind where type_key = 'state_test' $$,
  $$ values (pg_temp.version_id('2')) $$,
  'each row names the newest version of its template by id'
);

select results_eq(
  $$ select a.name from public.documents_behind b
     join public.template_version_legal_changes l on l.template_version_id = b.newest_version_id
     join public.legal_changes c on c.id = l.legal_change_id
     join public.legal_acts a on a.id = c.act_id
     where b.document_id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  $$ values ('Legea 1/2099') $$,
  'a member reaches the legal change the newest version answers, and its act'
);

select results_eq(
  $$ select count(*)::int from public.dashboard_summary where organization_id = '11111111-0000-4000-8000-000000000001' and documents_behind = 4 $$,
  $$ values (1) $$,
  'the dashboard still counts the documents behind'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_name, revision_status::text, revision_issue_date from public.documents_behind
     where type_key = 'state_test' $$,
  $$ values ('Client of B', 'issued', '2026-08-01'::date) $$,
  'a member of another organization sees only their own documents behind, with their state'
);

select * from finish();
rollback;
