begin;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ion@example.com', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@client.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@example.com', '', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'ion@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'ana@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'ana@example.com');

insert into public.client_participants (organization_id, client_id, kind, employee_id, full_name, user_id) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Elena Radu', 'dddddddd-0000-4000-8000-000000000002'),
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'dddddddd-0000-4000-8000-000000000004');

insert into public.signing_sessions (id, account_id, place, participant_id, channel, address, code_hash, verified_at)
select v.id::uuid, p.user_id, 'portal', p.id, 'email', v.address, 'hash', now()
from (values
  ('5e5e5e5e-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'ion@example.com'),
  ('5e5e5e5e-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', 'hr@client.test')
) as v (id, user_id, address)
join public.client_participants p on p.user_id = v.user_id::uuid;

insert into public.employee_signing_agreements (employee_id, organization_id, client_id) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create or replace function pg_temp.agreement_signature(employee text, party text, account text, session text)
returns void language sql as $$
  insert into public.signing_session_items (session_id, position, agreement_employee_id, agreement_party)
  select session::uuid, coalesce(max(i.position) + 1, 0), employee::uuid, party
  from public.signing_session_items i where i.session_id = session::uuid
  on conflict (session_id, agreement_employee_id) do nothing;
  insert into public.agreement_signatures (
    organization_id, client_id, employee_id, party, signer_account_id, signer_name, channel, address,
    code_sent_at, code_verified_at, digest_before, digest_after, certificate_serial, signing_session_id,
    storage_path
  )
  select
    '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', employee::uuid, party,
    account::uuid, 'Popescu Ion', s.channel, s.address, now(), now(), 'a', 'b', '01', s.id,
    '11111111-0000-4000-8000-000000000001/v-' || party || '.pdf'
  from public.signing_sessions s where s.id = session::uuid;
$$;

select has_column('public', 'employee_signing_agreements', 'storage_path', 'the agreement keeps its stored file');
select has_column('public', 'employee_signing_agreements', 'employee_signed_at', 'and when the employee signed it');
select has_column('public', 'employee_signing_agreements', 'employer_signed_at', 'and when the employer did');

select throws_ok(
  $$ insert into public.signing_session_items (session_id, position) values ('5e5e5e5e-0000-4000-8000-000000000001', 0) $$,
  '23514', null, 'a session item is a request or an agreement'
);
select throws_ok(
  $$ insert into public.signing_session_items (session_id, position, agreement_employee_id)
     values ('5e5e5e5e-0000-4000-8000-000000000001', 0, 'e1e1e1e1-0000-4000-8000-000000000001') $$,
  '23514', null, 'an agreement item names its party'
);
select lives_ok(
  $$ insert into public.signing_session_items (session_id, position, agreement_employee_id, agreement_party)
     values ('5e5e5e5e-0000-4000-8000-000000000001', 0, 'e1e1e1e1-0000-4000-8000-000000000001', 'employee') $$,
  'the secret key records what a session signs'
);
select lives_ok(
  $$ insert into public.signing_session_items (session_id, position, agreement_employee_id, agreement_party)
     values ('5e5e5e5e-0000-4000-8000-000000000001', 2, 'e1e1e1e1-0000-4000-8000-000000000003', 'employee') $$,
  'an agreement item may precede the agreement row: the employee signs from the first sign-in'
);
select throws_ok(
  $$ insert into public.signing_session_items (session_id, position, agreement_employee_id, agreement_party)
     values ('5e5e5e5e-0000-4000-8000-000000000001', 3, 'e1e1e1e1-0000-4000-8000-000000000009', 'employee') $$,
  '23503', null, 'but it names an employee of the client'
);
select throws_ok(
  $$ insert into public.signing_session_items (session_id, position, agreement_employee_id, agreement_party)
     values ('5e5e5e5e-0000-4000-8000-000000000001', 1, 'e1e1e1e1-0000-4000-8000-000000000001', 'employee') $$,
  '23505', null, 'each agreement once per session'
);
select throws_ok(
  $$ update public.employee_signing_agreements set employer_signed_at = now(), storage_path = 'x.pdf'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '23514', null, 'the employer signs after the employee'
);
select throws_ok(
  $$ update public.employee_signing_agreements set employee_signed_at = now()
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '23514', null, 'a signed agreement has its stored file'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select throws_ok(
  $$ select count(*) from public.signing_session_items $$,
  '42501', null, 'a participant reads no session item'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ select count(*) from public.signing_session_items $$,
  '42501', null, 'nor does a member'
);
select throws_ok(
  $$ insert into public.employee_signing_agreements (employee_id, organization_id, client_id, storage_path)
     values ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'x.pdf') $$,
  '42501', null, 'a member does not insert the electronic columns'
);
select throws_ok(
  $$ update public.employee_signing_agreements set employee_signed_at = now(), storage_path = 'x.pdf'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '42501', null, 'nor updates them'
);
select lives_ok(
  $$ update public.employee_signing_agreements set generated_at = now()
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'a member still changes an agreement nobody has signed'
);

select pg_temp.act_as_postgres();
select lives_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employee', 'dddddddd-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000001') $$,
  'the secret key writes the employee''s evidence'
);
select throws_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employee', 'dddddddd-0000-4000-8000-000000000001', '5e5e5e5e-0000-4000-8000-000000000001') $$,
  'SIG10', 'agreement_not_awaiting', 'once per party'
);
select throws_ok(
  $$ update public.agreement_signatures set signer_name = 'Altcineva' $$,
  'SIG06', 'signature_written_once', 'an agreement signature is never changed'
);
select throws_ok(
  $$ delete from public.agreement_signatures $$,
  'SIG06', 'signature_written_once', 'nor deleted'
);
select throws_ok(
  $$ delete from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  '23503', null, 'and an agreement with evidence stays'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.employee_signing_agreements set state = 'signed_on_paper', signed_at = now(), marked_by = 'aaaaaaaa-0000-4000-8000-000000000001'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'SIG07', 'agreement_signed_electronically', 'a member does not mark on paper an agreement the employee signed electronically'
);
select is(
  (select count(*)::int from public.agreement_signatures), 1, 'members read their agreement signatures'
);
select throws_ok(
  $$ select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000002', 'employee', 'dddddddd-0000-4000-8000-000000000004', '5e5e5e5e-0000-4000-8000-000000000001') $$,
  '42501', null, 'but never write one'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.agreement_signatures), 1, 'the employee reads the evidence on their own agreement'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000004');
select is(
  (select count(*)::int from public.agreement_signatures), 0, 'another employee does not'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.agreement_signatures), 1, 'the client administrator reads the client''s'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.agreement_signatures), 0, 'another organization reads none'
);

select pg_temp.act_as_postgres();
select pg_temp.agreement_signature('e1e1e1e1-0000-4000-8000-000000000001', 'employer', 'dddddddd-0000-4000-8000-000000000002', '5e5e5e5e-0000-4000-8000-000000000002');
select is(
  (select state from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  'signed_electronically', 'the secret key settles the agreement once both have signed'
);

select * from finish();
rollback;
