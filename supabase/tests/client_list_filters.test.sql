begin;
select plan(16);

-- Dates are counted back from the Romanian day the list uses, so the states hold on any day.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, county_code, locality, worker_training_interval_months, administrative_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa Construct S.R.L.', '1590082', 'BC', 'Bacău', 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Beta', '14399840', 'CJ', null, 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Gama', '22', 'CJ', null, 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Delta', '33', null, null, 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'Epsilon', '44', null, null, 3, 6),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', null, null, 3, 6);

insert into public.job_positions (id, organization_id, client_id, name, staff_category) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'Sudor', 'execution');

create temp table day as select (now() at time zone 'Europe/Bucharest')::date as today;
grant select on day to authenticated;

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Overdue', 'X', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Due', 'X', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Current', 'X', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Untrained', 'X', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Left', 'X', 'Sudor', '2024-01-01', 'terminated', '2026-01-31'),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Current', 'Y', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'b1b1b1b1-0000-4000-8000-000000000005', 'Of archived', 'X', 'Sudor', '2024-01-01', 'active', null);

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status)
select ('e3e3e3e3-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, '11111111-0000-4000-8000-000000000001',
  'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000003', 'Due ' || i, 'Z', 'Sudor', '2024-01-01', 'active'
from generate_series(1, 10) as i;

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
select v.id::uuid, '11111111-0000-4000-8000-000000000001', v.client_id::uuid, v.domain::public.training_domain, 'workplace', d.today - v.days_ago, 120, 'Material', 'Ion POP', 'Șef atelier'
from day d, (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 120),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 75),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 10),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'c1c1c1c1-0000-4000-8000-000000000001', 'su', 10),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'c1c1c1c1-0000-4000-8000-000000000002', 'ssm', 10),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'c1c1c1c1-0000-4000-8000-000000000002', 'su', 10),
  ('a1a1a1a1-0000-4000-8000-000000000007', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 75),
  ('a1a1a1a1-0000-4000-8000-000000000008', 'c1c1c1c1-0000-4000-8000-000000000003', 'su', 10)
) as v (id, client_id, domain, days_ago);

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation)
select coalesce(v.id::uuid, gen_random_uuid()), t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('7a7a7a7a-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000002'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000003'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000001'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000002'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000003'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000006'),
  (null, 'a1a1a1a1-0000-4000-8000-000000000006', 'e1e1e1e1-0000-4000-8000-000000000006')
) as v (id, training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
select t.organization_id, t.client_id, t.id, t.phase, e.id, 'Sudor'
from public.trainings t
join public.employees e on e.client_id = t.client_id
where t.client_id = 'c1c1c1c1-0000-4000-8000-000000000003';

-- Every SU hiring test waits, as each workplace record was held in the app; Beta's worker passed.
insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source)
select '11111111-0000-4000-8000-000000000001', e.client_id, e.id, 'su', 'hiring', d.today - 5, 'Test', 'Mihai VECHI', 'Cadru tehnic PSI', 'paper'
from day d, public.employees e
where e.client_id in ('c1c1c1c1-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000003');

insert into public.signature_requests (organization_id, client_id, training_record_id, slot) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer');

insert into public.participant_invitations (organization_id, client_id, kind, full_name, channel, address) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'client_administrator', 'Elena Radu', 'email', 'hr@delta.test');

-- A made-up type, so the built-in templates a local stack has registered change nothing.
select from public.register_built_in_template_version('client_list_test', 'Client list test', 'built-in/client_list_test/1.docx', repeat('1', 64), 'correction', null);
select from public.register_built_in_template_version('client_list_test', 'Client list test', 'built-in/client_list_test/2.docx', repeat('2', 64), 'legal', 'Art. 7 în forma în vigoare.');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'cover_decisions', 'Issued', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_workers_representative', 'Kept below ten', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Draft', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_cover_decisions', 'Issued', 'fire_safety_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_own_extra', 'Not built in', 'fire_safety_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_list_test', 'Behind', 'documentation_set', false);

insert into public.client_documents (organization_id, client_id, type_key, title, document_group, owners_only)
select '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', b.type_key, b.type_key, b.document_group, false
from public.built_in_document_types() b
where b.document_group = 'documentation_set' and b.applies_when = 'always';

insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, docx_path, issued_at, docx_sha256)
select d.organization_id, d.id, 1, v.status::public.document_revision_status,
  (select id from public.document_template_versions where sha256 = repeat('1', 64) and d.type_key = 'client_list_test'),
  d.organization_id || '/' || d.id || '/1.docx',
  case when v.status = 'issued' then now() end,
  case when v.status = 'issued' then repeat('a', 64) end
from public.client_documents d
cross join lateral (select case when d.id = 'd1d1d1d1-0000-4000-8000-000000000003' then 'draft' else 'issued' end as status) as v
where d.organization_id = '11111111-0000-4000-8000-000000000001';

insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months, renews_automatically)
select '11111111-0000-4000-8000-000000000001', v.client_id::uuid, v.number, d.today - 400, (d.today - interval '12 months')::date + 30, 12, v.renews
from day d, (values
  ('c1c1c1c1-0000-4000-8000-000000000001', 1, false),
  ('c1c1c1c1-0000-4000-8000-000000000002', 2, true)
) as v (client_id, number, renews);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000005';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select legal_name, documentation_state::text, documentation_issued_count, documentation_total_count
     from public.client_list where archived_at is null order by legal_name $$,
  $$ values
    ('Alfa Construct S.R.L.', 'in_progress', 3, 24),
    ('Beta', 'issued', 22, 22),
    ('Delta', 'none', 0, 23),
    ('Gama', 'none', 0, 23) $$,
  'the occupational safety set counts what was generated and each built-in document that applies: the representative from ten employees or once generated, the annex with someone invited'
);

select results_eq(
  $$ select legal_name, fire_safety_state::text, fire_safety_issued_count, fire_safety_total_count
     from public.client_list where archived_at is null order by legal_name $$,
  $$ values
    ('Alfa Construct S.R.L.', 'in_progress', 2, 23),
    ('Beta', 'none', 0, 22),
    ('Delta', 'none', 0, 22),
    ('Gama', 'none', 0, 28) $$,
  'the fire-safety set counts a document no list names, and the six of ten employees from ten'
);

select results_eq(
  $$ select legal_name, training_employee_count, training_untrained_count, training_overdue_count,
            training_due_count, training_attention_count, training_rank, training_flagged_count
     from public.client_list order by legal_name $$,
  $$ values
    ('Alfa Construct S.R.L.', 4, 1, 1, 1, 2, 0, 2),
    ('Beta', 1, 0, 0, 0, 0, 2, 0),
    ('Delta', 0, 0, 0, 0, 0, 3, 0),
    ('Epsilon', 0, 0, 0, 0, 0, 3, 0),
    ('Gama', 10, 0, 0, 10, 0, 1, 10) $$,
  'current employees by training state, never a leaver or an archived client''s, ranked by urgency'
);

select results_eq(
  $$ select legal_name, next_training_due_on from public.client_list order by legal_name $$,
  $$ select * from (values
    ('Alfa Construct S.R.L.', ((select today from day) - 75 + interval '3 months')::date),
    ('Beta', ((select today from day) - 10 + interval '3 months')::date),
    ('Delta', null::date),
    ('Epsilon', null::date),
    ('Gama', ((select today from day) - 75 + interval '3 months')::date)) as v $$,
  'the nearest due date not yet passed: an overdue one is not next'
);

select results_eq(
  $$ select legal_name, tests_pending_count from public.client_list order by legal_name $$,
  $$ values ('Alfa Construct S.R.L.', 3), ('Beta', 0), ('Delta', 0), ('Epsilon', 0), ('Gama', 0) $$,
  'employees whose hiring test waits'
);

select results_eq(
  $$ select legal_name, signatures_pending_count from public.client_list order by legal_name $$,
  $$ values ('Alfa Construct S.R.L.', 1), ('Beta', 0), ('Delta', 0), ('Epsilon', 0), ('Gama', 0) $$,
  'pending trainee slots, not the trainer''s'
);

select results_eq(
  $$ select legal_name, documents_behind from public.client_list order by legal_name $$,
  $$ values ('Alfa Construct S.R.L.', true), ('Beta', false), ('Delta', false), ('Epsilon', false), ('Gama', false) $$,
  'a client with a document behind its template'
);

select is_empty(
  $$ select l.id from public.client_list l
     where l.missing_basic_data <> exists (
       select 1 from public.clients_missing_basic_data m where m.client_id = l.id) $$,
  'missing basic data as the readiness check finds it'
);

select results_eq(
  $$ select legal_name, contract_ending_within_60_days from public.client_list order by legal_name $$,
  $$ values ('Alfa Construct S.R.L.', true), ('Beta', false), ('Delta', false), ('Epsilon', false), ('Gama', false) $$,
  'an owner sees the contract that ends within 60 days, never one that renews'
);

select is(
  (select search_text from public.client_list where legal_name = 'Alfa Construct S.R.L.'),
  'alfa construct s.r.l. 1590082 bacau',
  'the search text holds the name, the CUI and the locality without diacritics'
);

select is(
  (select public.client_search_text(c) from public.clients c where c.legal_name = 'Beta'),
  'beta 14399840 ',
  'the same text for a lead, read from the clients table'
);

select results_eq(
  $$ select legal_name from public.client_list
     where documentation_state in ('none', 'in_progress') and training_rank <> 3
     order by training_rank, training_flagged_count desc, legal_name $$,
  $$ values ('Alfa Construct S.R.L.'), ('Gama') $$,
  'filters and the urgency order read the columns over every client'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select legal_name, contract_ending_within_60_days from public.client_list where legal_name = 'Alfa Construct S.R.L.' $$,
  $$ values ('Alfa Construct S.R.L.', false) $$,
  'a specialist reads no contract'
);

select results_eq(
  $$ select training_attention_count, documentation_state::text from public.client_list where legal_name = 'Alfa Construct S.R.L.' $$,
  $$ values (2, 'in_progress') $$,
  'a specialist reads the same training and documentation'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select results_eq(
  $$ select legal_name, training_employee_count from public.client_list $$,
  $$ values ('Client of B', 0) $$,
  'another organization sees only its own clients'
);

reset role;

select is(
  (select count(*)::integer from public.built_in_document_types()),
  52,
  'every built-in document of both sets'
);

select * from finish();
rollback;
