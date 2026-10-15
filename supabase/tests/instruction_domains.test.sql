begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('f1f1f1f1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Contabil');

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

insert into public.instruction_modules (id, organization_id, title, module_group) values
  ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Scări metalice', 'work_equipment');
insert into public.instruction_modules (id, organization_id, title, module_group, domain) values
  ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lucrul cu foc deschis', 'work_activity', 'psi');

select is(
  (select domain::text from public.instruction_modules where id = 'a0a0a0a0-0000-4000-8000-000000000001'),
  'ssm',
  'a module is an occupational safety one unless said otherwise'
);

select is(
  (select needs_fire_instructions from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  null,
  'a new position is undecided about the fire-safety modules'
);

select throws_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000002', 'ssm') $$,
  'INS06',
  null,
  'a fire-safety module is not applied as an occupational safety decision'
);

select throws_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 'psi') $$,
  'INS06',
  null,
  'nor an occupational safety module as a fire-safety one'
);

select lives_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000002', 'psi') $$,
  'a fire-safety module is applied as a fire-safety decision'
);

select is(
  (select array[needs_instructions, needs_fire_instructions] from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  array[null, true]::boolean[],
  'it decides the fire-safety question and leaves the occupational safety one open'
);

select throws_ok(
  $$ update public.instruction_modules set domain = 'ssm' where id = 'a0a0a0a0-0000-4000-8000-000000000002' $$,
  'INS07',
  null,
  'the domain of a module a current position applies does not change'
);

select lives_ok(
  $$ update public.instruction_modules set domain = 'psi' where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  'the domain of a module nobody applies does'
);

update public.instruction_modules set domain = 'ssm' where id = 'a0a0a0a0-0000-4000-8000-000000000001';

select lives_ok(
  $$ insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id)
     values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001') $$,
  'a row without a domain is an occupational safety one'
);

select is(
  (select array[needs_instructions, needs_fire_instructions] from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  array[true, true]::boolean[],
  'each decision follows the rows of its own domain'
);

select throws_ok(
  $$ update public.job_positions set needs_fire_instructions = false where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'INS01',
  null,
  '"needs none" for fire safety is refused while a fire-safety module is applied'
);

select throws_ok(
  $$ update public.job_positions set needs_fire_instructions = true where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'INS02',
  null,
  '"needs fire-safety modules" without any is refused'
);

select lives_ok(
  $$ update public.job_positions set needs_fire_instructions = false where id = 'f1f1f1f1-0000-4000-8000-000000000002' $$,
  'a position decides that it needs no fire-safety module'
);

select is(
  (select needs_instructions from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000002'),
  null,
  'and stays undecided about the occupational safety ones'
);

delete from public.job_position_instructions
where job_position_id = 'f1f1f1f1-0000-4000-8000-000000000001' and domain = 'psi';

select is(
  (select array[needs_instructions, needs_fire_instructions] from public.job_positions where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
  array[true, null]::boolean[],
  'removing the last fire-safety module reopens only the fire-safety question'
);

select lives_ok(
  $$ update public.job_positions set needs_fire_instructions = false where id = 'f1f1f1f1-0000-4000-8000-000000000001' $$,
  'a position that applies occupational safety modules can need no fire-safety one'
);

select lives_ok(
  $$ update public.instruction_modules set domain = 'ssm' where id = 'a0a0a0a0-0000-4000-8000-000000000002' $$,
  'a module nobody applies any more changes its domain'
);

update public.instruction_modules set domain = 'psi' where id = 'a0a0a0a0-0000-4000-8000-000000000002';
insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain)
values ('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000002', 'a0a0a0a0-0000-4000-8000-000000000002', 'psi');
update public.job_positions set archived_at = now() where id = 'f1f1f1f1-0000-4000-8000-000000000002';

select lives_ok(
  $$ update public.instruction_modules set domain = 'ssm' where id = 'a0a0a0a0-0000-4000-8000-000000000002' $$,
  'an archived position does not hold the domain of the module it applied'
);

select * from finish();
rollback;
