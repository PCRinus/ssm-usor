begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');
insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');
insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Lead of A', '1590082', 'lead');
insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true);
insert into public.document_revisions (id, organization_id, document_id, revision, docx_path, status, issued_at, docx_sha256) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.docx', 'issued', now(), repeat('a', 64));

select lives_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to, token_hash, return_expires_at)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'contact@lead.test', repeat('b', 64), now() + interval '60 days') $$,
  'a send carries the hash of its return token'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to, token_hash)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'contact@lead.test', repeat('b', 64)) $$,
  '23505',
  null,
  'two sends never share a token'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to, token_hash)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'contact@lead.test', 'not-a-hash') $$,
  '23514',
  null,
  'the token is stored as its SHA-256'
);

select throws_ok(
  $$ insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, source)
     values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
             '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf', repeat('c', 64), 'owner') $$,
  '23514',
  null,
  'a copy an owner attached is confirmed on the spot'
);

select lives_ok(
  $$ insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, source)
     values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
             '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf', repeat('c', 64), 'client') $$,
  'a copy received through the link waits for confirmation'
);

select lives_ok(
  $$ update public.document_signed_copies set confirmed_at = now(), confirmed_by = 'aaaaaaaa-0000-4000-8000-000000000001'
     where revision_id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'an owner confirms a received copy'
);

select * from finish();
rollback;
