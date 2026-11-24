begin;
select plan(5);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa', '1590082');

-- A made-up type, so the built-in templates a local stack has registered change nothing.
select from public.register_built_in_template_version('duties_test', 'Duties test', 'built-in/duties_test/1.docx', repeat('1', 64), 'correction', null);

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'duties_test', 'Test', 'documentation_set');

select results_eq(
  $$ select document_group::text, applies_when from public.built_in_document_types() where type_key = 'ssm_duties' $$,
  $$ values ('documentation_set', 'always') $$,
  'every client gets document 13, whatever its headcount'
);

select results_eq(
  $$ select array_agg(type_key order by ordinality) from public.built_in_document_types() with ordinality
     where type_key in ('control_regulation', 'ssm_duties', 'signing_regulation_annex') $$,
  $$ values (array['control_regulation', 'ssm_duties', 'signing_regulation_annex']) $$,
  'document 13 comes between the control regulation and the annex on the electronic signature'
);

select lives_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, docx_path)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'draft',
       (select id from public.document_template_versions where sha256 = repeat('1', 64)), '11111111-0000-4000-8000-000000000001/c/d/1.docx') $$,
  'a revision of any other document records no fingerprints'
);

select lives_ok(
  $$ update public.document_revisions
     set duty_fingerprints = '{"annexes": [{"positionId": "5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f", "fingerprint": "ab"}], "roles": [{"role": "first_aid", "fingerprint": "cd"}]}'
     where document_id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  'a revision of document 13 records a fingerprint per annex and per role'
);

select throws_ok(
  $$ update public.document_revisions set duty_fingerprints = '[]'
     where document_id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'fingerprints without their annexes and roles are refused'
);

select * from finish();
rollback;
