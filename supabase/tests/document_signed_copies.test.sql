begin;
select plan(11);

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
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 1,
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.docx', 'issued', now(), repeat('a', 64));
insert into public.document_revisions (id, organization_id, document_id, revision, docx_path) values
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 2,
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/2.docx');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select ok(
  not public.is_signed_copy_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf'),
  'no file is written before its row says so'
);

select throws_ok(
  $$ insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, confirmed_at)
     values ('eeeeeeee-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
       '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/2.signed.pdf', repeat('b', 64), now()) $$,
  'DOC04',
  null,
  'a draft has no signed copy'
);

select throws_ok(
  $$ insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, confirmed_at)
     values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
       '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/9.signed.pdf', repeat('b', 64), now()) $$,
  '23514',
  null,
  'the copy lives beside the file of its revision'
);

select lives_ok(
  $$ insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, confirmed_at)
     values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
       '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf', repeat('b', 64), now()) $$,
  'an owner attaches the signed copy of the issued contract'
);

select ok(
  public.is_signed_copy_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf'),
  'whose file may now be written'
);

select ok(
  public.is_readable_document_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf'),
  'and read'
);

select lives_ok(
  $$ update public.document_signed_copies set sha256 = repeat('c', 64) where revision_id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'a better scan replaces it'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty(
  $$ select revision_id from public.document_signed_copies $$,
  'a specialist does not see the signed copy of a contract'
);

select ok(
  not public.is_readable_document_path('11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000001/dddddddd-0000-4000-8000-000000000001/1.signed.pdf'),
  'nor its file'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'the client is archived'
);

select throws_ok(
  $$ delete from public.document_signed_copies where revision_id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'CLA01',
  null,
  'and its signed copy stays as it is'
);

select * from finish();
rollback;
