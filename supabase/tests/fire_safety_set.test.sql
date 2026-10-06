begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('dddddddd-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lead', '14399840', 'lead'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'To archive', '5022670', 'client');

insert into public.document_generations (id, organization_id, client_id, issue_date, created_at) values
  ('9a9a9a9a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-01', '2026-09-01 10:00+00');

insert into public.document_generations (id, organization_id, client_id, issue_date, first_decision_number, document_group, created_at) values
  ('9a9a9a9a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01', null, 'fire_safety_set', '2026-10-01 10:00+00');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'cover_decisions', 'Coperta', 'documentation_set'),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_registers', 'Registre', 'fire_safety_set'),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'fire_work_permit', 'Permis', 'fire_safety_set');

insert into public.document_revisions (id, organization_id, document_id, revision, status, docx_path, generation_id, issued_at, docx_sha256) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'draft',
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000001/1.docx', '9a9a9a9a-0000-4000-8000-000000000001', null, null),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'issued',
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000002/1.docx', '9a9a9a9a-0000-4000-8000-000000000002', now(), repeat('a', 64)),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 1, 'draft',
   '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000003/d1d1d1d1-0000-4000-8000-000000000003/1.docx', null, null, null);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

select is(
  (select document_group from public.document_generations where id = '9a9a9a9a-0000-4000-8000-000000000001'),
  'documentation_set'::public.document_group,
  'a generation is of the occupational safety set unless it says otherwise'
);

select throws_ok(
  $$ insert into public.document_generations (organization_id, client_id, issue_date, document_group)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01', 'other') $$,
  '23514',
  null,
  'a generation runs for a documentation set, never for other documents'
);

select throws_ok(
  $$ insert into public.document_generations (organization_id, client_id, issue_date, first_decision_number)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01', null) $$,
  '23514',
  null,
  'a generation of the occupational safety set numbers its decisions from somewhere'
);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'fire_registers', 'Registre', 'fire_safety_set') $$,
  'CLL01',
  null,
  'a lead gets no fire-safety set'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'cover_decisions', 'Coperta') $$,
  'CLL01',
  null,
  'nor an occupational safety set'
);

select lives_ok(
  $$ insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group)
     values ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_work_permit', 'Permis', 'fire_safety_set') $$,
  'an owner adds a fire-safety document for a client'
);

select throws_ok(
  $$ insert into public.document_revisions (organization_id, document_id, revision, docx_path)
     values ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000003', 2,
             '11111111-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-000000000003/d1d1d1d1-0000-4000-8000-000000000003/2.docx') $$,
  'CLA01',
  null,
  'a fire-safety document of an archived client gets no new revision'
);

select throws_ok(
  $$ delete from public.document_revisions where id = 'eeeeeeee-0000-4000-8000-000000000003' $$,
  'CLA01',
  null,
  'nor is its draft deleted'
);

select results_eq(
  $$ select documentation_generated_type_keys, documentation_issued_count, documentation_last_generated_at
     from public.client_list where id = 'c1c1c1c1-0000-4000-8000-000000000001' $$,
  $$ values ('{cover_decisions}'::text[], 0, '2026-09-01 10:00+00'::timestamptz) $$,
  'the clients list counts and dates the occupational safety set only'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select id from public.client_documents where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and document_group = 'fire_safety_set' order by id $$,
  $$ values ('d1d1d1d1-0000-4000-8000-000000000002'::uuid), ('d1d1d1d1-0000-4000-8000-000000000004'::uuid) $$,
  'a specialist reads the fire-safety documents'
);

select results_eq(
  $$ select id from public.document_revisions where document_id = 'd1d1d1d1-0000-4000-8000-000000000002' $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000002'::uuid) $$,
  'and their revisions'
);

select results_eq(
  $$ select document_group::text from public.document_generations
     where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' order by created_at $$,
  $$ values ('documentation_set'), ('fire_safety_set') $$,
  'and the generations of both sets'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from public.client_documents where organization_id = '11111111-0000-4000-8000-000000000001'
     union all select 1 from public.document_revisions where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  'another organization reads none of them'
);

select is_empty(
  $$ select 1 from public.document_generations where organization_id = '11111111-0000-4000-8000-000000000001' $$,
  'nor their generations'
);

select * from finish();
rollback;
