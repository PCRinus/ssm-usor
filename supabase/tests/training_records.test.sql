begin;
select plan(45);

-- Dates are counted back from the Romanian day the view uses, so the states hold on any day.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage, worker_training_interval_months, administrative_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'client', 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Undecided of A', '14399840', 'client', null, null),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', 'client', 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Lead of A', '18547290', 'lead', null, null),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client', 3, 6);

insert into public.client_fire_safety (client_id, organization_id, administrative_training_interval_months, worker_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 6, 2);

insert into public.job_positions (id, organization_id, client_id, name, staff_category, training_interval_months) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution', null),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil', 'technical_administrative', null),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Stivuitorist', 'execution', 1),
  ('b1b1b1b1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor', 'execution', null),
  ('b1b1b1b1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor', 'execution', null),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor', 'execution', null);

create temp table day as select (now() at time zone 'Europe/Bucharest')::date as today;
grant select on day to authenticated;

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at)
select v.id::uuid, v.organization_id::uuid, v.client_id::uuid, v.job_position_id::uuid, v.last_name, 'X', v.job_title, d.today - v.hired_days_ago, v.status::public.employee_status,
  case when v.status = 'terminated' then d.today - 1 end
from day d, (values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Periodic', 'Sudor', 700, 'active'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000002', 'Administrativ', 'Contabil', 40, 'active'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000003', 'Override', 'Stivuitorist', 120, 'active'),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Neinstruit', 'Sudor', 20, 'active'),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Plecat', 'Sudor', 300, 'terminated'),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000004', 'Nedecis', 'Sudor', 50, 'active'),
  ('e1e1e1e1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Introductiv', 'Sudor', 10, 'active'),
  ('e1e1e1e1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000005', 'Arhivat', 'Sudor', 10, 'active'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', 'Ionescu', 'Sudor', 30, 'active')
) as v (id, organization_id, client_id, job_position_id, last_name, job_title, hired_days_ago, status);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, supplementary_reason)
select v.id::uuid, v.organization_id::uuid, v.client_id::uuid, v.domain::public.training_domain, v.phase::public.training_phase, d.today - v.days_ago, 120, 'Material', 'Ion POP', 'Șef atelier', v.reason::public.supplementary_training_reason
from day d, (values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 400, null),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', 80, null),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'supplementary', 5, 'new_equipment'),
  ('a1a1a1a1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 30, null),
  ('a1a1a1a1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 100, null),
  ('a1a1a1a1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', 10, null),
  ('a1a1a1a1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'ssm', 'workplace', 45, null),
  ('a1a1a1a1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', 10, null),
  ('a1a1a1a1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 'periodic', 5, null),
  ('a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'introductory_general', 20, null)
) as v (id, organization_id, client_id, domain, phase, days_ago, reason);

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
select t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000002'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000005'),
  ('a1a1a1a1-0000-4000-8000-000000000007', 'e1e1e1e1-0000-4000-8000-000000000006'),
  ('a1a1a1a1-0000-4000-8000-000000000008', 'e1e1e1e1-0000-4000-8000-000000000007'),
  ('a1a1a1a1-0000-4000-8000-000000000009', 'e1e1e1e1-0000-4000-8000-000000000008'),
  ('a2a2a2a2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001')
) as v (training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create function pg_temp.status(p_employee_id uuid)
returns public.employee_training_status language sql as $$
  select * from public.employee_training_status where employee_id = p_employee_id;
$$;

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;


select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'supplementary', '2026-01-10', 60, 'M', 'T', 'F') $$,
  '23514', null, 'a supplementary training needs its reason'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, supplementary_reason)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60, 'M', 'T', 'F', 'after_accident') $$,
  '23514', null, 'only a supplementary training has a reason'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60, 'M', 'T', 'F', 'Dan MARIN') $$,
  '23514', null, 'a verifier has a name and a function, or neither'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 601, 'M', 'T', 'F') $$,
  '23514', null, 'a training lasts at most 600 minutes'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60, '   ', 'T', 'F') $$,
  '23514', null, 'the material taught is not blank'
);

select throws_ok(
  $$ insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on, admitted_by_name, admitted_by_job_title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000002', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000004', 'Sudor', '2026-01-10', 'Ion POP', 'Șef atelier') $$,
  '23514', null, '"admis la lucru" belongs to a workplace training only'
);

select throws_ok(
  $$ insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000004', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000004', 'Sudor', '2026-01-10') $$,
  '23514', null, 'an admission has its day, name and function together'
);

select throws_ok(
  $$ insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000004', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000004', 'Sudor') $$,
  '23503', null, 'a record carries the phase of its training'
);

select throws_ok(
  $$ insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000004', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000006', 'Sudor') $$,
  '23503', null, 'an attendee is an employee of the training''s client'
);

select throws_ok(
  $$ insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000004', 'workplace', 'e1e1e1e1-0000-4000-8000-000000000002', 'Contabil') $$,
  '23505', null, 'an employee attends a training once'
);


select is(
  (select row(s.ssm_last_periodic_on, s.ssm_due_on, s.ssm_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000001') s),
  (select row(today - 80, (today - 80 + interval '3 months')::date, 'due')::text from day),
  'the last periodic training starts the interval, and a due date within thirty days is due'
);

select is(
  (select s.ssm_workplace_trained_on from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000001') s),
  (select today - 400 from day),
  'the workplace training is reported beside the last periodic one'
);

select is(
  (select row(s.ssm_due_on, s.ssm_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000002') s),
  (select row((today - 30 + interval '6 months')::date, 'current')::text from day),
  'without a periodic training the workplace training starts the interval of the technical-administrative staff'
);

select is(
  (select row(s.ssm_due_on, s.ssm_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000003') s),
  (select row((today - 100 + interval '1 month')::date, 'overdue')::text from day),
  'the position''s own interval overrides its category''s, and a past due date is overdue'
);

select is(
  (select row(s.psi_workplace_trained_on, s.psi_due_on, s.psi_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000003') s),
  (select row(today - 10, (today - 10 + interval '2 months')::date, 'current')::text from day),
  'fire safety takes the fire-safety schedule''s interval for the category, whatever the position says'
);

select is(
  (select row(s.ssm_has_hiring_training, s.ssm_due_on, s.ssm_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000004') s),
  (select row(false, (today - 20 + interval '3 months')::date, 'untrained')::text from day),
  'without a hiring training the employee is untrained, and the hire date starts the interval'
);

select is(
  (select row(s.ssm_due_on, s.ssm_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000007') s),
  (select row((today - 10 + interval '3 months')::date, 'current')::text from day),
  'the introductory general training alone is a hiring training, and the hire date starts the interval'
);

select is(
  (select row(s.psi_has_hiring_training, s.psi_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000001') s),
  row(false, 'untrained')::text,
  'the domains are counted apart'
);

select is(
  (select row(s.ssm_due_on, s.ssm_state, s.psi_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000005') s),
  (select row((today - 400 + interval '3 months')::date, null::text, null::text)::text from day),
  'a leaver has a due date but no training state'
);

select is(
  (select row(s.ssm_due_on, s.ssm_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000006') s),
  row(null::date, 'current')::text,
  'an undecided interval leaves no due date, and the state current'
);

select is(
  (select row(s.psi_due_on, s.psi_state)::text from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000006') s),
  row(null::date, 'untrained')::text,
  'a client without a fire-safety schedule has no fire-safety due date'
);

select is(
  (select s.ssm_last_periodic_on from pg_temp.status('e1e1e1e1-0000-4000-8000-000000000001') s),
  (select today - 80 from day),
  'a supplementary training never counts as periodic'
);


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.trainings),
  9,
  'a member reads the trainings of their organization only'
);

select is(
  (select count(*)::integer from public.training_records),
  10,
  'a member reads the training records of their organization only'
);

select is(
  (select count(*)::integer from public.employee_training_status),
  8,
  'the status view counts only the employees the caller can read'
);

select is(
  (select ssm_state::text from public.employees e, public.training_status(e) where e.id = 'e1e1e1e1-0000-4000-8000-000000000003'),
  'overdue',
  'the employee row reaches its status through the computed relationship'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
     values ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60, 'M', 'T', 'F') $$,
  '42501', null, 'a member cannot record a training at a client of another organization'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 'periodic', '2026-01-10', 60, 'M', 'T', 'F') $$,
  'CLA01', null, 'a member cannot record a training at an archived client'
);

select throws_ok(
  $$ delete from public.trainings where id = 'a1a1a1a1-0000-4000-8000-000000000009' $$,
  'CLA01', null, 'the trainings of an archived client are kept as they are'
);

select throws_ok(
  $$ insert into public.trainings (organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000004', 'ssm', 'periodic', '2026-01-10', 60, 'M', 'T', 'F') $$,
  'CLL01', null, 'a lead has no trainings'
);

select is_empty(
  $$ update public.trainings set material = 'Changed' where id = 'a2a2a2a2-0000-4000-8000-000000000001' returning id $$,
  'a member cannot change a training of another organization'
);

select throws_ok(
  $$ update public.trainings set client_id = 'c1c1c1c1-0000-4000-8000-000000000002' where id = 'a1a1a1a1-0000-4000-8000-000000000004' $$,
  '42501', null, 'a training never moves to another client'
);

select is(
  public.save_training(
    'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60::smallint, 'M', 'T', 'F', 'app',
    '[{"employee_id": "e2e2e2e2-0000-4000-8000-000000000001", "occupation": "Sudor"}]'
  ),
  null,
  'saving at a client of another organization saves nothing'
);

select is(
  public.save_training(
    'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60::smallint, 'M', 'T', 'F', 'app',
    '[{"employee_id": "e1e1e1e1-0000-4000-8000-000000000004", "occupation": "Sudor"}]',
    p_training_id => 'a2a2a2a2-0000-4000-8000-000000000001'
  ),
  null,
  'replacing a training of another client saves nothing'
);

create temp table saved (id uuid);
grant all on saved to authenticated;

insert into saved
select public.save_training(
  'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', today - 2, 240::smallint, 'Material', 'Ion POP', 'Șef atelier', 'app',
  '[{"employee_id": "e1e1e1e1-0000-4000-8000-000000000004", "occupation": "Sudor"}, {"employee_id": "e1e1e1e1-0000-4000-8000-000000000007", "occupation": "Sudor"}]',
  p_verifier_name => 'Dan MARIN', p_verifier_job_title => 'Inspector SSM',
  p_admitted_on => today - 2, p_admitted_by_name => 'Ion POP', p_admitted_by_job_title => 'Șef atelier'
) from day;

select results_eq(
  $$ select r.employee_id::text, r.phase::text, r.admitted_by_name from public.training_records r
     where r.training_id = (select id from saved) order by r.employee_id $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000004', 'workplace', 'Ion POP'), ('e1e1e1e1-0000-4000-8000-000000000007', 'workplace', 'Ion POP') $$,
  'saving a training records every attendee, with the admission'
);

select is(
  (select ssm_state::text from public.employee_training_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000004'),
  'current',
  'a workplace training ends the untrained state'
);

select is(
  (select public.save_training(
     'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', today - 1, 120::smallint, 'Altul', 'Ion POP', 'Șef atelier', 'app',
     '[{"employee_id": "e1e1e1e1-0000-4000-8000-000000000004", "occupation": "Contabil"}, {"employee_id": "e1e1e1e1-0000-4000-8000-000000000002", "occupation": "Contabil"}]',
     p_training_id => (select id from saved)
   ) from day),
  (select id from saved),
  'replacing a training keeps its id'
);

select results_eq(
  $$ select r.employee_id::text, r.phase::text, r.occupation, r.admitted_on is null from public.training_records r
     where r.training_id = (select id from saved) order by r.employee_id $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000002', 'periodic', 'Contabil', true), ('e1e1e1e1-0000-4000-8000-000000000004', 'periodic', 'Sudor', true) $$,
  'replacing the attendees drops who left, adds who came, keeps the occupation of who stayed and the new phase on each'
);

select is(
  (select row(material, phase, held_on)::text from public.trainings where id = (select id from saved)),
  (select row('Altul', 'periodic', today - 1)::text from day),
  'replacing a training replaces its facts'
);

select lives_ok(
  $$ delete from public.trainings where id = (select id from saved) $$,
  'a member deletes a training of their organization'
);

select is(
  (select count(*)::integer from public.training_records where training_id = (select id from saved)),
  0,
  'deleting a training deletes its records'
);

select lives_ok(
  $$ update public.training_records set admitted_on = null, admitted_by_name = null, admitted_by_job_title = null
     where training_id = 'a1a1a1a1-0000-4000-8000-000000000004' $$,
  'a member changes the admission of a record'
);

select throws_ok(
  $$ update public.training_records set occupation = 'Altceva' where training_id = 'a1a1a1a1-0000-4000-8000-000000000004' $$,
  '42501', null, 'the occupation printed is fixed once recorded'
);


select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select results_eq(
  $$ select employee_id::text, ssm_state::text from public.employee_training_status $$,
  $$ values ('e2e2e2e2-0000-4000-8000-000000000001', 'current') $$,
  'another organization sees its own employees'' status only'
);

select is(
  (select count(*)::integer from public.training_records),
  1,
  'another organization reads its own records only'
);

select * from finish();
rollback;
