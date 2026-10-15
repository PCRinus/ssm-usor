begin;
select plan(10);

-- ADR 020: a dated document type appears once per client and period, every other type once.

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client', '1590082', 'client');

create or replace function pg_temp.this_year()
returns smallint language sql as $$
  select extract(year from now() at time zone 'Europe/Bucharest')::smallint;
$$;

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group, period)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_registers', 'Registre', 'fire_safety_set', 2026) $$,
  '23514',
  null,
  'a type that is not dated carries no period'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Raport', 'fire_safety_set') $$,
  '23514',
  null,
  'a dated type always carries its period'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group, period)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Raport', 'fire_safety_set', 1999) $$,
  '23514',
  null,
  'a period is a year from 2000 to 2100'
);

select lives_ok(
  $$ insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, period) values
       ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Raport', 'fire_safety_set', pg_temp.this_year()),
       ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Raport', 'fire_safety_set', pg_temp.this_year() - 1) $$,
  'a dated type appears once for each period'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group, period)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Raport', 'fire_safety_set', pg_temp.this_year()) $$,
  '23505',
  null,
  'a dated type appears once in the same period'
);

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_registers', 'Registre', 'fire_safety_set');

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_registers', 'Registre', 'fire_safety_set') $$,
  '23505',
  null,
  'a type that is not dated still appears once'
);

select from public.register_built_in_template_version('fire_annual_report', 'Raport', 'built-in/fire_annual_report/1.docx', repeat('1', 64), 'correction', null);

insert into public.document_revisions (organization_id, document_id, revision, docx_path, template_version_id)
select '11111111-0000-4000-8000-000000000001', d.id, 1,
  '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/' || d.id || '/1.docx',
  (select id from public.document_template_versions where sha256 = repeat('1', 64))
from public.client_documents d
where d.client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and d.type_key = 'fire_annual_report';

insert into public.document_revisions (organization_id, document_id, revision, docx_path) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000003/1.docx');

select is(
  (select fire_safety_generated_type_keys from public.client_list where id = 'c1c1c1c1-0000-4000-8000-000000000001'),
  array['fire_annual_report', 'fire_registers'],
  'the clients list counts the report of the current year once'
);

delete from public.document_revisions where document_id = 'd1d1d1d1-0000-4000-8000-000000000001';
delete from public.client_documents where id = 'd1d1d1d1-0000-4000-8000-000000000001';

select is(
  (select fire_safety_generated_type_keys from public.client_list where id = 'c1c1c1c1-0000-4000-8000-000000000001'),
  array['fire_registers'],
  'a report of an earlier year does not count for the current one'
);

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, period) values
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Raport', 'fire_safety_set', pg_temp.this_year() - 2);

insert into public.document_revisions (organization_id, document_id, revision, docx_path, template_version_id) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 1,
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000004/1.docx',
   (select id from public.document_template_versions where sha256 = repeat('1', 64)));

select from public.register_built_in_template_version('fire_annual_report', 'Raport', 'built-in/fire_annual_report/2.docx', repeat('2', 64), 'correction', 'Corectură.');

select results_eq(
  $$ select document_id from public.documents_behind where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  $$ values ('d1d1d1d1-0000-4000-8000-000000000002'::uuid) $$,
  'only the newest period of a dated type is behind its template'
);

select is(
  (select count(*)::integer from public.client_documents
   where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and type_key = 'fire_annual_report'),
  2,
  'the earlier years stay beside the newest'
);

select * from finish();
rollback;
