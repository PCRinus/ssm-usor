begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true);

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path, status, issued_at, docx_sha256) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 1, '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.docx', 'issued', now(), repeat('a', 64));
insert into public.document_revisions (id, organization_id, document_id, revision, docx_path) values
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 2, '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/2.docx');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'andrei@client.example') $$,
  'an owner records that the issued contract was sent'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'andrei@client.example') $$,
  '42501',
  null,
  'a draft is not sent'
);

select throws_ok(
  $$ update public.service_contract_sends set sent_to = 'altcineva@client.example' $$,
  '42501',
  null,
  'a send is not rewritten'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty(
  $$ select id from public.service_contract_sends $$,
  'a specialist sees no sends'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'x@y.example') $$,
  '42501',
  null,
  'and records none'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select sent_to from public.service_contract_sends $$,
  $$ values ('andrei@client.example') $$,
  'what was sent stays as it was'
);

select * from finish();
rollback;
