begin;
select plan(12);

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

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Worked on', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Untouched', '14399840'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670');

insert into public.clients (id, organization_id, legal_name, cui, stage, created_at) values
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'A lead', '11', 'lead', '2026-08-01 00:00+00');

insert into public.job_positions (id, organization_id, client_id, name, needs_protective_equipment, needs_instructions, archived_at) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Done', false, true, null),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Equipment undecided', null, false, null),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Instructions undecided', true, null, null),
  ('f1f1f1f1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Not evaluated', false, false, null),
  ('f1f1f1f1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Archived', null, null, now());

insert into public.job_positions (id, organization_id, client_id, name, needs_protective_equipment, needs_instructions) values
  ('f2f2f2f2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Of B', true, true);

insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at, job_position_id, status, terminated_at, archived_at) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'f1f1f1f1-0000-4000-8000-000000000001', 'active', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'f1f1f1f1-0000-4000-8000-000000000002', 'active', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Georgescu', 'Dan', 'Sudor', '2020-03-01', 'f1f1f1f1-0000-4000-8000-000000000001', 'terminated', '2026-01-31', null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Marin', 'Ioana', 'Sudor', '2020-03-01', 'f1f1f1f1-0000-4000-8000-000000000001', 'active', null, now()),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Stan', 'Maria', 'Contabil', '2021-06-15', 'f2f2f2f2-0000-4000-8000-000000000001', 'active', null, null);

insert into public.risk_evaluations (organization_id, client_id, kind, job_position_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000002'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000003');

insert into public.document_generations (organization_id, client_id, issue_date, created_at) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-01', '2026-09-01 10:00+00'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-01', '2026-09-20 10:00+00'),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', '2026-09-01', '2026-09-25 10:00+00');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'cover_decisions', 'Coperta', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Decizia', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_first_aid', 'Failed', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true),
  ('d2d2d2d2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'cover_decisions', 'Coperta', 'documentation_set', false);

insert into public.document_revisions (organization_id, document_id, revision, status, docx_path, issued_at, docx_sha256) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'issued',
   '11111111-0000-4000-8000-000000000001/c1/d1/1.docx', now(), repeat('a', 64)),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'draft',
   '11111111-0000-4000-8000-000000000001/c1/d2/1.docx', null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 1, 'issued',
   '11111111-0000-4000-8000-000000000001/c1/d4/1.docx', now(), repeat('b', 64)),
  ('22222222-0000-4000-8000-000000000002', 'd2d2d2d2-0000-4000-8000-000000000001', 1, 'issued',
   '22222222-0000-4000-8000-000000000002/c2/d1/1.docx', now(), repeat('c', 64));

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select legal_name, current_employee_count from public.client_list order by legal_name $$,
  $$ values ('Untouched', 0), ('Worked on', 2) $$,
  'a specialist lists the clients without the lead, counting current employees only'
);

select results_eq(
  $$ select job_position_count, job_positions_needing_work_count from public.client_list order by legal_name $$,
  $$ values (0, 0), (4, 3) $$,
  'current positions, and those with a decision open or no evaluation'
);

select results_eq(
  $$ select documentation_generated_type_keys from public.client_list order by legal_name $$,
  $$ values ('{}'::text[]), ('{cover_decisions,decision_training}'::text[]) $$,
  'the documents of the set with a revision, without the contract or a failed generation'
);

select results_eq(
  $$ select documentation_issued_count from public.client_list order by legal_name $$,
  $$ values (0), (1) $$,
  'issued documents of the set, without the contract'
);

select results_eq(
  $$ select documentation_last_generated_at from public.client_list order by legal_name $$,
  $$ values (null::timestamptz), ('2026-09-20 10:00+00'::timestamptz) $$,
  'the last generation, or null before the first'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select legal_name, documentation_generated_type_keys, documentation_issued_count, client_since
     from public.client_list order by legal_name $$,
  $$ values ('A lead', '{}'::text[], 0, '2026-08-01 00:00+00'::timestamptz),
            ('Untouched', '{}'::text[], 0, (select created_at from public.clients where legal_name = 'Untouched')),
            ('Worked on', '{cover_decisions,decision_training}'::text[], 1, (select created_at from public.clients where legal_name = 'Worked on')) $$,
  'an owner also lists the lead, and the contract counts for no one'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select is_empty(
  $$ select id from public.client_list where id::text like 'c1c1c1c1-%' $$,
  'an owner of another organization lists none of these clients'
);

select results_eq(
  $$ select legal_name, current_employee_count, job_position_count, job_positions_needing_work_count,
            documentation_issued_count, documentation_last_generated_at
     from public.client_list $$,
  $$ values ('Client of B', 1, 1, 1, 1, '2026-09-25 10:00+00'::timestamptz) $$,
  'another organization lists only its own client, with its own numbers'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
reset role;

update public.clients set stage = 'client' where legal_name = 'A lead';

select ok(
  (select l.client_since = c.promoted_at and l.client_since > l.created_at
   from public.client_list l join public.clients c on c.id = l.id
   where l.legal_name = 'A lead'),
  'a former lead became a client when it was promoted'
);

select ok(
  not has_table_privilege('anon', 'public.client_list', 'select')
    and has_table_privilege('authenticated', 'public.client_list', 'select')
    and not has_table_privilege('authenticated', 'public.client_list', 'insert'),
  'only a signed-in user reads the list, and nobody writes through it'
);

select ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.client_list'::regclass),
  'the list answers to the caller''s policies'
);

select is_empty(
  $$ select proname from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('job_position_count', 'job_positions_needing_work_count', 'documentation_generated_type_keys',
                       'documentation_issued_count', 'documentation_last_generated_at', 'client_since') $$,
  'the computed fields the list replaced are gone'
);

select * from finish();
rollback;
