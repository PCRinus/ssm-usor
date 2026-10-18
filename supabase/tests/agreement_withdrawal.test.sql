begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, email) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01', 'ion@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Ionescu', 'Ana', 'Sudor', '2020-03-01', 'ana@example.com'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Marin', 'Dan', 'Sudor', '2020-03-01', 'dan@example.com');

insert into public.employee_signing_agreements (employee_id, organization_id, client_id, state, generated_at, signed_at, storage_path, employee_signed_at, employer_signed_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'signed_electronically', '2026-10-01 09:00+03', '2026-10-02 10:00+03', 'v2.pdf', '2026-10-01 10:00+03', '2026-10-02 10:00+03'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'generated', '2026-10-01 09:00+03', null, 'v1.pdf', '2026-10-01 10:00+03', null),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'signed_electronically', '2026-10-01 09:00+03', '2026-10-02 10:00+03', 'v2.pdf', '2026-10-01 10:00+03', '2026-10-02 10:00+03');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.employee_signing_agreements set state = 'withdrawn', signed_at = null, client_file_id = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'a member records the return to handwriting after the agreement was signed electronically'
);
select is(
  (select row(state, signed_at, storage_path, employee_signed_at, employer_signed_at, marked_by)::text
   from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001'),
  row('withdrawn', '2026-10-02 10:00+03'::timestamptz, 'v2.pdf', '2026-10-01 10:00+03'::timestamptz, '2026-10-02 10:00+03'::timestamptz, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid)::text,
  'and the signature''s times and file stay, the member marked as who recorded it'
);
select lives_ok(
  $$ update public.employee_signing_agreements set state = 'withdrawn', signed_at = null, client_file_id = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'and after the employee alone signed it'
);
select is(
  (select row(state, employee_signed_at, employer_signed_at)::text
   from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002'),
  row('withdrawn', '2026-10-01 10:00+03'::timestamptz, null::timestamptz)::text,
  'which keeps the employee''s signature'
);
select throws_ok(
  $$ update public.employee_signing_agreements set state = 'signed_on_paper', signed_at = now(), marked_by = 'aaaaaaaa-0000-4000-8000-000000000001'
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  'SIG07', 'agreement_signed_electronically', 'a member still does not mark on paper an agreement signed electronically'
);
select throws_ok(
  $$ update public.employee_signing_agreements set state = 'signed_on_paper', signed_at = now()
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'SIG07', 'agreement_signed_electronically', 'nor moves a withdrawn electronic agreement on'
);
select throws_ok(
  $$ update public.employee_signing_agreements set state = 'generated', signed_at = null
     where employee_id = 'e1e1e1e1-0000-4000-8000-000000000002' $$,
  'SIG07', 'agreement_signed_electronically', 'nor back to awaiting a signature'
);
select throws_ok(
  $$ delete from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000003' $$,
  'SIG07', 'agreement_signed_electronically', 'nor deletes an agreement signed electronically'
);
select throws_ok(
  $$ delete from public.employee_signing_agreements where employee_id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  'SIG07', 'agreement_signed_electronically', 'nor a withdrawn one'
);

select * from finish();
rollback;
