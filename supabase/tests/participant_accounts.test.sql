begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, phone, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Ion@Example.com', null, '', '{"provider":"email"}', '{}', now(), now()),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '40721000002', '', '{"provider":"phone"}', '{}', now(), now());

select is(
  public.auth_user_id_by_address('email', 'ion@example.com'),
  'dddddddd-0000-4000-8000-000000000001'::uuid,
  'an email finds its account whatever its case'
);
select is(
  public.auth_user_id_by_address('sms', '+40721000002'),
  'dddddddd-0000-4000-8000-000000000002'::uuid,
  'a phone in E.164 finds the account Auth stores without the plus'
);
select is(public.auth_user_id_by_address('email', 'nobody@example.com'), null, 'an address without an account finds none');
select is(public.auth_user_id_by_address('sms', 'ion@example.com'), null, 'nor does an address of the other channel');

set local role authenticated;
select throws_ok(
  $$ select public.auth_user_id_by_address('email', 'ion@example.com') $$,
  '42501', null, 'a signed-in caller cannot ask whether an address has an account'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.auth_user_id_by_address('email', 'ion@example.com') $$,
  '42501', null, 'nor can an anonymous one'
);
reset role;

select * from finish();
rollback;
