begin;
select plan(19);

-- Dates are counted back from the Romanian day the views use, so the states hold on any day.
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

insert into public.clients (id, organization_id, legal_name, cui, stage, legal_representative_name, legal_representative_role, worker_training_interval_months, administrative_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Complete', '1590082', 'client', 'Ion Popescu', 'Administrator', 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Gaps', '14399840', 'client', '   ', null, 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived', '22', 'client', null, null, 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Empty', '33', 'client', 'Ana Ionescu', 'Administrator', null, null),
  ('c1c1c1c1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'Lead', '18547290', 'lead', null, null, null, null),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client', null, null, 3, 6);

insert into public.client_fire_safety (client_id, organization_id, administrative_training_interval_months, worker_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 6, 6);

insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles, archived_at) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Ion Popescu', 'Administrator', '{workplace_manager,first_aid,risk_evaluation_team,imminent_danger}', null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Dan Marin', 'Șef tură', '{fire_safety_coordinator,fire_intervention_leader}', null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Elena Radu', 'Șef atelier', '{workplace_manager}', null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Fost Responsabil', 'Operator', '{first_aid}', now());

insert into public.job_positions (id, organization_id, client_id, name, staff_category, needs_protective_equipment, needs_instructions, needs_fire_instructions, archived_at) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution', true, true, false, null),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Instructions undecided', 'execution', false, null, null, null),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Archived undecided', 'execution', null, null, null, now()),
  ('b1b1b1b1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor', 'execution', null, null, null, null),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor', 'execution', null, null, null, null);

create temp table day as select (now() at time zone 'Europe/Bucharest')::date as today;
grant select on day to authenticated;

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at, archived_at)
select v.id::uuid, v.organization_id::uuid, v.client_id::uuid, v.job_position_id::uuid, v.last_name, 'X', 'Sudor', v.hired_at, v.status::public.employee_status, v.terminated_at, v.archived_at
from day d, lateral (values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Overdue SSM', d.today - 400, 'active', null::date, null::timestamptz),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Due SSM', d.today - 400, 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Current SSM', d.today - 400, 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Untrained', date_trunc('month', d.today)::date, 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Left', d.today - 400, 'terminated', (date_trunc('month', d.today) - interval '2 months')::date - 1, null),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Archived', d.today - 400, 'active', null, now()),
  ('e1e1e1e1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000004', 'Of archived client', d.today - 400, 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Also due SSM', d.today - 400, 'active', null, null),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', 'Of B', (date_trunc('month', d.today) - interval '5 months')::date, 'active', null, null)
) as v (id, organization_id, client_id, job_position_id, last_name, hired_at, status, terminated_at, archived_at);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
select v.id::uuid, '11111111-0000-4000-8000-000000000001', v.client_id::uuid, v.domain::public.training_domain, 'workplace', d.today - v.days_ago, 120, 'Material', 'Ion POP', 'Șef atelier'
from day d, (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 120),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 75),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 10),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 10),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 200),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 160),
  ('a1a1a1a1-0000-4000-8000-000000000007', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 30)
) as v (id, client_id, domain, days_ago);

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation)
select v.id::uuid, t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('7a7a7a7a-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('7a7a7a7a-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000002'),
  ('7a7a7a7a-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('7a7a7a7a-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('7a7a7a7a-0000-4000-8000-000000000005', 'a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000002'),
  ('7a7a7a7a-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000006', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('7a7a7a7a-0000-4000-8000-000000000007', 'a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000009'),
  ('7a7a7a7a-0000-4000-8000-000000000008', 'a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000009'),
  ('7a7a7a7a-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000007', 'e1e1e1e1-0000-4000-8000-000000000007')
) as v (id, training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source)
select '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'psi', 'hiring', d.today - 5, 'Test de verificare a cunoștințelor la angajare (TASU)', 'Mihai VECHI', 'Cadru tehnic PSI', 'paper'
from day d;

insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id, issued_at, state, voided_at, void_reason) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', null, '2026-10-01 08:00+00', 'pending', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainee', null, '2026-10-10 08:00+00', 'pending', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainee', null, '2026-09-01 08:00+00', 'void', now(), 'Greșit'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainer', null, '2026-09-01 08:00+00', 'pending', null, null),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', '7a7a7a7a-0000-4000-8000-000000000009', 'trainee', null, '2026-09-01 08:00+00', 'pending', null, null);

-- Made-up types, so the built-in templates a local stack has registered change nothing.
select from public.register_built_in_template_version('dashboard_test', 'Dashboard test', 'built-in/dashboard_test/1.docx', repeat('1', 64), 'correction', null);
select from public.register_built_in_template_version('dashboard_test', 'Dashboard test', 'built-in/dashboard_test/2.docx', repeat('2', 64), 'legal', 'Art. 7 în forma în vigoare.');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only, period) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Draft', 'documentation_set', false, null),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_first_aid', 'Draft over issued', 'documentation_set', false, null),
  ('d1d1d1d1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'cover_decisions', 'Issued', 'documentation_set', false, null),
  ('d1d1d1d1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'decision_training', 'Draft of archived client', 'documentation_set', false, null),
  ('d1d1d1d1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'Last year', 'fire_safety_set', false, extract(year from (select today from day))::smallint - 1),
  ('d1d1d1d1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'fire_annual_report', 'This year', 'fire_safety_set', false, extract(year from (select today from day))::smallint),
  ('d1d1d1d1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'dashboard_test', 'Behind', 'documentation_set', false, null),
  ('d1d1d1d1-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true, null),
  ('d1d1d1d1-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'service_contract', 'Contract', 'other', true, null),
  ('d1d1d1d1-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000005', 'service_contract', 'Contract', 'other', true, null);

insert into public.document_revisions (organization_id, document_id, revision, status, template_version_id, docx_path, issued_at, docx_sha256)
select '11111111-0000-4000-8000-000000000001', v.document_id::uuid, v.revision, v.status::public.document_revision_status,
  (select id from public.document_template_versions where sha256 = repeat(v.template_sha, 64)),
  '11111111-0000-4000-8000-000000000001/' || right(v.document_id, 2) || '/' || v.revision || '.docx',
  case when v.status = 'issued' then now() end,
  case when v.status = 'issued' then repeat('a', 64) end
from (values
  ('d1d1d1d1-0000-4000-8000-000000000001', 1, 'draft', null),
  ('d1d1d1d1-0000-4000-8000-000000000002', 1, 'issued', null),
  ('d1d1d1d1-0000-4000-8000-000000000002', 2, 'draft', null),
  ('d1d1d1d1-0000-4000-8000-000000000003', 1, 'issued', null),
  ('d1d1d1d1-0000-4000-8000-000000000004', 1, 'draft', null),
  ('d1d1d1d1-0000-4000-8000-000000000005', 1, 'draft', null),
  ('d1d1d1d1-0000-4000-8000-000000000006', 1, 'issued', null),
  ('d1d1d1d1-0000-4000-8000-000000000007', 1, 'issued', '1'),
  ('d1d1d1d1-0000-4000-8000-000000000011', 1, 'issued', null),
  ('d1d1d1d1-0000-4000-8000-000000000012', 1, 'issued', null),
  ('d1d1d1d1-0000-4000-8000-000000000013', 1, 'issued', null)
) as v (document_id, revision, status, template_sha);

insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256, source, confirmed_at)
select r.id, r.organization_id, r.document_id, regexp_replace(r.docx_path, '\.docx$', '.signed.pdf'), repeat('b', 64), 'client', v.confirmed_at
from (values
  ('d1d1d1d1-0000-4000-8000-000000000011', null::timestamptz),
  ('d1d1d1d1-0000-4000-8000-000000000012', now()),
  ('d1d1d1d1-0000-4000-8000-000000000013', null)
) as v (document_id, confirmed_at)
join public.document_revisions r on r.document_id = v.document_id::uuid and r.revision = 1;

insert into public.document_revisions (organization_id, document_id, revision, status, docx_path) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000011', 2, 'draft', '11111111-0000-4000-8000-000000000001/11/2.docx');

-- Each starts so that it ends in 29 days, unless it starts later.
insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months, renews_automatically)
select '11111111-0000-4000-8000-000000000001', v.client_id::uuid, v.number, d.today - 400,
  (d.today - interval '12 months')::date + 30 + v.later_days, 12, v.renews
from day d, (values
  ('c1c1c1c1-0000-4000-8000-000000000001', 1, false, 0),
  ('c1c1c1c1-0000-4000-8000-000000000002', 2, true, 0),
  ('c1c1c1c1-0000-4000-8000-000000000004', 3, false, 61),
  ('c1c1c1c1-0000-4000-8000-000000000005', 4, false, 0)
) as v (client_id, number, renews, later_days);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select ssm_overdue, ssm_due, ssm_untrained, ssm_current from public.dashboard_summary $$,
  $$ values (1, 2, 1, 1) $$,
  'occupational safety counts each current employee of an active client by state'
);

select results_eq(
  $$ select psi_overdue, psi_due, psi_untrained, psi_current from public.dashboard_summary $$,
  $$ values (1, 1, 1, 2) $$,
  'fire safety counts its own states'
);

select results_eq(
  $$ select employees, active_clients from public.dashboard_summary $$,
  $$ values (5, 3) $$,
  'no leaver, archived employee, archived client or lead counts'
);

select results_eq(
  $$ select next_due_on, next_due_count from public.dashboard_summary $$,
  $$ select ((today - 75) + interval '3 months')::date, 2 from day $$,
  'the nearest due date and how many employees share it'
);

select results_eq(
  $$ select tests_pending from public.dashboard_summary $$,
  $$ values (3) $$,
  'a hiring test waits for every trained employee who has not passed it'
);

select results_eq(
  $$ select drafts_to_issue, documents_behind from public.dashboard_summary $$,
  $$ values (2, 1) $$,
  'drafts newest in their documents, never the contract, an archived client''s or an earlier year''s'
);

select results_eq(
  $$ select employee_signatures_pending, employee_signatures_oldest_issued_at from public.dashboard_summary $$,
  $$ values (2, '2026-10-01 08:00+00'::timestamptz) $$,
  'pending trainee slots of active clients, with the oldest'
);

select results_eq(
  $$ select contracts_received_to_confirm, contracts_ending_within_60_days from public.dashboard_summary $$,
  $$ values (1, 1) $$,
  'an owner counts the copy waiting beside a correction and the contract that stops, never a lead''s or one that renews'
);

select results_eq(
  $$ select clients_missing_data from public.dashboard_summary $$,
  $$ values (2) $$,
  'clients missing basic data'
);

select results_eq(
  $$ select client_name, missing from public.clients_missing_basic_data order by client_name $$,
  $$ values
    ('Empty', '{responsible.workplace_manager,responsible.first_aid,responsible.risk_evaluation_team,responsible.imminent_danger,responsible.fire_safety_coordinator,responsible.fire_intervention_leader,positions.any}'::text[]),
    ('Gaps', '{client.representativeName,client.representativeRole,responsible.first_aid,responsible.risk_evaluation_team,responsible.imminent_danger,responsible.fire_safety_coordinator,responsible.fire_intervention_leader,positions.instructions,fire.instructions}'::text[]) $$,
  'what each active client misses, without archived people and positions, and never a lead or an archived client'
);

select results_eq(
  $$ select month, employees from public.dashboard_employees_at_month_ends('11111111-0000-4000-8000-000000000001') $$,
  $$ select (date_trunc('month', today) - make_interval(months => 11 - i))::date,
            case when i <= 7 then 5 when i <= 10 then 4 else 5 end
     from day, generate_series(0, 11) as i
     order by 1 $$,
  'twelve month ends: the leaver counts until the month they left, the new hire from this month'
);

select results_eq(
  $$ select count(*)::integer, sum(employees)::integer
     from public.dashboard_employees_at_month_ends('22222222-0000-4000-8000-000000000002') $$,
  $$ values (12, 0) $$,
  'another organization''s employees are not read'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select organization_id, contracts_received_to_confirm, contracts_ending_within_60_days, drafts_to_issue, employees
     from public.dashboard_summary $$,
  $$ values ('11111111-0000-4000-8000-000000000001'::uuid, 0, 0, 2, 5) $$,
  'a specialist reads the same numbers but no contract'
);

select results_eq(
  $$ select employee_signatures_pending, clients_missing_data from public.dashboard_summary $$,
  $$ values (2, 2) $$,
  'a specialist counts the signatures and the gaps alike'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select results_eq(
  $$ select organization_id, employees, ssm_untrained, active_clients from public.dashboard_summary $$,
  $$ values ('22222222-0000-4000-8000-000000000002'::uuid, 1, 1, 1) $$,
  'another organization reads only its own row'
);

select results_eq(
  $$ select month, employees from public.dashboard_employees_at_month_ends('22222222-0000-4000-8000-000000000002') $$,
  $$ select (date_trunc('month', today) - make_interval(months => 11 - i))::date,
            case when i < 6 then 0 else 1 end
     from day, generate_series(0, 11) as i
     order by 1 $$,
  'the months before the first hire count none'
);

select results_eq(
  $$ select client_name from public.clients_missing_basic_data $$,
  $$ values ('Client of B') $$,
  'another organization lists only its own clients'
);

select results_eq(
  $$ select next_due_on, next_due_count, employee_signatures_oldest_issued_at from public.dashboard_summary $$,
  $$ values (null::date, 0, null::timestamptz) $$,
  'no due date and no signature leave nulls'
);

reset role;

select is(
  (select count(*)::integer from public.dashboard_summary),
  2,
  'one row per organization'
);

select * from finish();
rollback;
