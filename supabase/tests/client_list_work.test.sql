begin;
select plan(10);

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
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Untouched', '14399840');

insert into public.job_positions (id, organization_id, client_id, name, needs_protective_equipment, needs_instructions, archived_at) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Done', false, true, null),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Equipment undecided', null, false, null),
  ('f1f1f1f1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Instructions undecided', true, null, null),
  ('f1f1f1f1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Not evaluated', false, false, null),
  ('f1f1f1f1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Archived', null, null, now());

insert into public.risk_evaluations (organization_id, client_id, kind, job_position_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000002'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'f1f1f1f1-0000-4000-8000-000000000003');

insert into public.document_generations (organization_id, client_id, issue_date, created_at) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-01', '2026-09-01 10:00+00'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-09-01', '2026-09-20 10:00+00');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'cover_decisions', 'Coperta', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Decizia', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_first_aid', 'Failed', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true);

insert into public.document_revisions (organization_id, document_id, revision, status, docx_path, issued_at, docx_sha256) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'issued',
   '11111111-0000-4000-8000-000000000001/c1/d1/1.docx', now(), repeat('a', 64)),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'draft',
   '11111111-0000-4000-8000-000000000001/c1/d2/1.docx', null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000004', 1, 'issued',
   '11111111-0000-4000-8000-000000000001/c1/d4/1.docx', now(), repeat('b', 64));

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select public.job_position_count(c), public.job_positions_needing_work_count(c)
     from public.clients c order by c.legal_name $$,
  $$ values (0, 0), (4, 3) $$,
  'current positions, and those with a decision open or no evaluation'
);

select results_eq(
  $$ select public.documentation_generated_type_keys(c) from public.clients c order by c.legal_name $$,
  $$ values ('{}'::text[]), ('{cover_decisions,decision_training}'::text[]) $$,
  'the documents of the set with a revision, without the contract or a failed generation'
);

select results_eq(
  $$ select public.documentation_issued_count(c) from public.clients c order by c.legal_name $$,
  $$ values (0), (1) $$,
  'issued documents of the set, without the contract'
);

select results_eq(
  $$ select public.documentation_last_generated_at(c) from public.clients c order by c.legal_name $$,
  $$ values (null::timestamptz), ('2026-09-20 10:00+00'::timestamptz) $$,
  'the last generation, or null before the first'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select public.documentation_issued_count(c) from public.clients c where c.legal_name = 'Worked on' $$,
  $$ values (1) $$,
  'an owner, who also reads the contract, gets the same count'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select is_empty(
  $$ select id from public.clients $$,
  'an owner of another organization lists none of these clients'
);

reset role;

create temporary table foreign_client on commit drop as
  select c as client from public.clients c where id = 'c1c1c1c1-0000-4000-8000-000000000001';
grant select on foreign_client to authenticated;

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select results_eq(
  $$ select public.job_position_count(f.client),
            public.job_positions_needing_work_count(f.client),
            public.documentation_issued_count(f.client)
     from foreign_client f $$,
  $$ values (0, 0, 0) $$,
  'given another organization''s client row, the counts see none of its records'
);

select results_eq(
  $$ select public.documentation_generated_type_keys(f.client),
            public.documentation_last_generated_at(f.client)
     from foreign_client f $$,
  $$ values ('{}'::text[], null::timestamptz) $$,
  'nor its documents or generations'
);

reset role;

select is(
  public.client_since(jsonb_populate_record(null::public.clients,
    '{"created_at": "2026-08-01T00:00:00Z", "promoted_at": "2026-09-01T00:00:00Z"}')),
  '2026-09-01 00:00+00'::timestamptz,
  'a former lead became a client when it was promoted'
);

select is(
  public.client_since(jsonb_populate_record(null::public.clients,
    '{"created_at": "2026-08-01T00:00:00Z", "promoted_at": null}')),
  '2026-08-01 00:00+00'::timestamptz,
  'any other client when it was created'
);

select * from finish();
rollback;
