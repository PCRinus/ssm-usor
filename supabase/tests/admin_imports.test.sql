begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), v.app_metadata::jsonb, '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'owner-admin-imports@example.com', '{"provider":"email"}'),
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'admin-imports@example.com', '{"provider":"email","role":"admin"}')
) as v (id, email, app_metadata);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-0000000000a1', 'Protecția Muncii Expert SRL'),
  ('11111111-0000-4000-8000-0000000000a2', 'Alt Prestator SRL');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1', 'Construcții Vest SRL', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-0000000000a2', '11111111-0000-4000-8000-0000000000a2', 'Panificația Nord SRL', '5022670', 'client');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, created_at, started_at, ready_at, confirmed_at, reported_at, cost_usd) values
  ('10000000-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1', 'client', 'cccccccc-0000-4000-8000-0000000000a1', true, 'confirmed',
   now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', now() - interval '2 days', null, 0.42),
  ('10000000-0000-4000-8000-0000000000a2', '11111111-0000-4000-8000-0000000000a2', 'employees', 'cccccccc-0000-4000-8000-0000000000a2', true, 'ready',
   now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', null, now() - interval '1 hour', 0.10);

insert into public.import_library_parts (import_id, organization_id, part, status, proposal, read_at, reported_at) values
  ('10000000-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1', 'risk_evaluations', 'to_review', '{}', now() - interval '3 days', now() - interval '2 hours');

insert into public.import_copies (id, organization_id, import_id, part, written_at, expires_at) values
  ('c0c0c0c0-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', null,
   now() - interval '2 days', now() - interval '2 days' + interval '12 months'),
  ('c0c0c0c0-0000-4000-8000-0000000000a2', '11111111-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'risk_evaluations',
   now() - interval '2 days', now() - interval '2 days' + interval '12 months'),
  ('c0c0c0c0-0000-4000-8000-0000000000a3', '11111111-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a9', null,
   now() - interval '20 days', now() - interval '35 days' + interval '12 months');

create or replace function pg_temp.act_as(p_user_id text, p_headers jsonb default '{}')
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true),
         set_config('request.headers', p_headers::text, true);
$$;

create or replace function pg_temp.act_as_secret_key(p_headers jsonb default '{}')
returns void language sql as $$
  select set_config('role', 'service_role', true),
         set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.headers', p_headers::text, true);
$$;

create or replace function pg_temp.act_as_postgres()
returns void language sql as $$
  select set_config('role', 'postgres', true),
         set_config('request.jwt.claims', '', true),
         set_config('request.headers', '', true);
$$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

select ok(
  has_function_privilege('service_role', 'public.record_admin_event(text, text, uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.record_admin_event(text, text, uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_admin_event(text, text, uuid, uuid, jsonb)', 'execute'),
  'only the secret key records an admin event'
);
select ok(
  has_function_privilege('service_role', 'public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer)', 'execute')
    and not has_function_privilege('anon', 'public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer)', 'execute'),
  'only the secret key lists every organization''s imports'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select public.record_admin_event('import_copy_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1') $$,
  '42501',
  null,
  'an admin''s own token cannot record one'
);
select pg_temp.act_as_postgres();

select pg_temp.act_as_secret_key('{"x-audit-actor": "eeeeeeee-0000-4000-8000-0000000000a1"}');
select isnt(
  public.record_admin_event('import_copy_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a1',
    '11111111-0000-4000-8000-0000000000a1', '{"import_id": "10000000-0000-4000-8000-0000000000a1"}'),
  null,
  'the API records a copy opened for the admin it names'
);
select isnt(
  public.record_admin_event('import_copy_file_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a2',
    '11111111-0000-4000-8000-0000000000a1', '{"path": "parts/risk_evaluations/files/f1.risk_evaluations.1.answer.json"}'),
  null,
  'and a file of it opened'
);
select pg_temp.act_as_postgres();

select results_eq(
  $$ select action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source
     from audit.events where action like 'import_copy%' order by id $$,
  $$ values
     ('import_copy_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a1'::uuid, '11111111-0000-4000-8000-0000000000a1'::uuid,
      '{"import_id": "10000000-0000-4000-8000-0000000000a1"}'::jsonb, 'eeeeeeee-0000-4000-8000-0000000000a1'::uuid, null::uuid, 'api'),
     ('import_copy_file_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a2'::uuid, '11111111-0000-4000-8000-0000000000a1'::uuid,
      '{"path": "parts/risk_evaluations/files/f1.risk_evaluations.1.answer.json"}'::jsonb, 'eeeeeeee-0000-4000-8000-0000000000a1'::uuid, null::uuid, 'api') $$,
  'the events name the admin, the organization, the copy and the file'
);

insert into public.impersonations (admin_user_id, target_user_id, reason)
values ('eeeeeeee-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'Ajut la import');
select pg_temp.act_as_secret_key('{"x-audit-actor": "eeeeeeee-0000-4000-8000-0000000000a1"}');
select public.record_admin_event('import_copy_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1');
select pg_temp.act_as_postgres();
select is(
  (select impersonating_user_id from audit.events where action = 'import_copy_opened' order by id desc limit 1),
  null,
  'an admin opening a copy during an impersonation acts as himself'
);

select pg_temp.act_as_secret_key('{"x-audit-actor": "aaaaaaaa-0000-4000-8000-0000000000a1"}');
select throws_ok(
  $$ select public.record_admin_event('import_copy_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1') $$,
  'AUD02',
  null,
  'a member named by the API is refused'
);
select pg_temp.act_as_postgres();

select pg_temp.act_as_secret_key();
select throws_ok(
  $$ select public.record_admin_event('import_copy_opened', 'import_copies', 'c0c0c0c0-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1') $$,
  'AUD02',
  null,
  'and so is the secret key acting for nobody'
);
select pg_temp.act_as_postgres();

select pg_temp.act_as_secret_key('{"x-audit-actor": "eeeeeeee-0000-4000-8000-0000000000a1"}');
select throws_ok(
  $$ select public.record_admin_event('client_deleted', 'clients', 'c0c0c0c0-0000-4000-8000-0000000000a1', '11111111-0000-4000-8000-0000000000a1') $$,
  '22023',
  null,
  'it records only the admin events'
);

select results_eq(
  $$ select import_id, organization_name, row_deleted, kind, status, cost_usd, reported_at is not null,
       copy_written_at is not null, part_copies, total
     from public.admin_list_imports() $$,
  $$ values
     ('10000000-0000-4000-8000-0000000000a2'::uuid, 'Alt Prestator SRL', false, 'employees'::public.import_kind, 'ready'::public.import_status, 0.10::numeric, true, false, 0, 3::bigint),
     ('10000000-0000-4000-8000-0000000000a1'::uuid, 'Protecția Muncii Expert SRL', false, 'client'::public.import_kind, 'confirmed'::public.import_status, 0.42::numeric, true, true, 1, 3::bigint),
     ('10000000-0000-4000-8000-0000000000a9'::uuid, 'Protecția Muncii Expert SRL', true, null::public.import_kind, null::public.import_status, null::numeric, false, true, 0, 3::bigint) $$,
  'the list holds every organization''s imports newest first, and an import known only by its copy'
);
select is(
  (select ended_at from public.admin_list_imports(p_status => 'row_deleted')),
  (select expires_at - interval '12 months' from public.import_copies where id = 'c0c0c0c0-0000-4000-8000-0000000000a3'),
  'an import whose row is gone ended when its copy''s 12 months began'
);
select is(
  (select ended_at from public.admin_list_imports(p_kind => 'client')),
  (select confirmed_at from public.imports where id = '10000000-0000-4000-8000-0000000000a1'),
  'filtered by kind, the imports known only by their copy drop out'
);
select results_eq(
  $$ select import_id from public.admin_list_imports(p_status => 'confirmed') $$,
  $$ values ('10000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'filtered by status'
);
select results_eq(
  $$ select import_id from public.admin_list_imports(p_has_copy => true) $$,
  $$ values ('10000000-0000-4000-8000-0000000000a1'::uuid), ('10000000-0000-4000-8000-0000000000a9'::uuid) $$,
  'filtered to those with a copy kept'
);
select results_eq(
  $$ select import_id from public.admin_list_imports(p_reported => true) $$,
  $$ values ('10000000-0000-4000-8000-0000000000a2'::uuid), ('10000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'filtered to the reported ones, a part''s report counting for its import'
);
select results_eq(
  $$ select import_id, total from public.admin_list_imports(p_limit => 1, p_offset => 1) $$,
  $$ values ('10000000-0000-4000-8000-0000000000a1'::uuid, 3::bigint) $$,
  'a page of the list carries the total'
);

update public.import_copies set removed_at = now(), expires_at = now() - interval '1 minute'
where id = 'c0c0c0c0-0000-4000-8000-0000000000a3';
select results_eq(
  $$ select import_id from public.admin_list_imports(p_has_copy => true) $$,
  $$ values ('10000000-0000-4000-8000-0000000000a1'::uuid) $$,
  'a removed copy is not kept'
);
select pg_temp.act_as_postgres();

select * from finish();
rollback;
