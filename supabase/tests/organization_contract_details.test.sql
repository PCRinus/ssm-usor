begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.organizations
     set phone = '0722 776 011', iban = 'RO49AAAA1B31007593840000', bank_name = 'Banca Transilvania',
         authorization_certificate_number = '17664', authorization_certificate_date = '2022-09-30',
         authorization_certificate_issuer = 'DMPS Timiș', vat_payer = true,
         fire_safety_technician_name = 'Ana Pop', fire_safety_technician_certificate = 'CT 123'
     where id = '11111111-0000-4000-8000-000000000001' $$,
  'an owner fills in what contracts print'
);

select throws_ok(
  $$ update public.organizations set iban = 'RO49 AAAA 1B31 0075 9384 0000'
     where id = '11111111-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'the IBAN is stored without spaces'
);

select throws_ok(
  $$ update public.organizations set name = 'Renamed' where id = '11111111-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'the name stays out of reach, as before'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

select is_empty(
  $$ update public.organizations set iban = null
     where id = '11111111-0000-4000-8000-000000000001' returning id $$,
  'a specialist changes none of it'
);

select results_eq(
  $$ select iban, vat_payer from public.organizations $$,
  $$ values ('RO49AAAA1B31007593840000', true) $$,
  'and what the owner wrote is still there'
);

select * from finish();
rollback;
