begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), '{"provider":"email"}', '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'owner-b@example.com'),
  ('dddddddd-0000-4000-8000-000000000001', 'activ@example.com'),
  ('dddddddd-0000-4000-8000-000000000002', 'revocat@example.com'),
  ('dddddddd-0000-4000-8000-000000000003', 'admin@example.com'),
  ('dddddddd-0000-4000-8000-000000000004', 'reinvitat@example.com')
) as v (id, email);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, worker_training_interval_months, administrative_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Alfa', '1590082', 3, 6),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Beta', '5022670', 3, 6);

insert into public.job_positions (id, organization_id, client_id, name, staff_category) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor', 'execution'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Contabil', 'technical_administrative');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email, phone) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Activ', 'Ion', 'Sudor', '2024-01-01', 'activ@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Invitat', 'Ana', 'Sudor', '2024-01-01', null, '+40721000002'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Expirat', 'Dan', 'Sudor', '2024-01-01', 'expirat@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Revocat', 'Vasile', 'Sudor', '2024-01-01', 'revocat@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Neinvitat', 'Maria', 'Sudor', '2024-01-01', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Administrator', 'Călin', 'Sudor', '2024-01-01', 'admin@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Reinvitat', 'Paul', 'Sudor', '2024-01-01', 'reinvitat@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000008', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Altundeva', 'Ion', 'Contabil', '2024-01-01', 'activ@example.com', null);

insert into public.client_participants (id, organization_id, client_id, kind, employee_id, full_name, user_id, created_at, revoked_at, language) values
  ('88888888-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'dddddddd-0000-4000-8000-000000000001', '2026-10-10 09:00+00', null, 'en'),
  ('88888888-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000004', null, 'dddddddd-0000-4000-8000-000000000002', '2026-10-01 09:00+00', '2026-11-05 09:00+00', 'ro'),
  ('88888888-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', 'e1e1e1e1-0000-4000-8000-000000000006', null, 'dddddddd-0000-4000-8000-000000000003', '2026-10-12 09:00+00', null, null),
  ('88888888-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000007', null, 'dddddddd-0000-4000-8000-000000000004', '2026-09-01 09:00+00', '2026-09-20 09:00+00', null);

insert into public.participant_invitations (id, organization_id, client_id, kind, employee_id, full_name, channel, address, last_sent_at, expires_at, accepted_at, revoked_at, participant_id, created_at) values
  ('99999999-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', 'activ@example.com', '2026-10-09 09:00+00', '2026-11-08 09:00+00', '2026-10-10 09:00+00', null, '88888888-0000-4000-8000-000000000001', '2026-10-09 09:00+00'),
  ('99999999-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'sms', '+40721000002', now() - interval '1 day', now() + interval '29 days', null, null, null, now() - interval '1 day'),
  ('99999999-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000003', null, 'email', 'expirat@example.com', now() - interval '40 days', now() - interval '10 days', null, null, null, now() - interval '40 days'),
  ('99999999-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000004', null, 'email', 'revocat@example.com', '2026-09-30 09:00+00', '2026-10-30 09:00+00', '2026-10-01 09:00+00', null, '88888888-0000-4000-8000-000000000002', '2026-09-30 09:00+00'),
  ('99999999-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000004', null, 'email', 'vechi@example.com', '2026-08-01 09:00+00', '2026-08-31 09:00+00', null, '2026-08-02 09:00+00', null, '2026-08-01 09:00+00'),
  ('99999999-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', 'e1e1e1e1-0000-4000-8000-000000000006', null, 'email', 'admin@example.com', '2026-10-11 09:00+00', '2026-11-10 09:00+00', '2026-10-12 09:00+00', null, '88888888-0000-4000-8000-000000000003', '2026-10-11 09:00+00'),
  ('99999999-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000007', null, 'email', 'reinvitat@example.com', now() - interval '2 days', now() + interval '28 days', null, null, null, now() - interval '2 days');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select last_name, portal_state, portal_rank from public.employee_list
     where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' order by portal_rank, last_name $$,
  $$ values
    ('Activ', 'active', 0),
    ('Administrator', 'active', 0),
    ('Invitat', 'invited', 1),
    ('Reinvitat', 'invited', 1),
    ('Expirat', 'expired', 2),
    ('Neinvitat', 'none', 3),
    ('Revocat', 'revoked', 4) $$,
  'each employee has one standing, in the order the tab sorts it: a new invitation outranks an earlier revoked access'
);

select results_eq(
  $$ select portal_since, portal_channel, portal_address, portal_language, portal_participant_id, portal_invitation_id, portal_administrator
     from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('2026-10-10 09:00+00'::timestamptz, 'email', 'activ@example.com', 'en', '88888888-0000-4000-8000-000000000001'::uuid, null::uuid, false) $$,
  'an active participant carries the day access began, the address it was accepted at and the language chosen'
);

select results_eq(
  $$ select portal_channel, portal_address, portal_invitation_id, portal_participant_id, portal_expires_at > now()
     from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  $$ values ('sms', '+40721000002', '99999999-0000-4000-8000-000000000002'::uuid, null::uuid, true) $$,
  'a pending invitation carries its address, its id and when it expires'
);

select results_eq(
  $$ select portal_revoked_at, portal_address, portal_participant_id
     from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000004' $$,
  $$ values ('2026-11-05 09:00+00'::timestamptz, 'revocat@example.com', '88888888-0000-4000-8000-000000000002'::uuid) $$,
  'a revoked standing is the latest of the revoked participant and the revoked invitation'
);

select results_eq(
  $$ select portal_state, portal_administrator, portal_participant_id
     from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000006' $$,
  $$ values ('active', true, '88888888-0000-4000-8000-000000000003'::uuid) $$,
  'the client administrator who is an employee of the client is that employee''s standing'
);

select results_eq(
  $$ select portal_state, portal_channel, portal_address, portal_administrator
     from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000005' $$,
  $$ values ('none', null::text, null::text, false) $$,
  'an employee never invited has no standing'
);

select is(
  (select portal_state from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000008'),
  'none',
  'a standing at one client is not the standing of the same address at another client'
);

update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000001';

select is(
  (select portal_state from public.employee_list where id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  'active',
  'an archived client''s employees keep their standing, which can still be revoked'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from public.employee_list where portal_state <> 'none'),
  0,
  'another organization reads no standing'
);

select * from finish();
rollback;
