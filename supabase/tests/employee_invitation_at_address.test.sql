begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A'),
  ('22222222-0000-4000-8000-000000000002', 'Org B');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email, phone) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', null, null),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', null, '+40721000002'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Lazăr', 'Dan', 'Sudor', '2020-03-01', 'dan@example.com', null);

insert into public.participant_invitations (organization_id, client_id, kind, full_name, channel, address) values
  ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'client_administrator', 'Elena Radu', 'email', 'hr@client.test');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.contact(p_employee_id uuid)
returns text language sql security definer as $$
  select coalesce(email, '-') || ' ' || coalesce(phone, '-') from public.employees where id = p_employee_id;
$$;


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select results_eq(
  $$ select employee_id, channel, address
     from public.create_employee_invitation_at_address('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'sms', '+40742115980') $$,
  $$ values ('e1e1e1e1-0000-4000-8000-000000000001'::uuid, 'sms', '+40742115980') $$,
  'an employee with no contact is invited at a typed phone'
);
select is(
  pg_temp.contact('e1e1e1e1-0000-4000-8000-000000000001'),
  '- +40742115980',
  'which is saved to their row'
);

select lives_ok(
  $$ select public.create_employee_invitation_at_address('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000003', 'email', 'dan@example.com') $$,
  'an employee is invited at the email their row holds'
);
select is(
  pg_temp.contact('e1e1e1e1-0000-4000-8000-000000000003'),
  'dan@example.com -',
  'which stays as it was'
);

select throws_ok(
  $$ select public.create_employee_invitation_at_address('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'email', 'hr@client.test') $$,
  'PRT03', 'address_invited_for_another_person',
  'an address invited for another person is refused'
);
select is(
  pg_temp.contact('e1e1e1e1-0000-4000-8000-000000000002'),
  '- +40721000002',
  'and the refused address is not saved to the employee'
);

select throws_ok(
  $$ select public.create_employee_invitation_at_address('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000002', 'sms', '+40742115980') $$,
  'PRT03', 'address_invited_for_another_person',
  'a phone invited for another employee is refused'
);
select is(
  pg_temp.contact('e1e1e1e1-0000-4000-8000-000000000002'),
  '- +40721000002',
  'and the employee keeps their phone'
);


select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select throws_ok(
  $$ select public.create_employee_invitation_at_address('c1c1c1c1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-000000000001', 'email', 'x@example.com') $$,
  'P0002', 'client_not_found',
  'a member of another organization invites nobody here'
);

select * from finish();
rollback;
