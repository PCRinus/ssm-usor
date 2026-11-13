begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'colleague@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('11111111-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Termoconstruct Vest SRL', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Ofertă SRL', '2345678', 'lead'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Închisă SRL', '3456789', 'client');

insert into public.employees (id, organization_id, client_id, last_name, first_name, job_title, hired_at) values
  ('ee000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'Popescu', 'Andrei', 'Zidar', '2020-01-10');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256,
       earlier_instructions_domain, valid_until)
     values ('f0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Instrucțiuni proprii SSM 2021', 'Instructiuni proprii SSM 2021.pdf', 'application/pdf', 1234, repeat('a', 64),
       'ssm', '2026-11-12') $$,
  'a specialist keeps a copy of the client''s earlier IPSSM, with the day they applied until'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256,
       earlier_instructions_domain)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'IPSU', 'IPSU.pdf', 'application/pdf', 10, repeat('b', 64), 'su') $$,
  '23514',
  null,
  'a copy of earlier instructions says until when they applied'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256,
       valid_until)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
       'Certificat', 'Certificat.pdf', 'application/pdf', 10, repeat('b', 64), '2026-11-12') $$,
  '23514',
  null,
  'and no other file has that day'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, employee_id, name, original_file_name, mime_type, size_bytes, sha256,
       earlier_instructions_domain, valid_until)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001',
       'IPSSM', 'IPSSM.pdf', 'application/pdf', 10, repeat('b', 64), 'ssm', '2026-11-12') $$,
  '23514',
  null,
  'the instructions are the client''s, not one worker''s'
);

select results_eq(
  $$ update public.client_files set valid_until = '2025-01-15'
     where id = 'f0000000-0000-4000-8000-000000000001' returning valid_until $$,
  $$ values ('2025-01-15'::date) $$,
  'the uploader changes the day'
);

select throws_ok(
  $$ update public.client_files set earlier_instructions_domain = 'su'
     where id = 'f0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'but not the domain'
);

select lives_ok(
  $$ insert into public.earlier_instructions_unavailable (client_id, organization_id, domain)
     values ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'su') $$,
  'a specialist answers that the client has no earlier IPSU'
);

select results_eq(
  $$ select domain::text, answered_by from public.earlier_instructions_unavailable $$,
  $$ values ('su', 'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'which is kept for that domain alone, with who answered'
);

select throws_ok(
  $$ insert into public.earlier_instructions_unavailable (client_id, organization_id, domain)
     values ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'su') $$,
  '23505',
  null,
  'a domain is answered once'
);

select throws_ok(
  $$ insert into public.earlier_instructions_unavailable (client_id, organization_id, domain, answered_by)
     values ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'ssm',
       'bbbbbbbb-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'nobody answers in a colleague''s name'
);

select throws_ok(
  $$ insert into public.earlier_instructions_unavailable (client_id, organization_id, domain)
     values ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'ssm') $$,
  '42501',
  null,
  'a lead has no trainings to answer for'
);

select throws_ok(
  $$ update public.earlier_instructions_unavailable set domain = 'ssm' $$,
  '42501',
  null,
  'an answer is not changed in place'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from public.earlier_instructions_unavailable $$,
  'another organization does not see the answer'
);

select is_empty(
  $$ delete from public.earlier_instructions_unavailable returning 1 $$,
  'nor takes it back'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ delete from public.earlier_instructions_unavailable returning domain::text $$,
  $$ values ('su') $$,
  'a colleague takes the answer back'
);

select pg_temp.act_as_postgres();
insert into public.earlier_instructions_unavailable (client_id, organization_id, domain, answered_by) values
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'ssm', 'bbbbbbbb-0000-4000-8000-000000000001');
update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ delete from public.earlier_instructions_unavailable where client_id = 'cccccccc-0000-4000-8000-000000000003' $$,
  'CLA01',
  null,
  'an archived client''s answer stays as it is'
);

select pg_temp.act_as_postgres();
select public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from public.earlier_instructions_unavailable where client_id = 'cccccccc-0000-4000-8000-000000000003' $$,
  'and goes with the client when it is deleted'
);

select * from finish();
rollback;
