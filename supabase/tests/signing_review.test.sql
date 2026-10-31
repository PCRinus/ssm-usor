begin;
select plan(64);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@client.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sef@client.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com', '', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Client Two', '5022670', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Client Three', '22', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'ion@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'ana@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Marin', 'Dan', 'Sudor', '2020-03-01', null),
  ('e2e2e2e2-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Alt', 'Client', 'Sudor', '2020-03-01', null),
  ('e3e3e3e3-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000003', 'Arhivat', 'Ion', 'Sudor', '2020-03-01', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, source) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier', 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2025-04-10', 60, 'Material', 'Ion POP', 'Șef atelier', 'paper'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'psi', 'periodic', '2026-04-11', 60, 'Material', 'Ion POP', 'Șef atelier', 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-05-10', 60, 'Material', 'Ion POP', 'Șef atelier', 'app'),
  ('a2a2a2a2-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier', 'app'),
  ('a3a3a3a3-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier', 'app');

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation)
select v.id::uuid, t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('7a7a7a7a-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('7a7a7a7a-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002'),
  ('7a7a7a7a-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('7a7a7a7a-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('7a7a7a7a-0000-4000-8000-000000000005', 'a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('7a7a7a7a-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000004', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('7b7b7b7b-0000-4000-8000-000000000001', 'a2a2a2a2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001'),
  ('7c7c7c7c-0000-4000-8000-000000000001', 'a3a3a3a3-0000-4000-8000-000000000001', 'e3e3e3e3-0000-4000-8000-000000000001')
) as v (id, training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('88888888-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001'),
  ('88888888-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Elena Radu', 'dddddddd-0000-4000-8000-000000000002'),
  ('88888888-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Șef Atelier', 'dddddddd-0000-4000-8000-000000000003'),
  ('88888888-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'dddddddd-0000-4000-8000-000000000004');

insert into public.signing_sessions (id, account_id, place, participant_id, channel, address, code_hash, verified_at) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'portal', '88888888-0000-4000-8000-000000000001', 'email', 'ion@example.com', 'hash', now()),
  ('5e5e5e5e-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'app', null, 'email', 'specialist-a@test', 'hash', now()),
  ('5e5e5e5e-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', 'portal', '88888888-0000-4000-8000-000000000002', 'email', 'hr@client.test', 'hash', now()),
  ('5e5e5e5e-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003', 'portal', '88888888-0000-4000-8000-000000000003', 'email', 'sef@client.test', 'hash', now()),
  ('5e5e5e5e-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000002', 'app', null, 'email', 'specialist-a@test', 'hash', null);

insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id) values
  ('9a9a9a9a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'dddddddd-0000-4000-8000-000000000001'),
  ('9a9a9a9a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000002'),
  ('9a9a9a9a-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainer', 'dddddddd-0000-4000-8000-000000000003'),
  ('9a9a9a9a-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000005', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000002'),
  ('9a9a9a9a-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000004'),
  ('9a9a9a9a-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', '7c7c7c7c-0000-4000-8000-000000000001', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('9a9a9a9a-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000006', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000002');

insert into public.signing_session_items (session_id, position, request_id) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 0, '9a9a9a9a-0000-4000-8000-000000000001'),
  ('5e5e5e5e-0000-4000-8000-000000000002', 0, '9a9a9a9a-0000-4000-8000-000000000002'),
  ('5e5e5e5e-0000-4000-8000-000000000002', 1, '9a9a9a9a-0000-4000-8000-000000000004'),
  ('5e5e5e5e-0000-4000-8000-000000000004', 0, '9a9a9a9a-0000-4000-8000-000000000003');

insert into public.signed_sheets (id, organization_id, client_id, employee_id, domain, storage_path, digest, row_capacity, certified_at) values
  ('5d5d5d5d-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'ssm', '11111111-0000-4000-8000-000000000001/sheets/ion-ssm-1.pdf', repeat('d', 64), 17, now()),
  ('5d5d5d5d-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'e2e2e2e2-0000-4000-8000-000000000001', 'ssm', '11111111-0000-4000-8000-000000000001/sheets/alt-ssm-1.pdf', repeat('d', 64), 17, null);

insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id) values
  ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p1', '7a7a7a7a-0000-4000-8000-000000000003'),
  ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p2', '7a7a7a7a-0000-4000-8000-000000000001');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create or replace function pg_temp.sign(p_request uuid, p_session uuid, p_address text default null)
returns void language sql as $$
  insert into public.training_signatures (
    organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id,
    signer_name, channel, address, code_sent_at, code_verified_at, digest_before, digest_after,
    certificate_serial, client_ip, user_agent, signing_session_id
  )
  select q.organization_id, q.client_id, q.training_record_id, q.slot, q.id, 'electronic',
    q.signer_account_id, 'Semnatar', s.channel, coalesce(p_address, s.address),
    '2000-01-01', '2000-01-01', repeat('a', 64), repeat('b', 64), '01AB', '127.0.0.1', 'pgTAP', s.id
  from public.signature_requests q, public.signing_sessions s
  where q.id = p_request and s.id = p_session;
$$;

create or replace function pg_temp.request(p_id uuid)
returns text language sql security definer as $$
  select state || coalesce(':' || void_reason, '') from public.signature_requests where id = p_id;
$$;

create or replace function pg_temp.agreement_signature(p_employee uuid, p_party text, p_session uuid, p_path text default null)
returns void language sql as $$
  insert into public.agreement_signatures (
    organization_id, client_id, employee_id, party, signer_account_id, signer_name, channel, address,
    code_sent_at, code_verified_at, digest_before, digest_after, certificate_serial, signing_session_id,
    storage_path
  )
  select '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', p_employee,
    p_party, s.account_id, 'Semnatar', s.channel, s.address, now(), now(), repeat('a', 64),
    repeat('b', 64), '01', s.id,
    coalesce(p_path, '11111111-0000-4000-8000-000000000001/signing-agreements/' || p_party || '.pdf')
  from public.signing_sessions s where s.id = p_session;
$$;


select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000005') $$,
  'SIG09', 'session_mismatch', 'a session whose code was not verified signs nothing'
);
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000002', 'other@test') $$,
  'SIG09', 'session_mismatch', 'the evidence names the address the session''s code went to'
);
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000007', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  'SIG09', 'session_mismatch', 'a session signs only the items it listed'
);
select lives_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  'the API writes the evidence of a listed request with its verified session'
);
select results_eq(
  $$ select state, signing_session_id from public.signature_requests where id = '9a9a9a9a-0000-4000-8000-000000000002' $$,
  $$ values ('signed', '5e5e5e5e-0000-4000-8000-000000000002'::uuid) $$,
  'and the request is signed by the same write, with its session'
);
select ok(
  (select s.code_sent_at = x.code_sent_at and s.code_verified_at = x.verified_at
   from public.training_signatures s join public.signing_sessions x on x.id = s.signing_session_id
   where s.request_id = '9a9a9a9a-0000-4000-8000-000000000002'),
  'the code''s moments are the session''s, whatever the insert said'
);
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  'SIG08', 'request_not_pending', 'a signed request takes no second evidence'
);
select throws_ok(
  $$ update public.signing_sessions set attempts = 0 where id = '5e5e5e5e-0000-4000-8000-000000000002' $$,
  'SIG09', 'session_used', 'a verified session is spent'
);


update public.client_participants set revoked_at = now() where id = '88888888-0000-4000-8000-000000000003';
select is(
  pg_temp.request('9a9a9a9a-0000-4000-8000-000000000003'), 'void:signer_left',
  'revoking a participant voids the requests they no longer may sign'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainer', 'dddddddd-0000-4000-8000-000000000003') $$,
  'SIG05', 'signer_not_of_client', 'and they are not addressed again'
);
select throws_ok(
  $$ update public.signature_requests set signer_account_id = 'dddddddd-0000-4000-8000-000000000003' where id = '9a9a9a9a-0000-4000-8000-000000000005' $$,
  'SIG05', 'signer_not_of_client', 'not even by changing a request''s signer'
);

-- A member removed while a session runs: the request was voided with them, so the evidence finds
-- it void; with the request forced back to pending, the standing check refuses on its own.
delete from public.organization_members where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
select is(
  pg_temp.request('9a9a9a9a-0000-4000-8000-000000000004'), 'void:signer_left',
  'removing a member voids their pending requests'
);
select is(
  pg_temp.request('9a9a9a9a-0000-4000-8000-000000000002'), 'signed',
  'and leaves the signed ones'
);
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000004', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  'SIG08', 'request_not_pending', 'evidence on a void request is refused'
);
alter table public.signature_requests disable trigger signature_requests_stamp_void;
update public.signature_requests set state = 'pending', voided_at = null, void_reason = null, voided_by = null
where id = '9a9a9a9a-0000-4000-8000-000000000004';
alter table public.signature_requests enable trigger signature_requests_stamp_void;
select throws_ok(
  $$ select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000004', '5e5e5e5e-0000-4000-8000-000000000002') $$,
  'SIG05', 'signer_not_of_client', 'a signer without standing does not sign, whatever the request says'
);
insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');


update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000003';
select is(
  pg_temp.request('9a9a9a9a-0000-4000-8000-000000000006'), 'void:archived',
  'archiving a client voids its pending requests'
);


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select is_empty(
  $$ select signer_name from public.training_signatures where request_id = '9a9a9a9a-0000-4000-8000-000000000002' $$,
  'the employee reads no one else''s signature on their record: the portal reads it through the API'
);
select throws_ok(
  $$ select address from public.training_signatures $$,
  '42501', null, 'but not the address the code went to'
);
select throws_ok(
  $$ select client_ip, user_agent from public.training_signatures $$,
  '42501', null, 'nor the signer''s client'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');
select throws_ok(
  $$ select digest_after, certificate_serial, signing_session_id from public.training_signatures $$,
  '42501', null, 'the administrator reads no digest, certificate or session'
);
select throws_ok(
  $$ select code_sent_at, code_verified_at from public.training_signatures $$,
  '42501', null, 'nor the code''s moments'
);
select throws_ok(
  $$ select address from public.agreement_signatures $$,
  '42501', null, 'nor an agreement signature''s address'
);


select pg_temp.act_as_postgres();
select throws_ok(
  $$ update public.trainings set material = 'Altul' where id = 'a1a1a1a1-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_signed', 'a signed record''s training is frozen'
);
select throws_ok(
  $$ update public.training_records set employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' where id = '7a7a7a7a-0000-4000-8000-000000000001' $$,
  'SIG01', 'record_signed', 'and so is whose record it is'
);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.void_training_signatures('7a7a7a7a-0000-4000-8000-000000000001', 'Greșeală de dată'), 1, 'a member voids the signature');
select results_eq(
  $$ select void_reason, voided_by from public.training_signatures where request_id = '9a9a9a9a-0000-4000-8000-000000000002' $$,
  $$ values ('Greșeală de dată', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'the void names its member'
);
select results_eq(
  $$ select state, void_reason, voided_by from public.signature_requests where training_record_id = '7a7a7a7a-0000-4000-8000-000000000001' order by slot $$,
  $$ values ('void', 'Greșeală de dată', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid), ('void', 'Greșeală de dată', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'and so do its requests, signed and pending'
);
select isnt(
  (select voided_at from public.signed_sheet_rows where training_record_id = '7a7a7a7a-0000-4000-8000-000000000001'),
  null, 'and its row on the sheet is struck'
);

select results_eq(
  $$ select slot::text, signer_account_id from public.issue_signature_requests(
       '[{"training_record_id": "7a7a7a7a-0000-4000-8000-000000000001", "slot": "trainer", "signer_account_id": "aaaaaaaa-0000-4000-8000-000000000002", "replaces": null, "reason": null}]'::jsonb) $$,
  $$ values ('trainer', 'aaaaaaaa-0000-4000-8000-000000000002'::uuid) $$,
  'a member issues a save''s requests through one call'
);
select throws_ok(
  format(
    $$ select * from public.issue_signature_requests(
         '[{"training_record_id": "7a7a7a7a-0000-4000-8000-000000000001", "slot": "trainer", "signer_account_id": "dddddddd-0000-4000-8000-000000000003", "replaces": "%s", "reason": "signer_changed"}]'::jsonb) $$,
    (select id from public.signature_requests where training_record_id = '7a7a7a7a-0000-4000-8000-000000000001' and state = 'pending')
  ),
  'SIG05', 'signer_not_of_client', 'a replacement the database refuses'
);
select is(
  (select count(*)::int from public.signature_requests where training_record_id = '7a7a7a7a-0000-4000-8000-000000000001' and state = 'pending'),
  1, 'leaves the request it would have replaced pending'
);
select lives_ok(
  format(
    $$ select * from public.issue_signature_requests(
         '[{"training_record_id": "7a7a7a7a-0000-4000-8000-000000000001", "slot": "trainer", "signer_account_id": "aaaaaaaa-0000-4000-8000-000000000001", "replaces": "%s", "reason": "signer_changed"}]'::jsonb) $$,
    (select id from public.signature_requests where training_record_id = '7a7a7a7a-0000-4000-8000-000000000001' and state = 'pending')
  ),
  'and a replacement it takes voids the old request in the same call'
);
select results_eq(
  $$ select state || coalesce(':' || void_reason, ''), signer_account_id from public.signature_requests
     where training_record_id = '7a7a7a7a-0000-4000-8000-000000000001' and slot = 'trainer' and (state = 'pending' or void_reason = 'signer_changed')
     order by state $$,
  $$ values ('pending', 'aaaaaaaa-0000-4000-8000-000000000001'::uuid), ('void:signer_changed', 'aaaaaaaa-0000-4000-8000-000000000002'::uuid) $$,
  'the new signer''s request pending, the old one void with signer_changed'
);

select pg_temp.act_as_postgres();
select throws_ok(
  $$ update public.training_signatures set voided_by = 'aaaaaaaa-0000-4000-8000-000000000002' where request_id = '9a9a9a9a-0000-4000-8000-000000000002' $$,
  'SIG06', 'signature_written_once', 'a void is written once, its actor included'
);


select throws_ok(
  $$ update public.trainings set material = 'Altul' where id = 'a1a1a1a1-0000-4000-8000-000000000002' $$,
  'SIG01', 'record_signed', 'a record from paper printed on a certified sheet is frozen'
);
select throws_ok(
  $$ update public.trainings set source = 'app' where id = 'a1a1a1a1-0000-4000-8000-000000000002' $$,
  'SIG01', 'record_signed', 'its source too'
);
select throws_ok(
  $$ delete from public.training_records where id = '7a7a7a7a-0000-4000-8000-000000000003' $$,
  'SIG01', 'record_has_signatures', 'a record on a sheet is not deleted'
);
select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 'p5', '7b7b7b7b-0000-4000-8000-000000000001') $$,
  '23503', null, 'a row and its sheet are of one client'
);
select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p5', '7a7a7a7a-0000-4000-8000-000000000002') $$,
  '23514', 'row_not_of_sheet', 'a row holds a record of the sheet''s employee'
);
select throws_ok(
  $$ insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id)
     values ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p5', '7a7a7a7a-0000-4000-8000-000000000004') $$,
  '23514', 'row_not_of_sheet', 'of the sheet''s domain'
);


insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id) values
  ('9a9a9a9a-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000006', 'trainee', 'dddddddd-0000-4000-8000-000000000001');
update public.trainings set source = 'paper' where id = 'a1a1a1a1-0000-4000-8000-000000000004';
select is(
  pg_temp.request('9a9a9a9a-0000-4000-8000-000000000008'), 'void:record_changed',
  'switching a training to paper voids its pending requests'
);


insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, signer_account_id) values
  ('9a9a9a9a-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainer', 'aaaaaaaa-0000-4000-8000-000000000002');
insert into public.signing_session_items (session_id, position, request_id) values
  ('5e5e5e5e-0000-4000-8000-000000000002', 2, '9a9a9a9a-0000-4000-8000-000000000009');
select pg_temp.sign('9a9a9a9a-0000-4000-8000-000000000009', '5e5e5e5e-0000-4000-8000-000000000002');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.save_training(
       'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'supplementary', '2026-04-10', 60::smallint,
       'Material', 'Ion POP', 'Șef atelier', 'app',
       '[{"employee_id": "e1e1e1e1-0000-4000-8000-000000000002", "occupation": "Sudor"}, {"employee_id": "e1e1e1e1-0000-4000-8000-000000000003", "occupation": "Sudor"}, {"employee_id": "e1e1e1e1-0000-4000-8000-000000000001", "occupation": "Sudor"}]'::jsonb,
       'a1a1a1a1-0000-4000-8000-000000000001', p_supplementary_reason => 'after_accident') $$,
  'SIG01', 'record_signed', 'save_training does not move a signed record to another phase'
);


select lives_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, marked_by)
     values ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'in_contract', 'aaaaaaaa-0000-4000-8000-000000000002') $$,
  'a member records that a new hire''s contract carries the clause'
);
select is(
  (select marked_by from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'under their own name, whatever the request said'
);
select lives_ok(
  $$ update public.employee_signing_agreements set state = 'signed_on_paper', signed_at = now(), marked_by = 'aaaaaaaa-0000-4000-8000-000000000002'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  'and marks it signed on paper'
);
select is(
  (select marked_by from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'a forged marked_by is replaced'
);
select throws_ok(
  $$ delete from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  'SIG10', 'agreement_recorded', 'an agreement recorded as signed is not deleted'
);
select throws_ok(
  $$ truncate public.employee_signing_agreements $$,
  '42501', null, 'nor truncated'
);
select lives_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state)
     values ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'withdrawn') $$,
  'a member records that an employee returned to signing by hand'
);
select is(
  pg_temp.request('9a9a9a9a-0000-4000-8000-000000000005'), 'void:withdrawn',
  'which voids their pending trainee requests'
);
select throws_ok(
  $$ insert into public.signature_requests (organization_id, client_id, training_record_id, slot, signer_account_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000002', 'trainee', 'dddddddd-0000-4000-8000-000000000004') $$,
  'SIG05', 'agreement_withdrawn', 'and none is issued while it stands'
);
insert into public.employee_signing_agreements (employee_id, organization_id, client_id)
values ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001');

select pg_temp.act_as_postgres();
insert into public.signing_session_items (session_id, position, agreement_employee_id, agreement_party) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 1, 'e1e1e1e1-0000-4000-8000-000000000001', 'employee'),
  ('5e5e5e5e-0000-4000-8000-000000000003', 0, 'e1e1e1e1-0000-4000-8000-000000000001', 'employer'),
  ('5e5e5e5e-0000-4000-8000-000000000003', 1, 'e1e1e1e1-0000-4000-8000-000000000002', 'employee');
select throws_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employer', '5e5e5e5e-0000-4000-8000-000000000003') $$,
  'SIG10', 'agreement_not_awaiting', 'the employer does not sign before the employee'
);
select throws_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employee', '5e5e5e5e-0000-4000-8000-000000000003') $$,
  'SIG10', 'agreement_signer_not_party', 'the administrator does not sign as the employee'
);
select throws_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employee', '5e5e5e5e-0000-4000-8000-000000000001',
       'signing-agreements/c1c1c1c1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-000000000001/v1-abcd1234.pdf') $$,
  '23514', 'new row for relation "agreement_signatures" violates check constraint "agreement_signatures_path_in_organization"',
  'an agreement''s signed file is under its organization'
);
select lives_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employee', '5e5e5e5e-0000-4000-8000-000000000001') $$,
  'the employee signs their agreement'
);
select results_eq(
  $$ select state, storage_path, employee_signed_at is not null from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('generated', '11111111-0000-4000-8000-000000000001/signing-agreements/employee.pdf', true) $$,
  'and the agreement records it with the evidence'
);
select lives_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employer', '5e5e5e5e-0000-4000-8000-000000000003') $$,
  'then the administrator signs for the employer'
);
select results_eq(
  $$ select state, storage_path, signed_at = employer_signed_at from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('signed_electronically', '11111111-0000-4000-8000-000000000001/signing-agreements/employer.pdf', true) $$,
  'which settles the agreement'
);
select throws_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000002', 'employee', '5e5e5e5e-0000-4000-8000-000000000003') $$,
  'SIG10', 'agreement_not_awaiting', 'a withdrawn agreement takes no signature'
);


insert into public.signing_identities (account_id, subject_name, certificate_pem, certificate_serial, private_key_encrypted, not_before, not_after)
values ('aaaaaaaa-0000-4000-8000-000000000002', 'Ana Specialist', 'PEM', '01', '\x00', now(), now() + interval '2 years');
select throws_ok(
  $$ insert into public.signing_identities (account_id, subject_name, certificate_pem, certificate_serial, private_key_encrypted, not_before, not_after)
     values ('aaaaaaaa-0000-4000-8000-000000000002', 'Ana Specialist', 'PEM', '02', '\x00', now(), now() + interval '2 years') $$,
  '23505', null, 'an account has one live identity'
);
select throws_ok(
  $$ update public.signing_identities set subject_name = 'Altcineva' where certificate_serial = '01' $$,
  'SIG06', 'identity_kept', 'an identity is never changed'
);
update public.signing_identities set superseded_at = now() where certificate_serial = '01';
select lives_ok(
  $$ insert into public.signing_identities (account_id, subject_name, certificate_pem, certificate_serial, private_key_encrypted, not_before, not_after)
     values ('aaaaaaaa-0000-4000-8000-000000000002', 'Ana Specialist', 'PEM', '02', '\x00', now(), now() + interval '2 years') $$,
  'a reissue supersedes the old identity and keeps it'
);
select is(
  (select retry_after_seconds from public.create_signing_session(
     gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'app', 'email', 'owner-a@test', 'h', 10, 60)),
  0, 'a first code is sent'
);
select cmp_ok(
  (select retry_after_seconds from public.create_signing_session(
     gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'app', 'email', 'owner-a@test', 'h', 10, 60)),
  '>', 0, 'a second within the minute is refused with the seconds to wait'
);

select * from finish();
rollback;
