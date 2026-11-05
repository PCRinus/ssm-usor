begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000094', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'completion-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000094', 'Completion Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000094', '11111111-0000-4000-8000-000000000094', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000094', '11111111-0000-4000-8000-000000000094', 'Completare SRL', '1590082', 'client');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at, confirmed_at) values
  ('10000000-0000-4000-8000-000000000094', '11111111-0000-4000-8000-000000000094', 'client', 'cccccccc-0000-4000-8000-000000000094', true,
   'confirmed', '2026-10-01 09:00+00', '2026-10-01 09:30+00', '2026-10-01 10:00+00'),
  ('10000000-0000-4000-8000-000000000095', '11111111-0000-4000-8000-000000000094', 'client', 'cccccccc-0000-4000-8000-000000000094', true,
   'ready', '2026-11-01 09:00+00', '2026-11-01 09:30+00', null);

insert into public.import_library_parts (import_id, organization_id, part, status, proposal, read_at, confirmed_at) values
  ('10000000-0000-4000-8000-000000000094', '11111111-0000-4000-8000-000000000094', 'instructions_ssm', 'confirmed', '{}', '2026-10-01 09:30+00', '2026-10-02 10:00+00'),
  ('10000000-0000-4000-8000-000000000095', '11111111-0000-4000-8000-000000000094', 'risk_evaluations', 'to_review', '{}', '2026-11-01 09:30+00', null);

select has_column('public', 'import_copies', 'completed_at', 'a copy records when it was finished');

select ok(
  not has_function_privilege('authenticated', 'public.complete_import_copy(uuid, public.import_library_part)', 'execute')
  and not has_function_privilege('anon', 'public.complete_import_copy(uuid, public.import_library_part)', 'execute')
  and has_function_privilege('service_role', 'public.complete_import_copy(uuid, public.import_library_part)', 'execute'),
  'only the secret key completes a copy'
);

set local role service_role;

select public.record_import_copy('10000000-0000-4000-8000-000000000094');
select public.record_import_copy('10000000-0000-4000-8000-000000000094', 'instructions_ssm');

select ok(
  (select bool_and(completed_at is null) from public.import_copies where import_id = '10000000-0000-4000-8000-000000000094'),
  'a copy just recorded is not complete'
);

select isnt(
  public.complete_import_copy('10000000-0000-4000-8000-000000000094'),
  null,
  'completing it returns when'
);

select results_eq(
  $$ select part::text, completed_at is not null from public.import_copies
     where import_id = '10000000-0000-4000-8000-000000000094' order by part nulls first $$,
  $$ values (null::text, true), ('instructions_ssm', false) $$,
  'the import''s own copy is complete, and its part''s is not'
);

select public.complete_import_copy('10000000-0000-4000-8000-000000000094', 'instructions_ssm');

select ok(
  (select completed_at is not null from public.import_copies
   where import_id = '10000000-0000-4000-8000-000000000094' and part = 'instructions_ssm'),
  'a part''s copy is completed on its own'
);

select public.record_import_copy('10000000-0000-4000-8000-000000000094');

select ok(
  (select completed_at is null from public.import_copies
   where import_id = '10000000-0000-4000-8000-000000000094' and part is null),
  'a copy recorded again is incomplete until it is completed again'
);

select throws_ok(
  $$ select public.complete_import_copy('10000000-0000-4000-8000-000000000095') $$,
  'P0002', null,
  'a copy never recorded is not completed'
);

select throws_ok(
  $$ select public.complete_import_copy('10000000-0000-4000-8000-000000000094', 'risk_evaluations') $$,
  'P0002', null,
  'nor the copy of a part not recorded'
);

update public.import_copies set removed_at = now(), completed_at = null
where import_id = '10000000-0000-4000-8000-000000000094' and part is null;

select throws_ok(
  $$ select public.complete_import_copy('10000000-0000-4000-8000-000000000094') $$,
  'P0002', null,
  'nor a removed copy'
);

select throws_ok(
  $$ update public.import_copies set completed_at = written_at - interval '1 second'
     where import_id = '10000000-0000-4000-8000-000000000094' and part = 'instructions_ssm' $$,
  '23514', null,
  'a copy is not completed before it was begun'
);

reset role;

update public.imports set updated_at = '2026-11-01 09:30+00' where id = '10000000-0000-4000-8000-000000000095';
update public.import_library_parts set updated_at = '2026-11-01 09:30+00'
where import_id = '10000000-0000-4000-8000-000000000095';

select is(
  (select updated_at from public.imports where id = '10000000-0000-4000-8000-000000000095'),
  '2026-11-01 09:30+00'::timestamptz,
  'setting only updated_at keeps the value set'
);

update public.imports set reported_at = now(), reported_by = 'aaaaaaaa-0000-4000-8000-000000000094'
where id = '10000000-0000-4000-8000-000000000095';
update public.import_library_parts set reported_at = now(), reported_by = 'aaaaaaaa-0000-4000-8000-000000000094'
where import_id = '10000000-0000-4000-8000-000000000095';

select results_eq(
  $$ select updated_at from public.imports where id = '10000000-0000-4000-8000-000000000095'
     union all
     select updated_at from public.import_library_parts where import_id = '10000000-0000-4000-8000-000000000095' $$,
  $$ values ('2026-11-01 09:30+00'::timestamptz), ('2026-11-01 09:30+00'::timestamptz) $$,
  'a report does not restart the 14 days of an import or the hours of a part'
);

update public.imports set expensive_alerted_at = now() where id = '10000000-0000-4000-8000-000000000095';

select is(
  (select updated_at from public.imports where id = '10000000-0000-4000-8000-000000000095'),
  '2026-11-01 09:30+00'::timestamptz,
  'nor does marking the expensive alert sent'
);

select is_empty(
  $$ update public.imports set expensive_alerted_at = now()
     where id = '10000000-0000-4000-8000-000000000095' and expensive_alerted_at is null
     returning id $$,
  'the expensive alert is marked once'
);

update public.imports set reading_flags = '{"files": {"total": 1}}', reported_at = now()
where id = '10000000-0000-4000-8000-000000000095';
update public.import_library_parts set quality = '{}'
where import_id = '10000000-0000-4000-8000-000000000095';

select results_eq(
  $$ select updated_at = now() from public.imports where id = '10000000-0000-4000-8000-000000000095'
     union all
     select updated_at = now() from public.import_library_parts where import_id = '10000000-0000-4000-8000-000000000095' $$,
  $$ values (true), (true) $$,
  'any other change still moves updated_at, beside a report or not'
);

select * from finish();
rollback;
