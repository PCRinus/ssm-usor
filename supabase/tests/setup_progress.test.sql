begin;
select plan(46);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'joiner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second-owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('eeeeeeee-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-c@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.profiles (user_id, full_name, professional_title) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ioana Popescu', 'Inginer SSM'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Mihai Ionescu', null),
  ('cccccccc-0000-4000-8000-000000000001', 'Elena Radu', null),
  ('dddddddd-0000-4000-8000-000000000001', 'Dan Barbu', null),
  ('dddddddd-0000-4000-8000-000000000002', 'Ana Barbu', null),
  ('eeeeeeee-0000-4000-8000-000000000001', 'Emil Cristea', null);

insert into public.organizations (
  id, name, legal_name, cui, county_code, locality, address_line, legal_representative_name, legal_representative_role,
  authorization_certificate_number, authorization_certificate_date, authorization_certificate_issuer,
  fire_safety_technician_name, fire_safety_technician_certificate
) values
  ('11111111-0000-4000-8000-000000000001', 'Org A', 'Prevenția SRL', '1590082', 'B', 'București', 'Calea Victoriei 1', 'Ioana Popescu', 'Administrator',
   '123', '2024-03-01', 'ITM București', 'Mihai Ionescu', null),
  ('22222222-0000-4000-8000-000000000002', 'Org B', 'Firma B SRL', null, 'CJ', 'Cluj-Napoca', '  ', 'Dan Barbu', null,
   null, null, null, null, null),
  ('33333333-0000-4000-8000-000000000003', 'Org C', null, null, null, null, null, null, null,
   null, null, null, null, null);

insert into public.organization_members (user_id, organization_id, role, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner', '2026-01-01'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist', '2026-01-02'),
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist', '2026-09-01'),
  ('dddddddd-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner', '2026-01-01'),
  ('dddddddd-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'owner', '2026-01-01'),
  ('eeeeeeee-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'owner', '2026-01-01');

insert into public.clients (id, organization_id, legal_name, cui, stage, legal_representative_name, legal_representative_role, created_by, created_at) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Atelier', '14399840', 'client', 'Ion Pop', 'Administrator', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-02-01'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Birou', '22', 'client', null, null, null, '2026-06-01'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Lead', '18547290', 'lead', null, null, 'aaaaaaaa-0000-4000-8000-000000000001', '2026-07-01');

insert into public.client_workplaces (id, organization_id, client_id, name, created_by) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sediu', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Depozit', 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.job_positions (id, organization_id, client_id, name, needs_protective_equipment, needs_instructions, needs_fire_instructions, created_by) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', true, true, false, 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, created_by) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Marin', 'Dan', 'Sudor', '2025-01-01', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Ion Pop', 'Administrator',
   '{workplace_manager,first_aid,risk_evaluation_team,imminent_danger,fire_safety_coordinator,fire_intervention_leader}', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.risk_evaluations (organization_id, client_id, kind, job_position_id, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'job_position', 'b1b1b1b1-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.client_fire_safety (client_id, organization_id, created_by) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.document_generations (organization_id, client_id, issue_date, document_group, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01', 'documentation_set', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-01', 'fire_safety_set', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '2026-10-02', 'documentation_set', 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'decision_training', 'Decizie', 'documentation_set', false),
  ('d1d1d1d1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'service_contract', 'Contract', 'other', true);

insert into public.document_revisions (organization_id, document_id, revision, status, docx_path, issued_at, docx_sha256, issued_by) values
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'issued', '11111111-0000-4000-8000-000000000001/d1/1.docx', now(), repeat('a', 64), 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000001', 2, 'draft', '11111111-0000-4000-8000-000000000001/d1/2.docx', null, null, null),
  ('11111111-0000-4000-8000-000000000001', 'd1d1d1d1-0000-4000-8000-000000000002', 1, 'issued', '11111111-0000-4000-8000-000000000001/d2/1.docx', now(), repeat('b', 64), 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, source, created_by) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', '2026-10-01', 120, 'Material', 'Ion POP', 'Șef atelier', 'app', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2025-10-01', 120, 'Material', 'Ion POP', 'Șef atelier', 'paper', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', '2026-10-01', 120, 'Material', 'Ion POP', 'Șef atelier', 'app', 'dddddddd-0000-4000-8000-000000000001');

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('7a7a7a7a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000002', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor');

insert into public.participant_invitations (organization_id, client_id, kind, employee_id, full_name, channel, address, invited_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', 'dan@example.com', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Ion Pop', 'email', 'ion@example.com', 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.signature_requests (organization_id, client_id, training_record_id, slot, state, issued_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'signed', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', 'pending', 'aaaaaaaa-0000-4000-8000-000000000001');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select organization_id, legal_name_filled, cui_filled, address_filled, representative_name_filled, representative_role_filled,
            certificate_filled, fire_safety_technician_filled, company_done, authorizations_done
     from public.setup_progress() $$,
  $$ values ('11111111-0000-4000-8000-000000000001'::uuid, true, true, true, true, true, true, false, true, false) $$,
  'the organization steps read the organization''s columns, field group by field group'
);

select results_eq(
  $$ select professional_title_done from public.setup_progress() $$,
  $$ values (true) $$,
  'a professional title on the caller''s profile ticks its step'
);

select results_eq(
  $$ select client_done from public.setup_progress() $$,
  $$ values (false) $$,
  'a lead the caller created is not a client'
);

select results_eq(
  $$ select workplaces_positions_done from public.setup_progress() $$,
  $$ values (false) $$,
  'a workplace without a job position of the caller''s does not tick workplaces and positions'
);

select results_eq(
  $$ select generate_sets_done from public.setup_progress() $$,
  $$ values (false) $$,
  'one of the two sets does not tick generating them'
);

select results_eq(
  $$ select issue_document_done from public.setup_progress() $$,
  $$ values (false) $$,
  'issuing the service contract is not issuing a document of the sets'
);

select results_eq(
  $$ select portal_invitation_done from public.setup_progress() $$,
  $$ values (false) $$,
  'inviting a client administrator is not inviting an employee'
);

select results_eq(
  $$ select training_done from public.setup_progress() $$,
  $$ values (false) $$,
  'a training recorded from paper does not tick the training step'
);

select results_eq(
  $$ select signature_done from public.setup_progress() $$,
  $$ values (false) $$,
  'a signature request still pending does not tick the signature step'
);

select results_eq(
  $$ select employees_done, responsible_persons_done, risk_evaluation_done, fire_safety_data_done from public.setup_progress() $$,
  $$ values (false, false, false, false) $$,
  'the specialist''s work does not tick the owner''s steps'
);

select results_eq(
  $$ select owner_names from public.setup_progress() $$,
  $$ values ('{Ioana Popescu}'::text[]) $$,
  'the owner is named'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_done, workplaces_positions_done, employees_done, responsible_persons_done, risk_evaluation_done,
            fire_safety_data_done, generate_sets_done, issue_document_done, portal_invitation_done, training_done, signature_done
     from public.setup_progress() $$,
  $$ values (true, true, true, true, true, true, true, true, true, true, true) $$,
  'every member step ticks from the caller''s own rows'
);

select results_eq(
  $$ select company_done, authorizations_done, professional_title_done from public.setup_progress() $$,
  $$ values (true, false, false) $$,
  'a specialist reads the organization steps as the owner left them, and their own title'
);

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_done, workplaces_positions_done, employees_done, responsible_persons_done, risk_evaluation_done,
            fire_safety_data_done, generate_sets_done, issue_document_done, portal_invitation_done, training_done, signature_done,
            professional_title_done
     from public.setup_progress() $$,
  $$ values (false, false, false, false, false, false, false, false, false, false, false, false) $$,
  'a specialist who joined an organization already set up has done no step'
);

select results_eq(
  $$ select company_done, authorizations_done from public.setup_progress() $$,
  $$ values (true, false) $$,
  'the joiner reads the organization steps as everyone else'
);

select results_eq(
  $$ select has_client, has_client_with_workplace_and_position, has_client_with_position, has_client_with_basic_data,
            has_draft_revision, has_client_with_employee, has_training_record
     from public.setup_progress() $$,
  $$ values (true, true, true, true, true, true, true) $$,
  'the organization''s work unlocks every step for the joiner'
);

select results_eq(
  $$ select furthest_client_id from public.setup_progress() $$,
  $$ values ('c1c1c1c1-0000-4000-8000-000000000001'::uuid) $$,
  'the furthest client is the one with the most steps done by anyone, before a newer one'
);

reset role;
update public.organizations
  set fire_safety_technician_certificate = 'Atestat 42'
  where id = '11111111-0000-4000-8000-000000000001';
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');

select results_eq(
  $$ select fire_safety_technician_filled, authorizations_done from public.setup_progress() $$,
  $$ values (true, true) $$,
  'an owner''s filling ticks the organization step for every member'
);

reset role;
insert into public.clients (id, organization_id, legal_name, cui, stage, created_by, created_at) values
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Importat', '5022670', 'client', 'cccccccc-0000-4000-8000-000000000001', '2026-10-01');
insert into public.client_workplaces (organization_id, client_id, name, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'Sediu', 'cccccccc-0000-4000-8000-000000000001');
insert into public.job_positions (organization_id, client_id, name, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'Vânzător', 'cccccccc-0000-4000-8000-000000000001');
insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles, created_by) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'Vasile Matei', 'Administrator', '{first_aid}', 'cccccccc-0000-4000-8000-000000000001');
insert into public.client_fire_safety (client_id, organization_id, created_by) values
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001');
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');

select results_eq(
  $$ select client_done, workplaces_positions_done, responsible_persons_done, fire_safety_data_done, employees_done
     from public.setup_progress() $$,
  $$ values (true, true, true, true, false) $$,
  'a confirmed import''s rows tick the steps of the member written as their author'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select results_eq(
  $$ select organization_id from public.setup_progress() $$,
  $$ values ('22222222-0000-4000-8000-000000000002'::uuid) $$,
  'the caller reads one row, for their own organization'
);

select results_eq(
  $$ select legal_name_filled, cui_filled, address_filled, representative_name_filled, representative_role_filled,
            certificate_filled, fire_safety_technician_filled, company_done, authorizations_done
     from public.setup_progress() $$,
  $$ values (true, false, false, true, false, false, false, false, false) $$,
  'a blank or missing column leaves its field group empty, and an address needs its county, locality and line'
);

select results_eq(
  $$ select training_done, has_client, has_training_record, furthest_client_id from public.setup_progress() $$,
  $$ values (false, false, false, null::uuid) $$,
  'rows in another organization never count, not even the caller''s own'
);

select results_eq(
  $$ select owner_names from public.setup_progress() $$,
  $$ values ('{Ana Barbu,Dan Barbu}'::text[]) $$,
  'every owner is named, in order'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client, has_client_with_workplace_and_position, has_client_with_position, has_client_with_basic_data,
            has_draft_revision, has_client_with_employee, has_training_record, furthest_client_id, owner_names
     from public.setup_progress() $$,
  $$ values (false, false, false, false, false, false, false, null::uuid, '{Emil Cristea}'::text[]) $$,
  'an empty organization locks every step and has no client to open'
);

reset role;
insert into public.clients (id, organization_id, legal_name, cui, stage, created_at) values
  ('c3c3c3c3-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'Lead C', '11', 'lead', '2026-03-01');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client, furthest_client_id from public.setup_progress() $$,
  $$ values (false, null::uuid) $$,
  'a lead is no client for the locks'
);

reset role;
insert into public.clients (id, organization_id, legal_name, cui, stage, created_at) values
  ('c3c3c3c3-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', 'Primul', '12', 'client', '2026-04-01'),
  ('c3c3c3c3-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003', 'Arhivat', '13', 'client', '2026-04-02');
insert into public.job_positions (id, organization_id, client_id, name) values
  ('b3b3b3b3-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'Casier'),
  ('b3b3b3b3-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000003', 'Casier');
insert into public.client_workplaces (organization_id, client_id, name) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000003', 'Sediu');
insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('e3e3e3e3-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000003', 'b3b3b3b3-0000-4000-8000-000000000002', 'Arhivat', 'Ion', 'Casier', '2025-01-01');
insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title) values
  ('a3a3a3a3-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000003', 'ssm', 'workplace', '2026-10-01', 120, 'Material', 'Ion POP', 'Șef');
insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000003', 'a3a3a3a3-0000-4000-8000-000000000001', 'workplace', 'e3e3e3e3-0000-4000-8000-000000000001', 'Casier');
insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d3d3d3d3-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000003', 'decision_training', 'Decizie', 'documentation_set', false);
insert into public.document_revisions (organization_id, document_id, revision, status, docx_path) values
  ('33333333-0000-4000-8000-000000000003', 'd3d3d3d3-0000-4000-8000-000000000001', 1, 'draft', '33333333-0000-4000-8000-000000000003/d1/1.docx');
update public.clients set archived_at = now() where id = 'c3c3c3c3-0000-4000-8000-000000000003';
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client, has_client_with_position, has_client_with_workplace_and_position, has_client_with_basic_data
     from public.setup_progress() $$,
  $$ values (true, true, false, false) $$,
  'a client with a job position unlocks the steps that need one, and still misses its basic data'
);

select results_eq(
  $$ select has_client_with_employee, has_training_record, has_draft_revision from public.setup_progress() $$,
  $$ values (false, false, false) $$,
  'an archived client''s workplace, employee, training record and draft unlock nothing'
);

select results_eq(
  $$ select furthest_client_id from public.setup_progress() $$,
  $$ values ('c3c3c3c3-0000-4000-8000-000000000002'::uuid) $$,
  'a job position alone is not a step done, and an archived client is never opened'
);

reset role;
insert into public.clients (id, organization_id, legal_name, cui, stage, legal_representative_name, legal_representative_role, created_at) values
  ('c3c3c3c3-0000-4000-8000-000000000004', '33333333-0000-4000-8000-000000000003', 'Al doilea', '14', 'client', 'Ana Vlad', 'Administrator', '2026-05-01');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select furthest_client_id from public.setup_progress() $$,
  $$ values ('c3c3c3c3-0000-4000-8000-000000000004'::uuid) $$,
  'on a tie the newest client is the furthest'
);

reset role;
insert into public.client_workplaces (organization_id, client_id, name) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'Magazin');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client_with_workplace_and_position, furthest_client_id from public.setup_progress() $$,
  $$ values (true, 'c3c3c3c3-0000-4000-8000-000000000002'::uuid) $$,
  'a workplace beside a job position unlocks the employees and counts as a step done'
);

reset role;
insert into public.employees (organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'b3b3b3b3-0000-4000-8000-000000000001', 'Plecat', 'Ion', 'Casier', '2025-01-01', 'terminated', '2026-01-01');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client_with_employee from public.setup_progress() $$,
  $$ values (false) $$,
  'an employee who left unlocks nothing'
);

reset role;
insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('e3e3e3e3-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'b3b3b3b3-0000-4000-8000-000000000001', 'Activ', 'Ana', 'Casier', '2025-01-01');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client_with_employee from public.setup_progress() $$,
  $$ values (true) $$,
  'a current employee unlocks the portal invitation and the training'
);

reset role;
insert into public.job_positions (organization_id, client_id, name, needs_protective_equipment, needs_instructions, needs_fire_instructions) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000004', 'Contabil', false, false, false);
insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000004', 'Ana Vlad', 'Administrator',
   '{workplace_manager,first_aid,risk_evaluation_team,imminent_danger,fire_safety_coordinator,fire_intervention_leader}');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_client_with_basic_data from public.setup_progress() $$,
  $$ values (true) $$,
  'a client with all its basic data unlocks generating the sets'
);

reset role;
insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d3d3d3d3-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'service_contract', 'Contract', 'other', true);
insert into public.document_revisions (organization_id, document_id, revision, status, docx_path) values
  ('33333333-0000-4000-8000-000000000003', 'd3d3d3d3-0000-4000-8000-000000000002', 1, 'draft', '33333333-0000-4000-8000-000000000003/d2/1.docx');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_draft_revision from public.setup_progress() $$,
  $$ values (false) $$,
  'a draft of the service contract does not unlock issuing a document'
);

reset role;
insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('d3d3d3d3-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'fire_safety_decision', 'Decizie PSI', 'fire_safety_set', false);
insert into public.document_revisions (organization_id, document_id, revision, status, docx_path) values
  ('33333333-0000-4000-8000-000000000003', 'd3d3d3d3-0000-4000-8000-000000000003', 1, 'draft', '33333333-0000-4000-8000-000000000003/d3/1.docx');
insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title) values
  ('a3a3a3a3-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'ssm', 'workplace', '2026-10-01', 120, 'Material', 'Ion POP', 'Șef');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_draft_revision, has_training_record from public.setup_progress() $$,
  $$ values (true, false) $$,
  'a draft of a set unlocks issuing, and a training without a record does not unlock the signature'
);

reset role;
insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('33333333-0000-4000-8000-000000000003', 'c3c3c3c3-0000-4000-8000-000000000002', 'a3a3a3a3-0000-4000-8000-000000000002', 'workplace', 'e3e3e3e3-0000-4000-8000-000000000002', 'Casier');
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');

select results_eq(
  $$ select has_training_record from public.setup_progress() $$,
  $$ values (true) $$,
  'a training with a record unlocks the signature'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.setup_progress() $$,
  '42501',
  null,
  'anonymous callers cannot read the setup progress'
);

reset role;

select throws_ok(
  $$ insert into public.setup_step_skips (user_id, step) values ('cccccccc-0000-4000-8000-000000000001', 'professional-title') $$,
  '23514',
  null,
  'only a member step can be skipped'
);

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');

insert into public.setup_step_skips (user_id, step) values
  ('cccccccc-0000-4000-8000-000000000001', 'responsible-persons'),
  ('cccccccc-0000-4000-8000-000000000001', 'signature');

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

insert into public.setup_step_skips (user_id, step) values ('bbbbbbbb-0000-4000-8000-000000000001', 'training');

select results_eq(
  $$ select step from public.setup_step_skips $$,
  $$ values ('training') $$,
  'a user reads only their own skipped steps'
);

select throws_ok(
  $$ insert into public.setup_step_skips (user_id, step) values ('cccccccc-0000-4000-8000-000000000001', 'client') $$,
  '42501',
  null,
  'a user cannot skip a step for someone else'
);

select throws_ok(
  $$ insert into public.setup_step_skips (user_id, step, skipped_at) values ('bbbbbbbb-0000-4000-8000-000000000001', 'client', '2020-01-01') $$,
  '42501',
  null,
  'a user cannot set when they skipped a step'
);

select throws_ok(
  $$ insert into public.setup_step_skips (user_id, step) values ('bbbbbbbb-0000-4000-8000-000000000001', 'training') $$,
  '23505',
  null,
  'a step is skipped once'
);

delete from public.setup_step_skips where step = 'signature';

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000001');

delete from public.setup_step_skips where step = 'signature';

select results_eq(
  $$ select step from public.setup_step_skips order by step $$,
  $$ values ('responsible-persons') $$,
  'a user undoes only their own skips'
);

update public.profiles
  set setup_guide_closed_at = '2026-10-28 10:00+00', setup_guide_finished_at = '2026-10-28 11:00+00'
  where user_id in ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001');

reset role;

select results_eq(
  $$ select user_id, setup_guide_closed_at, setup_guide_finished_at from public.profiles
     where user_id in ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001') order by user_id $$,
  $$ values
    ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, null::timestamptz, null::timestamptz),
    ('cccccccc-0000-4000-8000-000000000001'::uuid, '2026-10-28 10:00+00'::timestamptz, '2026-10-28 11:00+00'::timestamptz) $$,
  'a user records closing and finishing the guide on their own profile only'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.setup_step_skips $$,
  '42501',
  null,
  'anonymous callers cannot read skipped steps'
);

reset role;

delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.setup_step_skips where user_id = 'cccccccc-0000-4000-8000-000000000001'),
  0::bigint,
  'deleting the account deletes its skipped steps'
);

select * from finish();
rollback;
