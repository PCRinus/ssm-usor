begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'owner-b@example.com')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa', '1590082'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Beta', '5022670');

insert into public.job_positions (id, organization_id, client_id, name, staff_category) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Contabil', 'execution');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, status, cnp) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2024-01-01', 'active', '1900101400127'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Țăranu', 'Ștefan', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2024-01-01', 'active', null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Popescu', 'Ana', 'Contabil', '2024-01-01', 'active', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title, source) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-10-15', 60, 'Material', 'Ion POP', 'Șef atelier', 'Dan MARIN', 'Inspector', 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'su', 'periodic', '2026-09-15', 60, 'Material', 'Ion POP', 'Șef atelier', null, null, 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'su', 'periodic', '2026-08-15', 60, 'Material', 'Ion POP', 'Șef atelier', null, null, 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'su', 'periodic', '2026-07-15', 60, 'Material', 'Ion POP', 'Șef atelier', null, null, 'app'),
  ('a1a1a1a1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-04-15', null, null, null, null, null, null, 'paper'),
  ('a1a1a1a1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'ssm', 'periodic', '2026-10-15', 60, 'Material', 'Ion POP', 'Șef atelier', null, null, 'app');

insert into public.training_records (id, organization_id, client_id, training_id, phase, employee_id, occupation) values
  ('7a7a7a7a-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000002', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000003', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000002', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000003', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000004', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000001', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000005', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000002', 'Sudor'),
  ('7a7a7a7a-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000006', 'periodic', 'e1e1e1e1-0000-4000-8000-000000000004', 'Contabil');

-- The evidence the signing flow writes is not the view's concern: its checks are left out.
set local session_replication_role = replica;

insert into public.signing_sessions (id, account_id, channel, address, code_hash, verified_at, place) values
  ('5e5e5e5e-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'email', 'owner-a@example.com', 'x', now(), 'app');

insert into public.signature_requests (id, organization_id, client_id, training_record_id, slot, state, voided_at, void_reason) values
  ('9e9e9e9e-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000001', 'trainee', 'pending', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000004', 'trainee', 'signed', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000004', 'trainer', 'signed', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000005', 'trainee', 'void', now(), 'Greșit'),
  ('9e9e9e9e-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000005', 'trainer', 'signed', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000006', 'trainee', 'signed', null, null),
  ('9e9e9e9e-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', '7a7a7a7a-0000-4000-8000-000000000006', 'trainer', 'signed', null, null);

insert into public.training_signatures (organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id, signer_name, channel, address, code_sent_at, code_verified_at, digest_before, digest_after, certificate_serial, signing_session_id, marked_by, voided_at, void_reason)
select '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', v.record_id::uuid, v.slot::public.signer_slot, v.request_id::uuid, v.method,
  case v.method when 'electronic' then 'aaaaaaaa-0000-4000-8000-000000000001'::uuid end, 'Semnatar',
  case v.method when 'electronic' then 'email' end, case v.method when 'electronic' then 'owner-a@example.com' end,
  case v.method when 'electronic' then now() end, case v.method when 'electronic' then now() end,
  case v.method when 'electronic' then 'a' end, case v.method when 'electronic' then 'b' end,
  case v.method when 'electronic' then '01' end,
  case v.method when 'electronic' then '5e5e5e5e-0000-4000-8000-000000000001'::uuid end,
  case v.method when 'paper' then 'aaaaaaaa-0000-4000-8000-000000000001'::uuid end,
  case when v.voided then now() end, case when v.voided then 'Greșit' end
from (values
  ('7a7a7a7a-0000-4000-8000-000000000004', 'trainee', '9e9e9e9e-0000-4000-8000-000000000002', 'electronic', false),
  ('7a7a7a7a-0000-4000-8000-000000000004', 'trainer', '9e9e9e9e-0000-4000-8000-000000000003', 'electronic', false),
  ('7a7a7a7a-0000-4000-8000-000000000005', 'trainee', '9e9e9e9e-0000-4000-8000-000000000004', 'electronic', true),
  ('7a7a7a7a-0000-4000-8000-000000000005', 'trainer', '9e9e9e9e-0000-4000-8000-000000000005', 'paper', false),
  ('7a7a7a7a-0000-4000-8000-000000000006', 'trainee', '9e9e9e9e-0000-4000-8000-000000000006', 'paper', false),
  ('7a7a7a7a-0000-4000-8000-000000000006', 'trainer', '9e9e9e9e-0000-4000-8000-000000000007', 'paper', false)
) as v (record_id, slot, request_id, method, voided);

insert into public.signed_sheets (id, organization_id, client_id, employee_id, domain, storage_path, digest, row_capacity, certified_at) values
  ('5d5d5d5d-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'ssm',
   '11111111-0000-4000-8000-000000000001/sheets/v1.pdf', repeat('a', 64), 10, now());

insert into public.signed_sheet_rows (signed_sheet_id, client_id, row_key, training_record_id) values
  ('5d5d5d5d-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'p1', '7a7a7a7a-0000-4000-8000-000000000007');

set local session_replication_role = origin;

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select held_on::text, attendee_count, pending_trainee_count, pending_signer_count, signature_state
     from public.training_list where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' order by held_on desc $$,
  $$ values
    ('2026-10-15', 3, 3, 2, 'pending'),
    ('2026-09-15', 1, 0, 0, 'electronic'),
    ('2026-08-15', 1, 1, 0, 'pending'),
    ('2026-07-15', 1, 0, 0, 'paper'),
    ('2026-04-15', 1, 0, 0, 'paper') $$,
  'in the app a slot is signed only by a live signature, a pending, voided or unaddressed one is to sign, the trainer and verifier once over every record; a transcribed training is signed by hand'
);

select results_eq(
  $$ select held_on::text, signed, has_signatures, printed
     from public.training_list where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' order by held_on desc $$,
  $$ values
    ('2026-10-15', false, false, false),
    ('2026-09-15', true, true, false),
    ('2026-08-15', false, true, false),
    ('2026-07-15', false, true, false),
    ('2026-04-15', false, true, true) $$,
  'electronic freezes, a voided or paper signature only keeps from deletion, and a certified sheet row prints a transcribed training'
);

select is(
  (select search_names from public.training_list where id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  'ionescu ana | popescu ion | taranu stefan',
  'the attendees'' names are searched lowercase and without diacritics, one segment each'
);

select is(
  (select count(*)::integer from public.training_list
   where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and search_names ~ '(^|\|)(?=[^|]*popescu)(?=[^|]*ana)'),
  0,
  'two terms from two attendees match nothing'
);

select is(
  (select count(*)::integer from public.training_list
   where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and search_names ~ '(^|\|)(?=[^|]*stefan)(?=[^|]*taranu)'),
  2,
  'every term in one attendee''s name, in any order, finds each of their trainings'
);

select results_eq(
  $$ select attendee_count, pending_trainee_count, pending_signer_count, signature_state
     from public.training_list where client_id = 'c1c1c1c1-0000-4000-8000-000000000002' $$,
  $$ values (1, 1, 1, 'pending') $$,
  'a second client of the organization keeps its own counts'
);

select is(
  (select count(*)::integer from public.training_list where client_id = 'c1c1c1c1-0000-4000-8000-000000000001'),
  5,
  'the second client''s training does not join the first client''s list'
);

select is(
  (select attendee_count from public.training_list where id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  3,
  'a client''s count reads only its own records'
);

select hasnt_column('public', 'training_list', 'cnp', 'the list never reads the CNP');

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.training_list),
  0,
  'another organization sees none of the trainings'
);

select * from finish();
rollback;
