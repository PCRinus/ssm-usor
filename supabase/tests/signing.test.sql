begin;
select plan(83);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@client.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com', '', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', 'client'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor'),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'ion@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'ana@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000003', 'Arhivat', 'Ion', 'Sudor', '2020-03-01', null),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', 'Străin', 'Bogdan', 'Sudor', '2020-03-01', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', '2026-01-10', 120, 'Material', 'Ion POP', 'Șef atelier', 'Dan MARIN', 'Inspector SSM'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier', null, null),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier', null, null),
  ('a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-01-10', 60, 'Material', 'Bogdan B', 'Șef', null, null);

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on, admitted_by_name, admitted_by_job_title)
select v.id::uuid, t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor', v.admitted_on::date, v.admitted_by, v.admitted_by_title
from (values
  ('7a7a7a7a-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', '2026-01-10', 'Ion POP', 'Șef atelier'),
  ('7a7a7a7a-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', '2026-01-10', 'Ion POP', 'Șef atelier'),
  ('7a7a7a7a-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000001', null, null, null),
  ('7a7a7a7a-0000-4000-8000-000000000005', 'a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000005', null, null, null),
  ('7b7b7b7b-0000-4000-8000-000000000001', 'a2a2a2a2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001', null, null, null)
) as v (id, training_id, employee_id, admitted_on, admitted_by, admitted_by_title)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.client_participants (organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Elena Radu', 'dddddddd-0000-4000-8000-000000000002'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'dddddddd-0000-4000-8000-000000000004');

insert into public.signing_sessions (id, account_id, place, participant_id, channel, address, code_hash, verified_at)
select '5e5e5e5e-0000-4000-8000-000000000001', p.user_id, 'portal', p.id, 'email', 'ion@example.com', 'hash', now()
from public.client_participants p where p.user_id = 'dddddddd-0000-4000-8000-000000000001';
insert into public.signing_sessions (id, account_id, place, channel, address, code_hash, verified_at) values
  ('5e5e5e5e-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'app', 'email', 'owner-a@test', 'hash', now());

insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id) values
  ('9a9a9a9a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'dddddddd-0000-4000-8000-000000000001'),
  ('9a9a9a9a-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', '7a7a7a7a-0000-4000-8000-000000000005', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001');

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create or replace function pg_temp.sign(p_request uuid, p_record uuid, p_slot public.signer_slot, p_signer uuid, p_session uuid)
returns void language sql as $$
  insert into public.signing_session_items (session_id, position, request_id)
  select p_session, coalesce(max(i.position) + 1, 0), p_request
  from public.signing_session_items i where i.session_id = p_session
  on conflict (session_id, request_id) do nothing;
  insert into public.training_signatures (
    organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id,
    signer_name, signer_job_title, channel, address, code_sent_at, code_verified_at,
    digest_before, digest_after, certificate_serial, client_ip, user_agent, signing_session_id
  )
  select r.organization_id, r.client_id, r.id, p_slot, p_request, 'electronic', p_signer,
    'Popescu Ion', 'Sudor', s.channel, s.address, now(), now(),
    repeat('a', 64), repeat('b', 64), '01AB', '127.0.0.1', 'pgTAP', p_session
  from public.training_records r, public.signing_sessions s where r.id = p_record and s.id = p_session;
$$;


create or replace function pg_temp.request_state(p_record uuid, p_slot public.signer_slot)
returns text language sql security definer as $$
  select string_agg(state || coalesce(':' || btrim(void_reason), ''), ',' order by state || coalesce(':' || btrim(void_reason), ''))
  from public.signature_requests where training_record_id = p_record and slot = p_slot;
$$;


select lives_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'dddddddd-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000001') $$,
  'the API writes an electronic signature for the slot it was requested for'
);

select lives_ok(
  $$ insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('9a9a9a9a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member of the organization is addressed as the trainer'
);
select lives_ok(
  $$ insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('9a9a9a9a-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'verifier', 'dddddddd-0000-4000-8000-000000000002') $$,
  'a participant of the client is addressed as the verifier'
);
select lives_ok(
  $$ insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('9a9a9a9a-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000004') $$,
  'the employee''s own participant is addressed as the trainee'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '23505', null, 'a slot has one live request'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'verifier', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'SIG03', 'slot_not_on_record', 'a training without a verifier has no verifier''s slot'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'admitter', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'SIG03', 'slot_not_on_record', 'a record without an admission has no admitter''s slot'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainee', 'dddddddd-0000-4000-8000-000000000004') $$,
  'SIG05', 'signer_not_of_client', 'another employee is not the trainee'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainer', 'dddddddd-0000-4000-8000-000000000003') $$,
  'SIG05', 'signer_not_of_client', 'a stranger is not addressed'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainer', 'bbbbbbbb-0000-4000-8000-000000000001') $$,
  'SIG05', 'signer_not_of_client', 'nor a member of another organization'
);

insert into public.signing_session_items (session_id, position, request_id)
values ('5e5e5e5e-0000-4000-8000-000000000002', 0, '9a9a9a9a-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into public.training_signatures (organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id, signer_name, channel, address, code_sent_at, code_verified_at, certificate_serial, signing_session_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', '9a9a9a9a-0000-4000-8000-000000000002', 'electronic', 'aaaaaaaa-0000-4000-8000-000000000001', 'Ion POP', 'email', 'owner-a@test', now(), now(), '02', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  '23514', null, 'an electronic signature carries its digests'
);
select throws_ok(
  $$ insert into public.training_signatures (organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id, signer_name, marked_by)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', '9a9a9a9a-0000-4000-8000-000000000002', 'paper', 'aaaaaaaa-0000-4000-8000-000000000001', 'Ion POP', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '23514', null, 'a paper signature carries no signer account or code evidence'
);
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000002', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', 'dddddddd-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000001') $$,
  'SIG05', 'signer_not_addressed', 'only the addressed signer signs a request'
);
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000002', '7a7a7a7a-0000-4000-8000-000000000002', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  '23503', null, 'a signature is on its request''s record'
);

select throws_ok(
  $$ update public.training_signatures set signer_name = 'Altcineva' where request_id = '9a9a9a9a-0000-4000-8000-000000000001' $$,
  'SIG06', 'signature_written_once', 'a signature''s name is never changed'
);
select throws_ok(
  $$ delete from public.training_signatures where request_id = '9a9a9a9a-0000-4000-8000-000000000001' $$,
  'SIG06', 'signature_written_once', 'a signature is never deleted'
);
select throws_ok(
  $$ truncate public.training_signatures cascade $$,
  'SIG06', 'signature_written_once', 'nor truncated'
);

select throws_ok(
  $$ update public.trainings set material = 'Altul' where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_signed', 'the material of a signed training is frozen'
);
select throws_ok(
  $$ update public.trainings set held_on = '2026-01-11' where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_signed', 'so is its day'
);
select lives_ok(
  $$ update public.trainings set notes = 'Observație' where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'its notes, which no sheet prints, are not'
);
select throws_ok(
  $$ update public.training_records set admitted_by_name = 'Altul' where id = '7a7a7a7a-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_signed', 'the admission of a signed record is frozen'
);
select throws_ok(
  $$ delete from public.trainings where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_has_signatures', 'a signed training is not deleted'
);
select throws_ok(
  $$ delete from public.training_records where id = '7a7a7a7a-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_has_signatures', 'nor a signed record'
);


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select is(
  public.save_training(
    'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', '2026-01-10', 120::smallint, 'Material', 'Ion POP', 'Șef atelier', 'app',
    '[{"employee_id": "e1e1e1e1-0000-4000-8000-000000000001", "occupation": "Sudor"}, {"employee_id": "e1e1e1e1-0000-4000-8000-000000000002", "occupation": "Sudor"}]',
    p_training_id => 'a1a1a1a1-0000-4000-8000-000000000001',
    p_verifier_name => 'Dan MARIN', p_verifier_job_title => 'Inspector SSM', p_notes => 'Observație',
    p_admitted_on => '2026-01-10', p_admitted_by_name => 'Ion POP', p_admitted_by_job_title => 'Șef atelier'
  ),
  'a1a1a1a1-0000-4000-8000-000000000001'::uuid,
  'a signed workplace training is saved again unchanged'
);
select is(
  pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000002', 'verifier'),
  'pending',
  'and an unchanged save voids no request'
);
select throws_ok(
  $$ select public.save_training(
       'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', '2026-01-10', 120::smallint, 'Material', 'Ion POP', 'Șef atelier', 'app',
       '[{"employee_id": "e1e1e1e1-0000-4000-8000-000000000002", "occupation": "Sudor"}]',
       p_training_id => 'a1a1a1a1-0000-4000-8000-000000000001',
       p_verifier_name => 'Dan MARIN', p_verifier_job_title => 'Inspector SSM',
       p_admitted_on => '2026-01-10', p_admitted_by_name => 'Ion POP', p_admitted_by_job_title => 'Șef atelier') $$,
  'SIG01', 'record_has_signatures', 'a signed attendee is not removed from the training'
);

select lives_ok(
  $$ update public.training_records set admitted_by_job_title = 'Maistru' where id = '7a7a7a7a-0000-4000-8000-000000000002' $$,
  'an unsigned record of a signed training keeps its admission editable'
);
select is(
  pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000002', 'trainee') || ' ' || pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000002', 'verifier'),
  'void:record_changed void:record_changed',
  'and the change voids the record''s pending requests'
);
select lives_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000004') $$,
  'a member issues a request again for a voided slot'
);

select lives_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'a member issues a request'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id, state)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainee', 'dddddddd-0000-4000-8000-000000000001', 'signed') $$,
  '42501', null, 'but never one already signed'
);
select throws_ok(
  $$ update public.signature_requests set notified_at = now() where training_record_id = '7a7a7a7a-0000-4000-8000-000000000003' $$,
  '42501', null, 'nor changes one'
);
select throws_ok(
  $$ insert into public.training_signatures (organization_id, client_id, training_record_id, slot, request_id, method, signer_name, marked_by)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainer', '9a9a9a9a-0000-4000-8000-000000000006', 'paper', 'Ion POP', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '42501', null, 'nor writes a signature itself'
);

select results_eq(
  $$ select method, signer_account_id, signer_name, signer_job_title, marked_by, voided_at
     from public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000003', 'trainee', ' Popescu Ion ', 'Sudor') $$,
  $$ values ('paper', null::uuid, 'Popescu Ion', 'Sudor', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, null::timestamptz) $$,
  'a member marks a slot as signed on paper'
);
select is(
  pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000003', 'trainee'),
  'signed',
  'with a signed request and no signer'
);
select lives_ok(
  $$ update public.trainings set material = 'Altul' where id = 'a1a1a1a1-0000-4000-8000-000000000002' $$,
  'a paper signature does not freeze the training'
);
select is(
  pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000003', 'trainer') || ' ' || pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000003', 'trainee'),
  'void:record_changed signed',
  'editing a training voids the pending requests of its records and leaves the signed ones'
);
select throws_ok(
  $$ delete from public.training_records where id = '7a7a7a7a-0000-4000-8000-000000000003' $$,
  'SIG01', 'record_has_signatures', 'a record signed on paper is not deleted'
);
select lives_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'the trainer is asked again'
);
select lives_ok(
  $$ select public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000003', 'trainer', 'Ion POP', null) $$,
  'and signs on paper instead'
);
select is(
  pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000003', 'trainer'),
  'signed,void:record_changed,void:signed_on_paper',
  'which voids the pending request of the slot'
);
select throws_ok(
  $$ select public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000003', 'trainee', 'Popescu Ion', null) $$,
  'SIG02', 'slot_signed', 'a signed slot is not marked again'
);
select throws_ok(
  $$ select public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000003', 'verifier', 'Dan MARIN', null) $$,
  'SIG03', 'slot_not_on_record', 'a slot the record lacks is not marked'
);
select throws_ok(
  $$ select public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000001', 'verifier', '  ', null) $$,
  'SIG04', 'signer_name_required', 'a paper signature names its signer'
);
select throws_ok(
  $$ select public.mark_paper_signature('7b7b7b7b-0000-4000-8000-000000000001', 'trainee', 'Bogdan', null) $$,
  'P0002', 'record_not_found', 'a record of another organization is not marked'
);
select throws_ok(
  $$ select public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000005', 'trainee', 'Arhivat Ion', null) $$,
  'CLA01', null, 'nor one of an archived client'
);

select throws_ok(
  $$ select public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000001', '  ') $$,
  'SIG04', 'reason_required', 'voiding needs a reason'
);
select throws_ok(
  $$ select public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000005', 'Greșit') $$,
  'CLA01', null, 'nothing is voided at an archived client'
);
select is(
  public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000001', ' Material greșit '),
  1,
  'a member voids the signatures of a record'
);
select is(
  (select void_reason from public.training_signatures where request_id = '9a9a9a9a-0000-4000-8000-000000000001' and voided_at is not null),
  'Material greșit',
  'the signature stays, marked void with the reason'
);
select is(
  pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000001', 'trainee') || ' ' || pg_temp.request_state('7a7a7a7a-0000-4000-8000-000000000001', 'trainer'),
  'void:Material greșit void:Material greșit',
  'and every request of the record is void, signed or pending'
);
select lives_ok(
  $$ update public.trainings set material = 'Corectat' where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'the voided record is editable again'
);
select lives_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'dddddddd-0000-4000-8000-000000000001') $$,
  'and its slots are requested again'
);
select throws_ok(
  $$ delete from public.training_records where id = '7a7a7a7a-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_has_signatures', 'a record with voided signatures keeps them and is not deleted'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000003', 'Greșit') $$,
  'P0002', 'record_not_found', 'another organization voids nothing'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000003', 'Greșit') $$,
  '42501', 'not_member', 'a stranger voids nothing'
);
select throws_ok(
  $$ select public.mark_paper_signature('7a7a7a7a-0000-4000-8000-000000000003', 'trainee', 'X', null) $$,
  '42501', 'not_member', 'nor marks anything'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000001', 'Nu recunosc') $$,
  '42501', 'not_member', 'a participant does not void their signature'
);


select pg_temp.act_as_postgres();

select throws_ok(
  $$ update public.training_signatures set voided_at = null, void_reason = null where request_id = '9a9a9a9a-0000-4000-8000-000000000001' $$,
  'SIG06', 'signature_written_once', 'a void signature stays void'
);

insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id) values
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', '7b7b7b7b-0000-4000-8000-000000000001', 'trainer', 'bbbbbbbb-0000-4000-8000-000000000001');

insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256) values
  ('cfcfcfcf-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Scan', 'scan.pdf', 'application/pdf', 10, repeat('c', 64));

insert into public.signed_sheets (id, organization_id, client_id, employee_id, domain, storage_path, digest, row_capacity) values
  ('5d5d5d5d-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'sheets/ion-ssm-1.pdf', repeat('d', 64), 8),
  ('5d5d5d5d-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001', 'ssm', 'sheets/bogdan-ssm-1.pdf', repeat('d', 64), 8);

select lives_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'h2', '7a7a7a7a-0000-4000-8000-000000000001') $$,
  'the API places a record on a row of a signed sheet'
);
select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p1', '7a7a7a7a-0000-4000-8000-000000000001') $$,
  '23505', null, 'a record fills one live row'
);
select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'x1', '7a7a7a7a-0000-4000-8000-000000000003') $$,
  '23514', null, 'a row key is one of the form''s prefixes'
);
select lives_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 's1', '7a7a7a7a-0000-4000-8000-000000000003') $$,
  'the occupational safety sheet''s supplementary table has rows of its own'
);
delete from public.signed_sheet_rows where row_key = 's1';
select throws_ok(
  $$ insert into public.signed_sheets (organization_id, client_id, employee_id, domain, storage_path, digest, row_capacity)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 'sheets/again.pdf', repeat('d', 64), 8) $$,
  '23505', null, 'an employee has one sheet per domain and sequence'
);


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id)
     values ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  'a member records a generated signing agreement'
);
select lives_ok(
  $$ update public.employee_signing_agreements set state = 'signed_on_paper', signed_at = now(), marked_by = 'aaaaaaaa-0000-4000-8000-000000000001'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'and marks it signed on paper'
);
select throws_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, signed_at)
     values ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'signed_electronically', now()) $$,
  'SIG07', 'agreement_signed_electronically', 'but never as signed electronically'
);

select pg_temp.act_as_postgres();
insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, signed_at, storage_path, employee_signed_at, employer_signed_at) values
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'signed_electronically', now(), 'v2.pdf', now(), now());
select throws_ok(
  $$ update public.employee_signing_agreements set client_file_id = 'cfcfcfcf-0000-4000-8000-000000000002' where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '23503', null, 'an agreement''s scan is a file of its own client'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.employee_signing_agreements set state = 'generated', signed_at = null where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'SIG07', 'agreement_signed_electronically', 'a member does not undo an electronic agreement'
);
select throws_ok(
  $$ delete from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'SIG07', 'agreement_signed_electronically', 'nor deletes it'
);

select throws_ok(
  $$ select count(*) from public.signing_identities $$,
  '42501', null, 'a member reads no signing identity'
);
select throws_ok(
  $$ select count(*) from public.signing_sessions $$,
  '42501', null, 'nor any signing session'
);
select throws_ok(
  $$ insert into public.signed_sheets (organization_id, client_id, employee_id, domain, sequence, storage_path, digest, row_capacity)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', 2, 'sheets/x.pdf', repeat('d', 64), 8) $$,
  '42501', null, 'nor writes a signed sheet'
);
select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p1', '7a7a7a7a-0000-4000-8000-000000000003') $$,
  '42501', null, 'nor a row of one'
);

create temp table seen (who text, requests integer, signatures integer, agreements integer, sheets integer, sheet_rows integer);
grant all on seen to authenticated;

create or replace function pg_temp.record_seen(p_who text)
returns void language sql as $$
  insert into seen
  select p_who,
    (select count(*) from public.signature_requests),
    (select count(*) from public.training_signatures),
    (select count(*) from public.employee_signing_agreements),
    (select count(*) from public.signed_sheets),
    (select count(*) from public.signed_sheet_rows);
$$;

select pg_temp.record_seen('member');
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select pg_temp.record_seen('other organization');
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select pg_temp.record_seen('employee');
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000004');
select pg_temp.record_seen('other employee');
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');
select pg_temp.record_seen('administrator');
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');
select pg_temp.record_seen('stranger');

select results_eq(
  $$ select requests, signatures, agreements, sheets, sheet_rows from seen where who = 'member' $$,
  $$ values (11, 3, 2, 1, 1) $$,
  'a member reads the requests, signatures, agreements and sheets of the organization'
);
select results_eq(
  $$ select requests, signatures, agreements, sheets, sheet_rows from seen where who = 'other organization' $$,
  $$ values (1, 0, 0, 1, 0) $$,
  'another organization reads only its own'
);
select results_eq(
  $$ select requests, signatures, agreements, sheets, sheet_rows from seen where who = 'employee' $$,
  $$ values (7, 3, 1, 1, 1) $$,
  'an employee reads the requests and signatures on their own records, their agreement and their sheet'
);
select results_eq(
  $$ select requests, signatures, agreements, sheets, sheet_rows from seen where who = 'other employee' $$,
  $$ values (3, 0, 1, 0, 0) $$,
  'another employee reads none of the first one''s'
);
select results_eq(
  $$ select requests, signatures, agreements, sheets, sheet_rows from seen where who = 'administrator' $$,
  $$ values (10, 3, 2, 1, 1) $$,
  'the client administrator reads the client''s'
);
select results_eq(
  $$ select requests, signatures, agreements, sheets, sheet_rows from seen where who = 'stranger' $$,
  $$ values (0, 0, 0, 0, 0) $$,
  'a stranger reads nothing'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select results_eq(
  $$ select state || ':' || void_reason from public.signature_requests where id = '9a9a9a9a-0000-4000-8000-000000000005' $$,
  $$ values ('void:archived') $$,
  'a member''s pending request under a client archived since is void'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000003', 'trainee', 'dddddddd-0000-4000-8000-000000000001') $$,
  '42501', null, 'a participant issues no request'
);
select throws_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id)
     values ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001') $$,
  '42501', null, 'nor records an agreement'
);

select * from finish();
rollback;
