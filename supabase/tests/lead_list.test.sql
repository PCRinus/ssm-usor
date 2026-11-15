begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'specialist-a@example.com'),
  ('dddddddd-0000-4000-8000-000000000001', 'owner-b@example.com')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, locality, stage, declared_employee_count) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Fără Contract S.R.L.', '1590082', 'Sibiu', 'lead', 3),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Ciorna', '14399840', null, 'lead', null),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Emis', '22', null, 'lead', 10),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Trimis', '33', null, 'lead', 1),
  ('c1c1c1c1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'Primit', '44', null, 'lead', 2),
  ('c1c1c1c1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'Semnat', '55', null, 'lead', 4),
  ('c1c1c1c1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'Reemis', '66', null, 'lead', 5),
  ('c1c1c1c1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'Client', '77', null, 'client', 5);

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only)
select ('d1d1d1d1-0000-4000-8000-00000000000' || n)::uuid, '11111111-0000-4000-8000-000000000001',
  ('c1c1c1c1-0000-4000-8000-00000000000' || n)::uuid, 'service_contract', 'Contract', 'other', true
from generate_series(2, 7) n;

insert into public.document_revisions (id, organization_id, document_id, revision, docx_path, status, issued_at, docx_sha256, superseded_at)
select v.id::uuid, '11111111-0000-4000-8000-000000000001', ('d1d1d1d1-0000-4000-8000-00000000000' || v.n)::uuid, v.rev,
  '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-00000000000' || v.n || '/d1d1d1d1-0000-4000-8000-00000000000' || v.n || '/' || v.rev || '.docx',
  v.status::public.document_revision_status, v.issued_at::timestamptz,
  case when v.status <> 'draft' then repeat('a', 64) end,
  case when v.status = 'superseded' then now() end
from (values
  ('e1e1e1e1-0000-4000-8000-000000000021', 2, 1, 'draft', null),
  ('e1e1e1e1-0000-4000-8000-000000000031', 3, 1, 'issued', '2026-11-01T10:00:00Z'),
  ('e1e1e1e1-0000-4000-8000-000000000032', 3, 2, 'draft', null),
  ('e1e1e1e1-0000-4000-8000-000000000041', 4, 1, 'issued', '2026-09-01T10:00:00Z'),
  ('e1e1e1e1-0000-4000-8000-000000000051', 5, 1, 'issued', '2026-10-01T10:00:00Z'),
  ('e1e1e1e1-0000-4000-8000-000000000061', 6, 1, 'issued', '2026-10-02T10:00:00Z'),
  ('e1e1e1e1-0000-4000-8000-000000000071', 7, 1, 'superseded', '2026-08-01T10:00:00Z'),
  ('e1e1e1e1-0000-4000-8000-000000000072', 7, 2, 'issued', '2026-11-05T10:00:00Z')
) as v (id, n, rev, status, issued_at);

insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to, token_hash, sent_at, return_expires_at) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000041', 'a@lead.test', repeat('1', 64), '2026-09-02T10:00:00Z', '2026-11-01T10:00:00Z'),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000041', 'a@lead.test', repeat('2', 64), '2026-09-12T10:00:00Z', '2026-11-11T10:00:00Z'),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000051', 'a@lead.test', repeat('3', 64), '2026-10-02T10:00:00Z', '2026-12-01T10:00:00Z'),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000007', 'e1e1e1e1-0000-4000-8000-000000000071', 'a@lead.test', repeat('4', 64), '2026-08-02T10:00:00Z', '2026-10-01T10:00:00Z');

insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, source, uploaded_at, confirmed_at) values
  ('e1e1e1e1-0000-4000-8000-000000000051', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000005',
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000005/d1d1d1d1-0000-4000-8000-000000000005/1.signed.pdf', repeat('c', 64), 'client', '2026-10-05T10:00:00Z', null),
  ('e1e1e1e1-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000006',
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000006/d1d1d1d1-0000-4000-8000-000000000006/1.signed.pdf', repeat('c', 64), 'owner', '2026-10-06T10:00:00Z', '2026-10-06T10:00:00Z');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select l.legal_name, l.service_contract_state::text, l.service_contract_state_at, l.service_contract_return_expires_at
     from public.lead_list l order by l.service_contract_state, l.service_contract_state_at, l.legal_name $$,
  $$ values
    ('Fără Contract S.R.L.'::text, 'none'::text, null::timestamptz, null::timestamptz),
    ('Ciorna', 'draft', null, null),
    ('Emis', 'issued', '2026-11-01T10:00:00Z', null),
    ('Reemis', 'issued', '2026-11-05T10:00:00Z', null),
    ('Trimis', 'sent', '2026-09-12T10:00:00Z', '2026-11-11T10:00:00Z'),
    ('Primit', 'received', '2026-10-05T10:00:00Z', null),
    ('Semnat', 'signed', '2026-10-06T10:00:00Z', null) $$,
  'a lead stands where its contract in force stands, since it was issued, last sent, received or confirmed; a draft beside an issued revision and a send of a replaced one change nothing'
);

select results_eq(
  $$ select legal_name, current_employee_count, declared_employee_count from public.lead_list where search_text like '%sibiu%' $$,
  $$ values ('Fără Contract S.R.L.'::text, 0, 3) $$,
  'the search text holds the locality without diacritics, and a client is not a lead'
);

select is(
  (select count(*)::integer from public.lead_list where service_contract_state in ('sent', 'received')),
  2,
  'the state filters as an enum'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is((select count(*)::integer from public.lead_list), 0, 'a specialist sees no lead');

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is((select count(*)::integer from public.lead_list), 0, 'another organization sees none of the leads');

select * from finish();
rollback;
