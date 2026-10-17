begin;
select plan(94);

insert into auth.users (id, instance_id, aud, role, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', null, 'x', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', null, 'x', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', null, 'x', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Ion@Example.com', null, '', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '40721000002', '', null, now(), '{"provider":"phone"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@client.test', null, '', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending@example.com', null, '', null, null, '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test', null, 'x', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gone@example.com', null, '', now(), null, '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'arch@example.com', null, '', now(), null, '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Client Two', '14399840', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Archived of A', '22', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'Lead of A', '18547290', 'lead'),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'Client of B', '5022670', 'client');

insert into public.client_fire_safety (client_id, organization_id, administrative_training_interval_months, worker_training_interval_months) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 6, 2),
  ('c2c2c2c2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 6, 2);

insert into public.client_workplaces (id, organization_id, client_id, name) values
  ('f0f0f0f0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Atelier'),
  ('f0f0f0f0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Birou'),
  ('f0f0f0f0-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Depozit'),
  ('f0f0f0f0-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Hala B');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil'),
  ('b1b1b1b1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Stivuitorist'),
  ('b1b1b1b1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'Sudor'),
  ('b2b2b2b2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title, hired_at, email, phone) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'f0f0f0f0-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'ion@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000002', null, 'Ionescu', 'Ana', 'Contabil', '2020-03-01', null, '+40721000002'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', null, 'Plecat', 'Dan', 'Sudor', '2020-03-01', 'gone@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000003', null, 'Popescu', 'Ion', 'Stivuitorist', '2021-03-01', 'ion@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000004', null, 'Arhivat', 'Ion', 'Sudor', '2020-03-01', 'arch@example.com', null),
  ('e1e1e1e1-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', null, 'Dublu', 'Vasile', 'Sudor', '2020-03-01', 'twice@example.com', '+40721000006'),
  ('e2e2e2e2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', null, 'Străin', 'Bogdan', 'Sudor', '2020-03-01', 'b@example.com', null);

insert into public.trainings (id, organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'workplace', '2026-01-10', 120, 'Material', 'Ion POP', 'Șef atelier'),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'ssm', 'periodic', '2026-04-10', 60, 'Material', 'Ion POP', 'Șef atelier'),
  ('a1a1a1a1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'ssm', 'workplace', '2026-02-10', 120, 'Material', 'Ion POP', 'Șef depozit'),
  ('a2a2a2a2-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'ssm', 'workplace', '2026-01-10', 120, 'Material', 'Bogdan B', 'Șef');

insert into public.training_records (organization_id, client_id, training_id, phase, employee_id, occupation)
select t.organization_id, t.client_id, t.id, t.phase, v.employee_id::uuid, 'Sudor'
from (values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'e1e1e1e1-0000-4000-8000-000000000003'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'e1e1e1e1-0000-4000-8000-000000000004'),
  ('a2a2a2a2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001')
) as v (training_id, employee_id)
join public.trainings t on t.id = v.training_id::uuid;

insert into public.client_responsible_persons (organization_id, client_id, full_name, job_title, roles) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Maria Pop', 'Șef atelier', '{workplace_manager}'),
  ('22222222-0000-4000-8000-000000000002', 'c2c2c2c2-0000-4000-8000-000000000001', 'Bogdan B', 'Șef', '{workplace_manager}');

insert into public.document_templates (organization_id, type_key, title)
select null, v.type_key, v.title
from (values ('training_sheet_ssm', 'Fișa individuală SSM'), ('decision_training', 'Decizia de instruire')) as v (type_key, title)
where not exists (select 1 from public.document_templates t where t.organization_id is null and t.type_key = v.type_key);

insert into public.participant_invitations (id, organization_id, client_id, kind, employee_id, channel, address) values
  ('99999999-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'employee', 'e1e1e1e1-0000-4000-8000-000000000005', 'email', 'arch@example.com');

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

create or replace function pg_temp.invitation_id(p_address text, p_client_id uuid default 'c1c1c1c1-0000-4000-8000-000000000001')
returns uuid language sql security definer as $$
  select id from public.participant_invitations
  where address = p_address and client_id = p_client_id and accepted_at is null and revoked_at is null;
$$;

create or replace function pg_temp.backdate_send(p_address text)
returns void language sql security definer as $$
  update public.participant_invitations
  set last_sent_at = now() - interval '11 minutes'
  where address = p_address and accepted_at is null and revoked_at is null;
$$;


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select results_eq(
  $$ select kind::text, employee_id, full_name, channel, address, expires_at = now() + interval '30 days'
     from public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', ' ION@example.com ') $$,
  $$ values ('employee', 'e1e1e1e1-0000-4000-8000-000000000001'::uuid, null::text, 'email', 'ion@example.com', true) $$,
  'a specialist invites an employee at their email, normalized, for 30 days'
);
select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000002', null, 'sms', '+40721000002') $$,
  'and another at their phone'
);
select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000002', 'employee', 'e1e1e1e1-0000-4000-8000-000000000004', null, 'email', 'ion@example.com') $$,
  'the same address is invited at a second client'
);
select results_eq(
  $$ select kind::text, employee_id, full_name
     from public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, ' Elena Radu ', 'email', 'hr@client.test') $$,
  $$ values ('client_administrator', null::uuid, 'Elena Radu') $$,
  'a client administrator is invited by name'
);
select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Paul Pending', 'email', 'pending@example.com') $$,
  'and another one whose account is not confirmed'
);
select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000003', null, 'email', 'gone@example.com') $$,
  'an employee who will be revoked is invited'
);

select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', null, 'Fără Angajat', 'email', 'x@example.com') $$,
  'PRT04', 'employee_required', 'an employee participant needs the employee'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, '  ', 'email', 'x@example.com') $$,
  'PRT04', 'full_name_required', 'an administrator who is not an employee needs a name'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Ana Admin', 'email', 'not-an-email') $$,
  'PRT04', 'invalid_address', 'an email address must look like one'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Ana Admin', 'sms', '0721 000 002') $$,
  'PRT04', 'invalid_address', 'a phone must already be in E.164'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', 'other@example.com') $$,
  'PRT04', 'address_not_of_employee', 'an employee is invited at an address of their own row'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000004', null, 'email', 'ion@example.com') $$,
  'P0002', 'employee_not_found', 'an employee of another client is not invited here'
);
select throws_ok(
  $$ select public.create_participant_invitation('c2c2c2c2-0000-4000-8000-000000000001', 'employee', 'e2e2e2e2-0000-4000-8000-000000000001', null, 'email', 'b@example.com') $$,
  'P0002', 'client_not_found', 'a client of another organization is not found'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000003', 'employee', 'e1e1e1e1-0000-4000-8000-000000000005', null, 'email', 'arch@example.com') $$,
  'CLA01', null, 'nobody is invited at an archived client'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000004', 'client_administrator', null, 'Ana Lead', 'email', 'lead@example.com') $$,
  'CLL01', null, 'nobody is invited at a lead'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Someone Else', 'email', 'hr@client.test') $$,
  'PRT03', 'address_invited_for_another_person', 'an address invited for one person is not invited for another'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', 'ion@example.com') $$,
  'PRT05', 'resend_too_soon', 'inviting again at once counts as a resend and waits 10 minutes'
);
select throws_ok(
  format('select public.resend_participant_invitation(%L)', pg_temp.invitation_id('ion@example.com')),
  'PRT05', 'resend_too_soon', 'so does resending'
);

select pg_temp.backdate_send('ion@example.com');
select is(
  (select id from public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', 'ion@example.com')),
  pg_temp.invitation_id('ion@example.com'),
  'after 10 minutes inviting again renews the open row'
);
select is(
  (select count(*)::int from public.participant_invitations where client_id = 'c1c1c1c1-0000-4000-8000-000000000001' and address = 'ion@example.com'),
  1,
  'one invitation per address at a client'
);

select pg_temp.backdate_send('ion@example.com');
select pg_temp.act_as_postgres();
update public.participant_invitations set expires_at = now() - interval '1 day' where address = 'ion@example.com' and client_id = 'c1c1c1c1-0000-4000-8000-000000000001';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');
select is(
  (select expires_at from public.resend_participant_invitation(pg_temp.invitation_id('ion@example.com'))),
  now() + interval '30 days',
  'resending renews an expired invitation for 30 days'
);

select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000006', null, 'email', 'twice@example.com') $$,
  'an employee with an email and a phone is invited at one of them'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000006', null, 'sms', '+40721000006') $$,
  'PRT02', 'employee_already_invited', 'and not at the other while that invitation is open'
);
select is(
  public.revoke_participant_invitation(pg_temp.invitation_id('twice@example.com')),
  true,
  'a member revokes an open invitation'
);
select is(
  public.revoke_participant_invitation((select id from public.participant_invitations where address = 'twice@example.com')),
  false,
  'revoking it again does nothing'
);
select throws_ok(
  format('select public.resend_participant_invitation(%L)', (select id from public.participant_invitations where address = 'twice@example.com')),
  'PRT06', 'revoked', 'a revoked invitation is not resent'
);
select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000006', null, 'sms', '+40721000006') $$,
  'then the other address can be invited'
);

select throws_ok(
  $$ insert into public.participant_invitations (organization_id, client_id, kind, full_name, channel, address)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', 'Direct Insert', 'email', 'direct@example.com') $$,
  '42501', null, 'members write invitations through the functions only'
);
select throws_ok(
  format('select public.resend_participant_invitation(%L)', '99999999-0000-4000-8000-000000000005'),
  'CLA01', null, 'an invitation of an archived client is not resent'
);
select is(
  public.revoke_participant_invitation('99999999-0000-4000-8000-000000000005'),
  true,
  'but it is revoked'
);


select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select is((select count(*)::int from public.participant_invitations), 0, 'another organization reads none of the invitations');
select is(public.revoke_participant_invitation(pg_temp.invitation_id('hr@client.test')), false, 'nor revokes one');
select throws_ok(
  format('select public.resend_participant_invitation(%L)', pg_temp.invitation_id('hr@client.test')),
  'P0002', 'invitation_not_found', 'nor resends one'
);


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000005');

select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Stranger', 'email', 'stranger@test') $$,
  '42501', 'not_member', 'an account without a membership invites nobody'
);
select is(public.accept_participant_invitations(), 0, 'a stranger has nothing to accept');


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000001');

select is(public.current_organization_id(), null, 'a participant has no organization');
select is(public.accept_participant_invitations(), 2, 'signing in accepts the invitations at both clients');
select is(public.accept_participant_invitations(), 0, 'signing in again accepts nothing more');
select results_eq(
  $$ select organization_name, client_name, kind::text, employee_id, full_name, notice_version
     from public.current_participations() $$,
  $$ values
       ('Org A', 'Client One', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001'::uuid, 'Popescu Ion', null::text),
       ('Org A', 'Client Two', 'employee', 'e1e1e1e1-0000-4000-8000-000000000004'::uuid, 'Popescu Ion', null::text) $$,
  'the participant has one participation per client'
);
select results_eq(
  $$ select id from public.employees order by id $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000001'::uuid), ('e1e1e1e1-0000-4000-8000-000000000004'::uuid) $$,
  'an employee reads their own rows only'
);
select results_eq(
  $$ select training_id, employee_id from public.training_records order by training_id $$,
  $$ values ('a1a1a1a1-0000-4000-8000-000000000001'::uuid, 'e1e1e1e1-0000-4000-8000-000000000001'::uuid),
            ('a1a1a1a1-0000-4000-8000-000000000003'::uuid, 'e1e1e1e1-0000-4000-8000-000000000004'::uuid) $$,
  'their own training records only'
);
select results_eq(
  $$ select id from public.trainings order by id $$,
  $$ values ('a1a1a1a1-0000-4000-8000-000000000001'::uuid), ('a1a1a1a1-0000-4000-8000-000000000003'::uuid) $$,
  'the trainings they attended only'
);
select results_eq(
  $$ select legal_name from public.clients order by legal_name $$,
  $$ values ('Client One'), ('Client Two') $$,
  'their clients only'
);
select results_eq(
  $$ select name from public.organizations $$,
  $$ values ('Org A') $$,
  'the provider of their clients only'
);
select results_eq(
  $$ select id from public.job_positions order by id $$,
  $$ values ('b1b1b1b1-0000-4000-8000-000000000001'::uuid), ('b1b1b1b1-0000-4000-8000-000000000003'::uuid) $$,
  'their own job positions only'
);
select results_eq(
  $$ select name from public.client_workplaces order by name $$,
  $$ values ('Atelier'), ('Birou'), ('Depozit') $$,
  'the workplaces of their clients, which a sheet counts'
);
select results_eq(
  $$ select client_id from public.client_fire_safety $$,
  $$ values ('c1c1c1c1-0000-4000-8000-000000000001'::uuid) $$,
  'the fire-safety intervals of their clients'
);
select is((select count(*)::int from public.client_responsible_persons), 0, 'no responsible persons');
select results_eq(
  $$ select type_key from public.document_templates $$,
  $$ values ('training_sheet_ssm') $$,
  'the training sheet templates and no other'
);
select results_eq(
  $$ select employee_id, ssm_state::text from public.employee_training_status order by employee_id $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000001'::uuid, 'current'), ('e1e1e1e1-0000-4000-8000-000000000004'::uuid, 'current') $$,
  'their own training state'
);
select is((select count(*)::int from public.participant_invitations), 0, 'no invitations');
select is((select count(*)::int from public.client_participants), 2, 'their own participations');
select is(public.is_client_administrator('c1c1c1c1-0000-4000-8000-000000000001'), false, 'an employee is not a client administrator');

select throws_ok(
  $$ insert into public.employees (organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Nou', 'Nou', 'Sudor', '2026-01-01') $$,
  '42501', null, 'a participant adds no employee'
);
update public.employees set notes = 'Scris de participant' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Ion', 'email', 'friend@example.com') $$,
  '42501', 'not_member', 'a participant invites nobody'
);

select is(
  public.record_participant_notice((select participant_id from public.current_participations() where client_name = 'Client One'), '2026-10-17'),
  true,
  'a participant records the notice they were shown'
);
select results_eq(
  $$ select client_name, notice_version from public.current_participations() $$,
  $$ values ('Client One', '2026-10-17'), ('Client Two', null) $$,
  'on that participation only'
);


select pg_temp.act_as_postgres();
select results_eq(
  $$ select notes from public.employees where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values (null::text) $$,
  'and changes nothing it reads'
);
select results_eq(
  $$ select accepted_at is not null, participant_id is not null from public.participant_invitations where address = 'ion@example.com' order by client_id $$,
  $$ values (true, true), (true, true) $$,
  'the invitations are marked accepted with their participant'
);


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000002');

select is(public.accept_participant_invitations(), 1, 'a confirmed phone, stored without its plus, accepts the SMS invitation');
select results_eq(
  $$ select client_name, kind::text, full_name from public.current_participations() $$,
  $$ values ('Client One', 'employee', 'Ionescu Ana') $$,
  'as the employee it was sent for'
);
select results_eq(
  $$ select id from public.employees $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000002'::uuid) $$,
  'who reads only their own row'
);
select results_eq(
  $$ select name from public.job_positions $$,
  $$ values ('Contabil') $$,
  'and only their own position'
);


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000004');

select is(public.accept_participant_invitations(), 0, 'an unconfirmed address accepts nothing');


select pg_temp.act_as_postgres();
insert into public.participant_invitations (organization_id, client_id, kind, employee_id, channel, address)
values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000003', 'employee', 'e1e1e1e1-0000-4000-8000-000000000005', 'email', 'arch@example.com');
select pg_temp.act_as('dddddddd-0000-4000-8000-000000000007');
select is(public.accept_participant_invitations(), 0, 'an invitation of an archived client is not accepted');


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000003');

select is(public.accept_participant_invitations(), 1, 'the client administrator accepts');
select is(public.is_client_administrator('c1c1c1c1-0000-4000-8000-000000000001'), true, 'and administers the client');
select is(public.is_client_administrator('c1c1c1c1-0000-4000-8000-000000000002'), false, 'and no other');
select results_eq(
  $$ select id from public.employees order by id $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000001'::uuid), ('e1e1e1e1-0000-4000-8000-000000000002'::uuid),
            ('e1e1e1e1-0000-4000-8000-000000000003'::uuid), ('e1e1e1e1-0000-4000-8000-000000000006'::uuid) $$,
  'an administrator reads every employee of the client and none of another'
);
select is((select count(*)::int from public.training_records), 3, 'their training records');
select results_eq(
  $$ select id from public.trainings order by id $$,
  $$ values ('a1a1a1a1-0000-4000-8000-000000000001'::uuid), ('a1a1a1a1-0000-4000-8000-000000000002'::uuid) $$,
  'the client''s trainings'
);
select results_eq(
  $$ select name from public.job_positions order by name $$,
  $$ values ('Contabil'), ('Sudor') $$,
  'the client''s positions'
);
select results_eq(
  $$ select full_name from public.client_responsible_persons $$,
  $$ values ('Maria Pop') $$,
  'and the client''s responsible persons'
);
select is((select count(*)::int from public.employee_training_status), 4, 'and their training states');
select is(
  public.record_participant_notice((select participant_id from public.current_participations()), '2026-10-17'),
  true,
  'an administrator records their own notice'
);


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');

select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000001', null, 'email', 'ion@example.com') $$,
  'PRT01', 'employee_has_participant', 'an employee with an active participant is not invited again'
);
select throws_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', null, 'Ion Popescu', 'email', 'ion@example.com') $$,
  'PRT03', 'address_has_participant', 'nor is the address of an active participant'
);
select is(
  (select count(*)::int from public.employees),
  6,
  'a member still reads every employee of the organization'
);
select is((select count(*)::int from public.client_participants), 4, 'and the participants of its clients');


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000006');
select is(public.accept_participant_invitations(), 1, 'an employee who will be revoked accepts');
select is((select count(*)::int from public.training_records), 2, 'and reads their records');

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select is(
  public.revoke_client_participant((select id from public.client_participants where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003')),
  true,
  'a member revokes a participant'
);
select is(
  public.revoke_client_participant((select id from public.client_participants where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003')),
  false,
  'revoking them again does nothing'
);

select pg_temp.act_as('dddddddd-0000-4000-8000-000000000006');
select is((select count(*)::int from public.current_participations()), 0, 'a revoked participant has no participation');
select is((select count(*)::int from public.employees), 0, 'and reads no employee');
select is((select count(*)::int from public.training_records), 0, 'no training record');
select is((select count(*)::int from public.clients), 0, 'and no client');
select is(
  public.record_participant_notice((select id from public.client_participants), '2026-10-17'),
  false,
  'nor records a notice'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.create_participant_invitation('c1c1c1c1-0000-4000-8000-000000000001', 'employee', 'e1e1e1e1-0000-4000-8000-000000000003', null, 'email', 'gone@example.com') $$,
  'a revoked participant may be invited again'
);


select pg_temp.act_as('dddddddd-0000-4000-8000-000000000005');

select is((select count(*)::int from public.employees), 0, 'a stranger reads no employee');
select is((select count(*)::int from public.clients), 0, 'no client');
select is((select count(*)::int from public.organizations), 0, 'no organization');
select is((select count(*)::int from public.client_participants), 0, 'and no participant');


select pg_temp.act_as_postgres();
select throws_ok(
  $$ update public.employees set phone = '0721 000 002' where id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  '23514', null, 'an employee''s phone is stored in E.164'
);

select * from finish();
rollback;
