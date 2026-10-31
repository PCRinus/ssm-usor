begin;
select plan(89);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dan@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@client.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name, fire_safety_technician_name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A', 'Vasile TEHNIC'),
  ('22222222-0000-4000-8000-000000000002', 'Org B', null);

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor');

create temp table day as select (now() at time zone 'Europe/Bucharest')::date as today;
grant select on day to authenticated;

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2026-01-05', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2026-01-05', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Marin', 'Dan', 'Sudor', '2024-01-05', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Plecat', 'Vlad', 'Sudor', '2024-01-05', 'terminated', '2026-01-01'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', 'Străin', 'Bogdan', 'Sudor', '2026-01-05', 'active', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2026-01-05', 240, 'MISSMIG', 'Ana SPECIALIST', 'Inspector SSM'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'introductory_general', '2026-01-05', 480, 'IPSU', 'Mihai VECHI', 'Cadru tehnic PSI'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', '2026-01-06', 480, 'IPSU', 'Mihai VECHI', 'Cadru tehnic PSI'),
  ('a1a1a1a1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2026-01-05', 240, 'MISSMIG', 'Ana SPECIALIST', 'Inspector SSM');

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
select t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000004')
) as v (training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

-- A fire-safety pass more than a year old: the annual test is due.
insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source)
select '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000003', 'psi', 'hiring', d.today - 400, 'Test de verificare a cunoștințelor la angajare (TASU)', 'Mihai VECHI', 'Cadru tehnic PSI', 'paper'
from day d;

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001'),
  ('9e9e9e9e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'dddddddd-0000-4000-8000-000000000002'),
  ('9e9e9e9e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000003', null, 'dddddddd-0000-4000-8000-000000000003'),
  ('9e9e9e9e-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Elena Radu', 'dddddddd-0000-4000-8000-000000000004');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create temp table attempt_ids (name text primary key, id uuid);
grant select, insert on attempt_ids to authenticated;

create temp table answer_keys (name text, place integer, correct integer[]);
grant select on answer_keys to authenticated;

create function pg_temp.keep_key(p_name text) returns void language sql as $$
  insert into answer_keys
  select p_name, k.place::integer - 1,
    array(select c.value::integer from jsonb_array_elements_text(k.value -> 'correct') as c (value))
  from public.test_attempt_keys t
  cross join lateral jsonb_array_elements(t.key) with ordinality as k (value, place)
  where t.attempt_id = (select a.id from attempt_ids a where a.name = p_name);
$$;

select results_eq(
  $$ select domain::text, test::text, count(*)::integer from public.test_questions where organization_id is null group by 1, 2 order by 1, 2 $$,
  $$ values ('psi', 'annual', 10), ('psi', 'hiring', 12), ('ssm', 'hiring', 10) $$,
  'the built-in questions are seeded: ten, twelve and ten'
);

select is(
  (select count(*)::integer from public.test_questions where organization_id is null and (explanation is null or citation is null)),
  0,
  'every built-in question has an explanation and a citation'
);

select throws_ok(
  $$ insert into public.test_questions (organization_id, domain, test, position, text, options)
     values ('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring', 11, 'O singură variantă?', '[{"text": "Da", "correct": true}]') $$,
  '23514', null, 'a question has at least two options'
);

select throws_ok(
  $$ insert into public.test_questions (organization_id, domain, test, position, text, options)
     values ('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring', 11, 'Nicio variantă corectă?', '[{"text": "Da", "correct": false}, {"text": "Nu", "correct": false}]') $$,
  '23514', null, 'a question has at least one correct option'
);

select throws_ok(
  $$ insert into public.test_questions (organization_id, domain, test, position, text, options)
     values ('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring', 11, 'Prea multe variante?', '[{"text": "A", "correct": true}, {"text": "B", "correct": false}, {"text": "C", "correct": false}, {"text": "D", "correct": false}, {"text": "E", "correct": false}]') $$,
  '23514', null, 'a question has at most four options'
);

select throws_ok(
  $$ insert into public.test_questions (organization_id, domain, test, position, text, options)
     values ('11111111-0000-4000-8000-000000000001', 'ssm', 'annual', 1, 'Un test anual SSM?', '[{"text": "Da", "correct": true}, {"text": "Nu", "correct": false}]') $$,
  '23514', null, 'the annual test is fire safety only'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.test_questions),
  32,
  'a member reads the built-in questions'
);

select lives_ok(
  $$ insert into public.test_questions (id, organization_id, domain, test, position, text, options, replaces_question_id)
     values ('0a0a0a0a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'ssm', 'hiring', 1, 'Ce lege reglementează securitatea muncii?', '[{"text": "Legea 319/2006", "correct": true}, {"text": "Legea 53/2003", "correct": false}]', '00024001-0000-4000-8000-000000000001') $$,
  'a member writes an own question, naming the built-in it replaces'
);

select throws_ok(
  $$ insert into public.test_questions (organization_id, domain, test, position, text, options, replaces_question_id)
     values ('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring', 2, 'Altă întrebare proprie?', '[{"text": "Da", "correct": true}, {"text": "Nu", "correct": false}]', '00024002-0000-4000-8000-000000000001') $$,
  'TST02', null, 'an own question replaces only a built-in of the same test'
);

select throws_ok(
  $$ insert into public.test_questions (domain, test, position, text, options)
     values ('ssm', 'hiring', 20, 'O întrebare predefinită nouă?', '[{"text": "Da", "correct": true}, {"text": "Nu", "correct": false}]') $$,
  '42501', null, 'a member does not write a built-in question'
);

update public.test_questions set text = 'Schimbat de un membru?' where id = '00024001-0000-4000-8000-000000000001';
delete from public.test_questions where id = '00024001-0000-4000-8000-000000000002';

select isnt(
  (select text from public.test_questions where id = '00024001-0000-4000-8000-000000000001'),
  'Schimbat de un membru?',
  'a member does not edit a built-in question'
);

select ok(
  exists (select 1 from public.test_questions where id = '00024001-0000-4000-8000-000000000002'),
  'a member does not delete a built-in question'
);

select lives_ok(
  $$ update public.test_questions set explanation = 'Legea 319/2006 este legea securității și sănătății în muncă.' where id = '0a0a0a0a-0000-4000-8000-000000000001' $$,
  'a member edits an own question'
);

select throws_ok(
  $$ update public.test_questions set domain = 'psi' where id = '0a0a0a0a-0000-4000-8000-000000000001' $$,
  '42501', null, 'an own question never moves to another test'
);

select lives_ok(
  $$ insert into public.test_question_hides (organization_id, question_id) values ('11111111-0000-4000-8000-000000000001', '00024001-0000-4000-8000-000000000001') $$,
  'a member hides a built-in question while ten stay active'
);

select is(
  (select count(*)::integer from public.active_test_questions('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring')),
  10,
  'the active questions are the built-ins not hidden and the own ones'
);

select ok(
  not exists (select 1 from public.active_test_questions('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring') where id = '00024001-0000-4000-8000-000000000001'),
  'a hidden built-in is not active'
);

select throws_ok(
  $$ insert into public.test_question_hides (organization_id, question_id) values ('11111111-0000-4000-8000-000000000001', '00024001-0000-4000-8000-000000000002') $$,
  'TST01', 'test_below_minimum', 'hiding is refused when the test would keep fewer than ten active questions'
);

select throws_ok(
  $$ delete from public.test_questions where id = '0a0a0a0a-0000-4000-8000-000000000001' $$,
  'TST01', 'test_below_minimum', 'deleting an own question is refused when the test would keep fewer than ten'
);

select throws_ok(
  $$ insert into public.test_question_hides (organization_id, question_id) values ('11111111-0000-4000-8000-000000000001', '0a0a0a0a-0000-4000-8000-000000000001') $$,
  'TST02', null, 'only a built-in question is hidden'
);

select throws_ok(
  $$ insert into public.test_question_hides (organization_id, question_id) values ('22222222-0000-4000-8000-000000000002', '00024002-0000-4000-8000-000000000001') $$,
  '42501', null, 'a member does not hide a question for another organization'
);

select lives_ok(
  $$ delete from public.test_question_hides where question_id = '00024001-0000-4000-8000-000000000001' $$,
  'a member restores a hidden question'
);

select lives_ok(
  $$ delete from public.test_questions where id = '0a0a0a0a-0000-4000-8000-000000000001' $$,
  'an own question is deleted once ten others stay active'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.test_question_hides),
  0,
  'a member does not read another organization''s hidden questions'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.test_questions),
  0,
  'a participant reads no question: the options carry the key'
);

select is(
  (select count(*)::integer from public.active_test_questions('11111111-0000-4000-8000-000000000001', 'ssm', 'hiring')),
  0,
  'nor through the active questions'
);

select is(
  (select count(*)::integer from public.test_study_card('9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring')),
  10,
  'the study card gives the participant the explanations of the active questions'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000005');

select is(
  (select count(*)::integer from public.test_questions),
  0,
  'a stranger reads no question'
);

select throws_ok(
  $$ select public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring') $$,
  'P0002', 'participant_not_found', 'a stranger does not start another person''s test'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000002', 'ssm', 'hiring') $$,
  'TST05', 'test_not_awaiting', 'no test awaits before the hiring training is recorded'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'psi', 'annual') $$,
  'TST05', 'test_not_awaiting', 'the annual test does not await before a fire-safety pass'
);

select throws_ok(
  $$ insert into public.test_attempts (organization_id, client_id, employee_id, participant_id, domain, test, questions, total)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring', '[]', 1) $$,
  '42501', null, 'a participant does not write an attempt directly'
);

insert into attempt_ids
select 'failed', (public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring', null, '203.0.113.7', 'Mozilla/5.0')).id;

select is(
  (select (public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring')).id),
  (select id from attempt_ids where name = 'failed'),
  'starting again returns the attempt in progress'
);

select pg_temp.act_as_postgres();

select results_eq(
  $$ select total::integer, jsonb_array_length(questions), finished_at is null, score is null, language from public.test_attempts where id = (select id from attempt_ids where name = 'failed') $$,
  $$ values (10, 10, true, true, 'ro') $$,
  'a sitting is ten questions, in progress'
);

select is(
  (select count(distinct q.value ->> 'question_id')::integer from public.test_attempts a, jsonb_array_elements(a.questions) as q (value) where a.id = (select id from attempt_ids where name = 'failed')),
  10,
  'the ten questions are distinct'
);

select ok(
  (select position('"correct"' in a.questions::text) = 0 and position('"explanation"' in a.questions::text) = 0
   from public.test_attempts a where a.id = (select id from attempt_ids where name = 'failed')),
  'the attempt in progress carries no key'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is((select count(*)::integer from public.test_attempts), 0, 'a participant reads no attempt, not even their own');

select throws_ok(
  $$ select * from public.test_attempt_keys $$,
  '42501', null, 'a participant does not read the key'
);

select pg_temp.act_as_postgres();

select ok(
  (select bool_and(
     (select array_agg(o.value ->> 'text' order by o.value ->> 'text') from jsonb_array_elements(q.value -> 'options') as o (value))
     = (select array_agg(o.value ->> 'text' order by o.value ->> 'text') from jsonb_array_elements(b.options) as o (value))
   )
   from public.test_attempts a
   cross join lateral jsonb_array_elements(a.questions) as q (value)
   join public.test_questions b on b.id = (q.value ->> 'question_id')::uuid
   where a.id = (select id from attempt_ids where name = 'failed')),
  'each question shows all of its options'
);

select pg_temp.keep_key('failed');

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.answer_test_attempt((select id from attempt_ids where name = 'failed'), 10, '{0}') $$,
  'TST04', 'question_out_of_range', 'an answer names one of the ten questions'
);

select throws_ok(
  $$ select public.answer_test_attempt((select id from attempt_ids where name = 'failed'), 0, '{5}') $$,
  'TST04', 'option_out_of_range', 'an answer names options shown'
);

select count(public.answer_test_attempt(k.attempt_id, k.place, array[k.wrong]))
from (
  select a.id as attempt_id, k.place,
    (select min(n) from generate_series(0, 3) as n where not n = any (k.correct)) as wrong
  from answer_keys k, attempt_ids a
  where k.name = 'failed' and a.name = 'failed'
) as k;

select pg_temp.act_as_postgres();

select is(
  (select a.questions -> 0 -> 'chosen' from public.test_attempts a where a.id = (select id from attempt_ids where name = 'failed')),
  (select to_jsonb(array[(select min(n) from generate_series(0, 3) as n where not n = any (k.correct))]) from answer_keys k where k.name = 'failed' and k.place = 0),
  'an answer is saved as it is given'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.answer_test_attempt((select id from attempt_ids where name = 'failed'), 0, '{0}') $$,
  'P0002', 'attempt_not_found', 'only the participant answers their attempt'
);

select is(
  (select count(*)::integer from public.test_attempts),
  0,
  'a participant does not read another employee''s attempts'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select results_eq(
  $$ select score::integer, passed from public.finish_test_attempt((select id from attempt_ids where name = 'failed')) $$,
  $$ values (0, false) $$,
  'a sitting answered all wrong fails'
);

select pg_temp.act_as_postgres();

select ok(
  (select bool_and(
     q.value ? 'correct' and q.value ? 'explanation'
     and not exists (select 1 from jsonb_array_elements(q.value -> 'options') as o (value) where o.value ? 'correct')
   )
   from public.test_attempts a, jsonb_array_elements(a.questions) as q (value)
   where a.id = (select id from attempt_ids where name = 'failed')),
  'the finish marks each question and adds its explanation, never which option is correct'
);

select is(
  (select count(*)::integer from public.test_results where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  0,
  'a failed attempt gives no result'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.answer_test_attempt((select id from attempt_ids where name = 'failed'), 0, '{0}') $$,
  'TST03', 'attempt_finished', 'a finished attempt takes no answer'
);

select throws_ok(
  $$ select public.finish_test_attempt((select id from attempt_ids where name = 'failed')) $$,
  'TST03', 'attempt_finished', 'a finished attempt is not finished again'
);

select pg_temp.act_as_postgres();

select is(
  (select count(*)::integer from public.test_attempt_keys where attempt_id = (select id from attempt_ids where name = 'failed')),
  1,
  'the key stays with the finished attempt'
);

select throws_ok(
  $$ update public.test_attempt_keys set key = '[]' where attempt_id = (select id from attempt_ids where name = 'failed') $$,
  'TST03', 'attempt_finished', 'a finished attempt''s key is frozen, whoever writes'
);

select throws_ok(
  $$ delete from public.test_attempt_keys where attempt_id = (select id from attempt_ids where name = 'failed') $$,
  'TST03', 'attempt_finished', 'a finished attempt''s key is never deleted'
);

select throws_ok(
  $$ update public.test_attempts set score = 10 where id = (select id from attempt_ids where name = 'failed') $$,
  'TST03', 'attempt_finished', 'a finished attempt is frozen, whoever writes'
);

select throws_ok(
  $$ delete from public.test_attempts where id = (select id from attempt_ids where name = 'failed') $$,
  'TST03', 'attempt_finished', 'a finished attempt is never deleted'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

insert into attempt_ids
select 'passed', (public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring')).id;

select isnt(
  (select id from attempt_ids where name = 'passed'),
  (select id from attempt_ids where name = 'failed'),
  'a retake is a new sitting'
);

select pg_temp.act_as_postgres();
select pg_temp.keep_key('passed');

update public.test_questions b
set text = b.text || ' (modificat)',
    options = (
      select jsonb_agg(jsonb_build_object('text', o.value ->> 'text', 'correct', not (o.value ->> 'correct')::boolean) order by o.place)
      from jsonb_array_elements(b.options) with ordinality as o (value, place)
    )
where b.organization_id is null and b.domain = 'ssm' and b.test = 'hiring';

select ok(
  (select bool_and((q.value ->> 'text') || ' (modificat)' = b.text)
   from public.test_attempts a
   cross join lateral jsonb_array_elements(a.questions) as q (value)
   join public.test_questions b on b.id = (q.value ->> 'question_id')::uuid
   where a.id = (select id from attempt_ids where name = 'passed')),
  'a sitting keeps its questions as drawn when the bank changes'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select count(public.answer_test_attempt(a.id, k.place, k.correct))
from answer_keys k, attempt_ids a
where k.name = 'passed' and a.name = 'passed';

select results_eq(
  $$ select score::integer, passed from public.finish_test_attempt((select id from attempt_ids where name = 'passed'), '198.51.100.4', 'Mozilla/5.0 (Android)') $$,
  $$ values (10, true) $$,
  'a sitting answered with its key passes, whatever the bank became'
);

select pg_temp.act_as_postgres();

select results_eq(
  $$ select source::text, test::text, taken_on = (select today from day), material, grade, examiner_name, examiner_job_title
     from public.test_results where attempt_id = (select id from attempt_ids where name = 'passed') $$,
  $$ values ('portal', 'hiring', true, 'Test de verificare a cunoștințelor la angajare (TASSM)', 'admis', 'Ana SPECIALIST', 'Inspector SSM') $$,
  'a pass gives the result, the examiner proposed from the introductory general training'
);

select is(
  (select count(*)::integer from public.test_attempts where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  2,
  'the employee has both attempts'
);

select results_eq(
  $$ select psi_state::text, psi_awaiting_test::text from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  $$ values ('annual_due', 'annual') $$,
  'twelve months after the last fire-safety pass, the annual test is due'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

insert into attempt_ids
select 'annual', (public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000003', 'psi', 'annual')).id;

select pg_temp.act_as_postgres();
select pg_temp.keep_key('annual');
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select count(public.answer_test_attempt(a.id, k.place, case when k.place < 7 then k.correct else '{}' end))
from answer_keys k, attempt_ids a
where k.name = 'annual' and a.name = 'annual';

select results_eq(
  $$ select score::integer, passed from public.finish_test_attempt((select id from attempt_ids where name = 'annual')) $$,
  $$ values (7, true) $$,
  'seven of ten is a pass'
);

select pg_temp.act_as_postgres();

select results_eq(
  $$ select material, examiner_name, examiner_job_title from public.test_results where attempt_id = (select id from attempt_ids where name = 'annual') $$,
  $$ values ('Verificare anuală pe bază de test (TPSU)', 'Vasile TEHNIC', 'Cadru tehnic PSI') $$,
  'an annual pass names the organization''s fire-safety technician'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

insert into attempt_ids
select 'overtaken', (public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'psi', 'hiring')).id;

select pg_temp.act_as_postgres();
select pg_temp.keep_key('overtaken');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'psi', 'hiring', (select today from day), 'Test de verificare a cunoștințelor la angajare (TASU)', 'Vasile TEHNIC', 'Cadru tehnic PSI', 'paper') $$,
  'a member records a paper result'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select count(public.answer_test_attempt(a.id, k.place, k.correct))
from answer_keys k, attempt_ids a
where k.name = 'overtaken' and a.name = 'overtaken';

select results_eq(
  $$ select passed from public.finish_test_attempt((select id from attempt_ids where name = 'overtaken')) $$,
  $$ values (true) $$,
  'an attempt left open across a paper pass still finishes'
);

select pg_temp.act_as_postgres();

select is(
  (select count(*)::integer from public.test_results where attempt_id = (select id from attempt_ids where name = 'overtaken')),
  0,
  'but gives no second pass'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, source)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'ssm', 'hiring', (select today from day), 'TASSM', 'paper') $$,
  '23514', null, 'a paper result names its examiner'
);

select throws_ok(
  $$ insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, source, attempt_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'hiring', (select today from day), 'TASSM', 'portal', (select id from attempt_ids where name = 'failed')) $$,
  '42501', null, 'a member does not record a portal result'
);

select lives_ok(
  $$ update public.test_results set examiner_name = 'Ioana EXAMINATOR', examiner_job_title = 'Inspector SSM' where attempt_id = (select id from attempt_ids where name = 'passed') $$,
  'a member replaces the examiner proposed'
);

select throws_ok(
  $$ update public.test_results set taken_on = taken_on - 1 where attempt_id = (select id from attempt_ids where name = 'passed') $$,
  'TST06', 'result_from_attempt', 'a portal result keeps the day of its attempt'
);

select throws_ok(
  $$ delete from public.test_results where attempt_id = (select id from attempt_ids where name = 'passed') $$,
  'TST06', 'result_from_attempt', 'a portal result is not deleted'
);

select is(
  (select count(*)::integer from public.test_attempts),
  4,
  'a member reads the attempts of their clients'' employees'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select results_eq(
  $$ select (select count(*)::integer from public.test_attempts), (select count(*)::integer from public.test_results) $$,
  $$ values (0, 0) $$,
  'a member of another organization reads no attempt and no result'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.test_results),
  0,
  'a participant reads no result, not even their own'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000004');

select results_eq(
  $$ select (select count(*)::integer from public.test_results), (select count(*)::integer from public.test_attempts) $$,
  $$ values (0, 0) $$,
  'the client administrator reads no result and no attempt'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000005');

select results_eq(
  $$ select (select count(*)::integer from public.test_results), (select count(*)::integer from public.test_attempts) $$,
  $$ values (0, 0) $$,
  'a stranger reads no result and no attempt'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select employee_id::text, ssm_state::text, ssm_awaiting_test::text, psi_state::text, psi_awaiting_test::text
     from public.employee_test_status order by employee_id $$,
  $$ values
       ('e1e1e1e1-0000-4000-8000-000000000001', 'passed', null, 'passed', null),
       ('e1e1e1e1-0000-4000-8000-000000000002', 'none', null, 'none', null),
       ('e1e1e1e1-0000-4000-8000-000000000003', 'none', null, 'passed', null),
       ('e1e1e1e1-0000-4000-8000-000000000004', null, null, null, null) $$,
  'the test states after the passes; a leaver has none'
);

select is(
  (select psi_due_on from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003'),
  (select (today + interval '12 months')::date from day),
  'the annual test is due twelve months after the last fire-safety pass'
);

select pg_temp.act_as_postgres();

delete from public.test_results where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' and source = 'paper';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select psi_state::text, psi_awaiting_test::text, psi_hiring_trained_on from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('pending', 'hiring', '2026-01-06'::date) $$,
  'the fire-safety hiring test awaits from the workplace training record'
);

select is(
  (select count(s.*)::integer from public.employees e cross join lateral public.test_status(e) as s),
  4,
  'the employee lists embed the test state per employee'
);

select set_eq(
  $$ select s.* from public.employees e cross join lateral public.test_status(e) as s $$,
  $$ select * from public.employee_test_status $$,
  'every employee row computes the test state the view gives it'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.employee_test_status),
  0,
  'a participant reads no test state, not even their own'
);

select throws_ok(
  $$ select public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000001', 'ssm', 'hiring') $$,
  'TST05', 'test_not_awaiting', 'a passed test does not await'
);

-- ADR 032: a hiring test awaits only after a hiring training held in the app.
select pg_temp.act_as_postgres();

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, terminated_at) values
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Hârtie', 'Ilie', 'Sudor', '2019-03-04', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Verificat', 'Radu', 'Sudor', '2019-03-04', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Reangajat', 'Mihai', 'Sudor', '2019-03-04', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Transcris', 'Sorin', 'Sudor', '2019-03-04', 'active', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, source) values
  ('a1a1a1a1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2019-03-04', 480, 'MISSMIG', 'Ana SPECIALIST', 'Inspector SSM', 'paper'),
  ('a1a1a1a1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'workplace', '2019-03-05', 480, 'IPSU', 'Mihai VECHI', 'Cadru tehnic PSI', 'paper'),
  ('a1a1a1a1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2026-02-02', 240, 'MISSMIG', 'Ana SPECIALIST', 'Inspector SSM', 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'introductory_general', '2018-01-08', 480, 'MISSMIG', 'Ana SPECIALIST', 'Inspector SSM', 'app');

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
select t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000005'),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'e1e1e1e1-0000-4000-8000-000000000005'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000006'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000007'),
  ('a1a1a1a1-0000-4000-8000-000000000007', 'e1e1e1e1-0000-4000-8000-000000000007'),
  ('a1a1a1a1-0000-4000-8000-000000000008', 'e1e1e1e1-0000-4000-8000-000000000008'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-000000000008')
) as v (training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.test_results (organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name, examiner_job_title, source) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000006', 'ssm', 'hiring', '2019-03-04', 'Test de verificare a cunoștințelor la angajare (TASSM)', 'Ana SPECIALIST', 'Inspector SSM', 'paper');

select results_eq(
  $$ select ssm_state::text, ssm_awaiting_test::text, ssm_hiring_trained_on, psi_state::text, psi_awaiting_test::text
     from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000005' $$,
  $$ values ('unverified', null::text, '2019-03-04'::date, 'unverified', null::text) $$,
  'hiring trainings only from paper and no pass: unverified in both domains, no test awaits'
);

select is(
  (select ssm_state::text from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000006'),
  'passed',
  'a paper hiring training with a paper pass is passed'
);

select results_eq(
  $$ select ssm_state::text, ssm_awaiting_test::text, ssm_hiring_trained_on
     from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000007' $$,
  $$ values ('pending', 'hiring', '2026-02-02'::date) $$,
  'the newest hiring training held in the app makes the hiring test await, whatever came before on paper'
);

select is(
  (select ssm_state::text from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000008'),
  'unverified',
  'an older hiring training in the app does not, once a newer one comes from paper'
);

update public.trainings set held_on = '2018-01-08' where id = 'a1a1a1a1-0000-4000-8000-000000000005';

select is(
  (select ssm_state::text from public.employee_test_status where employee_id = 'e1e1e1e1-0000-4000-8000-000000000008'),
  'pending',
  'on the same day, the training held in the app wins'
);

update public.trainings set held_on = '2019-03-04' where id = 'a1a1a1a1-0000-4000-8000-000000000005';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  (select tests_pending from public.dashboard_summary where organization_id = '11111111-0000-4000-8000-000000000001'),
  2,
  'the dashboard counts the hiring tests that await, never an unverified one'
);

select pg_temp.act_as_postgres();

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('9e9e9e9e-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000005', null, 'dddddddd-0000-4000-8000-000000000005');

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000005');

select throws_ok(
  $$ select public.start_test_attempt('9e9e9e9e-0000-4000-8000-000000000005', 'ssm', 'hiring') $$,
  'TST05', 'test_not_awaiting', 'an unverified hiring test is not taken in the portal'
);

select * from finish();
rollback;
