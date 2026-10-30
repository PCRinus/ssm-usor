begin;
select plan(14);

-- organization_employee_states repeats the rules of employee_training_due and employee_test_due
-- for speed; the seeded employees reach every state, so a rule changed on one side only fails here.
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

insert into public.clients (id, organization_id, legal_name, cui, stage, worker_training_interval_months, administrative_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'With intervals', '1590082', 'client', 6, 12),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Without intervals', '14399840', 'client', null, null),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived', '22', 'client', 6, 12),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client', 6, 12);

insert into public.client_fire_safety (client_id, organization_id, administrative_training_interval_months, worker_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 6, 3);

insert into public.job_positions (id, organization_id, client_id, name, staff_category, training_interval_months) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution', null),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil', 'technical_administrative', 3),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor', 'execution', null),
  ('b1b1b1b1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor', 'execution', null),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor', 'execution', null);

create temp table day as select (now() at time zone 'Europe/Bucharest')::date as today;
grant select on day to authenticated;

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at, archived_at)
select v.id::uuid, v.organization_id::uuid, v.client_id::uuid, v.job_position_id::uuid, v.last_name, 'X', 'Sudor', d.today - 800, v.status::public.employee_status, v.terminated_at, v.archived_at
from day d, lateral (values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Untrained', 'active', null::date, null::timestamptz),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Introduced only', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Current', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Due and overdue', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000002', 'Position interval', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000003', 'No interval', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Left', 'terminated', d.today - 10, null),
  ('e1e1e1e1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Archived', 'active', null, now()),
  ('e1e1e1e1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000004', 'Of archived client', 'active', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Fire introduction', 'active', null, null),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', 'Of B', 'active', null, null)
) as v (id, organization_id, client_id, job_position_id, last_name, status, terminated_at, archived_at);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, supplementary_reason)
select v.id::uuid, v.organization_id::uuid, v.client_id::uuid, v.domain::public.training_domain, v.phase::public.training_phase, d.today - v.days_ago, 120, 'Material', 'Ion POP', 'Șef atelier', v.reason::public.supplementary_training_reason
from day d, (values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', 790, null),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 100, null),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', 100, null),
  ('a1a1a1a1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 400, null),
  ('a1a1a1a1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', 170, null),
  ('a1a1a1a1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', 200, null),
  ('a1a1a1a1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 20, null),
  ('a1a1a1a1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', 10, null),
  ('a1a1a1a1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'supplementary', 5, 'rules_changed'),
  ('a1a1a1a1-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'ssm', 'workplace', 30, null),
  ('a1a1a1a1-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'psi', 'workplace', 30, null),
  ('a1a1a1a1-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', 50, null),
  ('a1a1a1a1-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 'workplace', 30, null),
  ('a1a1a1a1-0000-4000-8000-000000000014', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'introductory_general', 20, null),
  ('a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'workplace', 30, null)
) as v (id, organization_id, client_id, domain, phase, days_ago, reason);

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
select t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000004'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000004'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000004'),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'e1e1e1e1-0000-4000-8000-000000000004'),
  ('a1a1a1a1-0000-4000-8000-000000000007', 'e1e1e1e1-0000-4000-8000-000000000005'),
  ('a1a1a1a1-0000-4000-8000-000000000008', 'e1e1e1e1-0000-4000-8000-000000000005'),
  ('a1a1a1a1-0000-4000-8000-000000000009', 'e1e1e1e1-0000-4000-8000-000000000005'),
  ('a1a1a1a1-0000-4000-8000-000000000010', 'e1e1e1e1-0000-4000-8000-000000000006'),
  ('a1a1a1a1-0000-4000-8000-000000000011', 'e1e1e1e1-0000-4000-8000-000000000006'),
  ('a1a1a1a1-0000-4000-8000-000000000012', 'e1e1e1e1-0000-4000-8000-000000000007'),
  ('a1a1a1a1-0000-4000-8000-000000000012', 'e1e1e1e1-0000-4000-8000-000000000008'),
  ('a1a1a1a1-0000-4000-8000-000000000013', 'e1e1e1e1-0000-4000-8000-000000000009'),
  ('a1a1a1a1-0000-4000-8000-000000000014', 'e1e1e1e1-0000-4000-8000-000000000010'),
  ('a2a2a2a2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001')
) as v (training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source)
select '11111111-0000-4000-8000-000000000001', v.client_id::uuid, v.employee_id::uuid, v.domain::public.training_domain, 'hiring', d.today - v.days_ago, 'Test de verificare a cunoștințelor', 'Mihai VECHI', 'Cadru tehnic', 'paper'
from day d, (values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000004', 'ssm', 300),
  ('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000004', 'psi', 380),
  ('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000005', 'psi', 10),
  ('c1c1c1c1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000006', 'ssm', 20)
) as v (client_id, employee_id, domain, days_ago);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create temp view through_views as
select
  e.id as employee_id,
  t.ssm_state as ssm_training_state,
  t.ssm_due_on as ssm_training_due_on,
  t.psi_state as psi_training_state,
  t.psi_due_on as psi_training_due_on,
  x.ssm_state as ssm_test_state,
  x.psi_state as psi_test_state
from public.employees e
join public.clients c on c.id = e.client_id
join public.employee_training_status t on t.employee_id = e.id
join public.employee_test_status x on x.employee_id = e.id
where e.organization_id = '11111111-0000-4000-8000-000000000001'
  and e.status = 'active'
  and e.archived_at is null
  and c.stage = 'client'
  and c.archived_at is null;
grant select on through_views to authenticated;

create temp table domains (domain public.training_domain);
insert into domains values (null), ('ssm'), ('psi');
grant select on domains to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select employee_id from public.organization_employee_states('11111111-0000-4000-8000-000000000001') order by 1 $$,
  $$ values
       ('e1e1e1e1-0000-4000-8000-000000000001'::uuid), ('e1e1e1e1-0000-4000-8000-000000000002'),
       ('e1e1e1e1-0000-4000-8000-000000000003'), ('e1e1e1e1-0000-4000-8000-000000000004'),
       ('e1e1e1e1-0000-4000-8000-000000000005'), ('e1e1e1e1-0000-4000-8000-000000000006'),
       ('e1e1e1e1-0000-4000-8000-000000000010') $$,
  'only current employees of active clients have states'
);

select results_eq(
  $$ select * from public.organization_employee_states('11111111-0000-4000-8000-000000000001') order by employee_id $$,
  $$ select * from through_views order by employee_id $$,
  'the states and due dates are the status views'' row by row'
);

select is(
  (select array_agg(distinct state order by state)
   from public.organization_employee_states('11111111-0000-4000-8000-000000000001'),
     lateral (values (ssm_training_state), (psi_training_state)) as v (state)),
  enum_range(null::public.training_state),
  'the seeded employees reach every training state'
);

select is(
  (select array_agg(distinct state order by state)
   from public.organization_employee_states('11111111-0000-4000-8000-000000000001'),
     lateral (values (ssm_test_state), (psi_test_state)) as v (state)),
  enum_range(null::public.test_state),
  'the seeded employees reach every test state'
);

select results_eq(
  $$ select s.state, d.domain, e.id
     from unnest(enum_range(null::public.training_state)) as s (state)
     cross join domains d
     cross join lateral public.organization_employees_in_state(
       '11111111-0000-4000-8000-000000000001', s.state, null, d.domain
     ) as e
     order by 1, 2, 3 $$,
  $$ select s.state, d.domain, v.employee_id
     from unnest(enum_range(null::public.training_state)) as s (state)
     cross join domains d
     join through_views v on case
       when d.domain = 'ssm' then v.ssm_training_state = s.state
       when d.domain = 'psi' then v.psi_training_state = s.state
       when s.state = 'current' then v.ssm_training_state = s.state and v.psi_training_state = s.state
       else s.state in (v.ssm_training_state, v.psi_training_state)
     end
     order by 1, 2, 3 $$,
  'a training state matches one domain, or without one, current in both and the others in either'
);

select results_eq(
  $$ select s.state, d.domain, e.id
     from unnest(enum_range(null::public.test_state)) as s (state)
     cross join domains d
     cross join lateral public.organization_employees_in_state(
       '11111111-0000-4000-8000-000000000001', null, s.state, d.domain
     ) as e
     order by 1, 2, 3 $$,
  $$ select s.state, d.domain, v.employee_id
     from unnest(enum_range(null::public.test_state)) as s (state)
     cross join domains d
     join through_views v on case
       when d.domain = 'ssm' then v.ssm_test_state = s.state
       when d.domain = 'psi' then v.psi_test_state = s.state
       when s.state = 'passed' then v.ssm_test_state = s.state and v.psi_test_state = s.state
       else s.state in (v.ssm_test_state, v.psi_test_state)
     end
     order by 1, 2, 3 $$,
  'a test state matches one domain, or without one, passed in both and the others in either'
);

select results_eq(
  $$ select id from public.organization_employees_in_state('11111111-0000-4000-8000-000000000001', 'overdue', 'pending') order by 1 $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000002'::uuid), ('e1e1e1e1-0000-4000-8000-000000000003') $$,
  'a training state and a test state together keep the employees in both'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select * from public.organization_employee_states('11111111-0000-4000-8000-000000000001') order by employee_id $$,
  $$ select * from through_views order by employee_id $$,
  'a specialist reads the same states as the owner'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is_empty(
  $$ select * from public.organization_employee_states('11111111-0000-4000-8000-000000000001') $$,
  'a member of another organization reads no states of it'
);

select is_empty(
  $$ select * from public.organization_employees_in_state('11111111-0000-4000-8000-000000000001', 'current') $$,
  'nor any of its employees'
);

select results_eq(
  $$ select employee_id, ssm_training_state from public.organization_employee_states('22222222-0000-4000-8000-000000000002') $$,
  $$ values ('e2e2e2e2-0000-4000-8000-000000000001'::uuid, 'current'::public.training_state) $$,
  'a member reads the states of its own organization'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.organization_employee_states(uuid)', 'execute'),
  'a visitor cannot read the states'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.organization_employees_in_state(uuid, public.training_state, public.test_state, public.training_domain)',
    'execute'
  ),
  'nor list the employees in a state'
);

select ok(
  has_function_privilege('authenticated', 'public.organization_employee_states(uuid)', 'execute')
  and has_function_privilege(
    'authenticated',
    'public.organization_employees_in_state(uuid, public.training_state, public.test_state, public.training_domain)',
    'execute'
  ),
  'a signed-in member can call both'
);

select * from finish();
rollback;
