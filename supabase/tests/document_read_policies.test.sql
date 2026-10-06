begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-admin@test', 'x', now(), '{"provider":"email","role":"admin"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('dddddddd-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082'),
  ('c2c2c2c2-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'Client of B', '14399840');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'cover_decisions', 'Coperta', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 'cover_decisions', 'Coperta', 'documentation_set', false),
  ('d2d2d2d2-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000002', 'service_contract', 'Contract', 'other', true);

insert into public.document_revisions (id, organization_id, document_id, revision, status, docx_path, issued_at, docx_sha256)
select
  ('eeeeeeee-0000-4000-8000-0000000000' || n)::uuid, d.organization_id, d.id, 1, 'issued',
  d.organization_id || '/' || d.client_id || '/' || d.id || '/1.docx', now(), repeat('a', 64)
from (values
  ('11', 'd1d1d1d1-0000-4000-8000-000000000001'::uuid),
  ('12', 'd1d1d1d1-0000-4000-8000-000000000002'),
  ('21', 'd2d2d2d2-0000-4000-8000-000000000001'),
  ('22', 'd2d2d2d2-0000-4000-8000-000000000002')
) as v (n, document_id)
join public.client_documents d on d.id = v.document_id;

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path)
select
  ('eeeeeeee-0000-4000-8000-0000000000' || n)::uuid, d.organization_id, d.id, 2,
  d.organization_id || '/' || d.client_id || '/' || d.id || '/2.docx'
from (values
  ('13', 'd1d1d1d1-0000-4000-8000-000000000001'::uuid),
  ('14', 'd1d1d1d1-0000-4000-8000-000000000002')
) as v (n, document_id)
join public.client_documents d on d.id = v.document_id;

insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, confirmed_at)
select r.id, r.organization_id, r.document_id, regexp_replace(r.docx_path, '\.docx$', '.signed.pdf'), repeat('b', 64), now()
from public.document_revisions r
where r.status = 'issued';

insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
select r.organization_id, r.document_id, r.id, 'contact@client.example'
from public.document_revisions r
where r.status = 'issued' and r.document_id in ('d1d1d1d1-0000-4000-8000-000000000002', 'd2d2d2d2-0000-4000-8000-000000000002');

-- What the read policies said before, as can_access_document answers it for the caller.
create temporary table every_revision on commit drop as
  select id, organization_id, document_id from public.document_revisions;
create temporary table every_signed_copy on commit drop as
  select revision_id, organization_id, document_id from public.document_signed_copies;
create temporary table every_send on commit drop as
  select id, organization_id, document_id from public.service_contract_sends;
grant select on every_revision, every_signed_copy, every_send to authenticated;

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb default '{"provider":"email"}')
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

create or replace function pg_temp.reads_as_before(actor text)
returns setof text language plpgsql as $$
begin
  return next results_eq(
    'select id from public.document_revisions order by id',
    'select id from every_revision
     where organization_id = public.current_organization_id() and public.can_access_document(document_id) order by id',
    actor || ' reads the same revisions as can_access_document allows'
  );
  return next results_eq(
    'select revision_id from public.document_signed_copies order by revision_id',
    'select revision_id from every_signed_copy
     where organization_id = public.current_organization_id() and public.can_access_document(document_id) order by revision_id',
    actor || ' reads the same signed copies as can_access_document allows'
  );
  return next results_eq(
    'select id from public.service_contract_sends order by id',
    'select id from every_send
     where organization_id = public.current_organization_id() and public.can_access_document(document_id) order by id',
    actor || ' reads the same sends as can_access_document allows'
  );
end;
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select * from pg_temp.reads_as_before('an owner');

select results_eq(
  $$ select id from public.document_revisions order by id $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000011'::uuid), ('eeeeeeee-0000-4000-8000-000000000012'::uuid),
            ('eeeeeeee-0000-4000-8000-000000000013'::uuid), ('eeeeeeee-0000-4000-8000-000000000014'::uuid) $$,
  'an owner reads every revision of their organization, the contract included'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
select * from pg_temp.reads_as_before('a specialist');

select results_eq(
  $$ select id from public.document_revisions order by id $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000011'::uuid), ('eeeeeeee-0000-4000-8000-000000000013'::uuid) $$,
  'a specialist reads no revision of the contract'
);

select is_empty(
  $$ select 1 from public.document_signed_copies where document_id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  'nor its signed copy'
);

select is_empty($$ select 1 from public.service_contract_sends $$, 'nor its sends');

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');
select * from pg_temp.reads_as_before('an owner of another organization');

select is_empty(
  $$ select 1 from public.document_revisions where organization_id = '11111111-0000-4000-8000-000000000001'
     union all select 1 from public.document_signed_copies where organization_id = '11111111-0000-4000-8000-000000000001'
     union all select 1 from public.service_contract_sends where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  'another organization reads nothing of these documents'
);

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000004', '{"provider":"email","role":"admin"}');
select * from pg_temp.reads_as_before('a platform admin outside an impersonation');

reset role;
insert into public.impersonations (admin_user_id, target_user_id, reason)
  values ('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'reproduce bug');
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000004', '{"provider":"email","role":"admin"}');
select * from pg_temp.reads_as_before('a platform admin impersonating a specialist');

select results_eq(
  $$ select id from public.document_revisions order by id $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000011'::uuid), ('eeeeeeee-0000-4000-8000-000000000013'::uuid) $$,
  'impersonating a specialist reads what the specialist reads'
);

reset role;
update public.impersonations set target_user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  where admin_user_id = 'cccccccc-0000-4000-8000-000000000004';
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000004', '{"provider":"email","role":"admin"}');
select * from pg_temp.reads_as_before('a platform admin impersonating an owner');

select * from finish();
rollback;
