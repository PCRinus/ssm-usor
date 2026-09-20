begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lead of A', '14399840', 'lead');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'decision_training', 'Decizia nr. 1') $$,
  'CLL01',
  null,
  'a lead still gets no documentation set'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'service_contract', 'Contract', 'other') $$,
  '23514',
  null,
  'a contract is never a document the team could read'
);

select lives_ok(
  $$ insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only)
     values ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'service_contract', 'Contract de prestări servicii', 'other', true) $$,
  'an owner starts the contract of a lead'
);

select lives_ok(
  $$ insert into public.document_revisions (id, organization_id, document_id, revision, docx_path)
     values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 1,
       '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx') $$,
  'with its draft'
);

select ok(
  public.is_draft_document_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx'),
  'whose file the owner may write'
);

select ok(
  public.is_readable_document_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx'),
  'and read'
);

select lives_ok(
  $$ insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 51, '2026-02-15', '2026-02-15', 12) $$,
  'an owner records the number and the dates'
);

select throws_ok(
  $$ insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 51, '2026-09-01', '2026-09-01', 12) $$,
  '23505',
  null,
  'a number is used once a year'
);

select lives_ok(
  $$ insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 51, '2027-01-10', '2027-01-10', 12) $$,
  'and again the year after'
);

select throws_ok(
  $$ update public.service_contracts set covers_occupational_safety = false
     where client_id = 'cccccccc-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'a contract covers something'
);

select lives_ok(
  $$ update public.clients set stage = 'client' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'the lead becomes a client'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty(
  $$ select id from public.client_documents where client_id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'whose contract the specialist does not see'
);

select is_empty(
  $$ select id from public.document_revisions where document_id = 'dddddddd-0000-4000-8000-000000000001' $$,
  'nor its revisions'
);

select ok(
  not public.is_readable_document_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx'),
  'nor its file, even with the path'
);

select ok(
  not public.is_draft_document_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx'),
  'which they cannot overwrite either'
);

select throws_ok(
  $$ select public.issue_document_revision('eeeeeeee-0000-4000-8000-000000000001', repeat('a', 64)) $$,
  'DOC01',
  null,
  'and they cannot issue what does not exist for them'
);

select throws_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 2, 'x/y/z/2.docx') $$,
  '42501',
  null,
  'or add a revision to it'
);

select is_empty(
  $$ select id from public.service_contracts $$,
  'The numbers and dates are the owners'' too'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.issue_document_revision('eeeeeeee-0000-4000-8000-000000000001', repeat('a', 64)) $$,
  'the owner issues the contract'
);

select * from finish();
rollback;
