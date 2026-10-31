begin;
select plan(46);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), v.app_metadata::jsonb, '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner-a@example.com', '{"provider":"email"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'specialist-a@example.com', '{"provider":"email"}'),
  ('eeeeeeee-0000-4000-8000-000000000001', 'admin@example.com', '{"provider":"email","role":"admin"}')
) as v (id, email, app_metadata);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('c1c1c1c1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client One', '1590082', 'client'),
  ('c1c1c1c1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Client Gone', '5022670', 'client');

insert into public.job_positions (id, organization_id, client_id, name) values
  ('b1b1b1b1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'Sudor'),
  ('b1b1b1b1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'Sudor');

insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at) values
  ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Popescu', 'Ion', 'Sudor', '2020-03-01'),
  ('e1e1e1e1-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Plecat', 'Dan', 'Sudor', '2020-03-01'),
  ('e1e1e1e1-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002', 'Plecat', 'Ana', 'Sudor', '2020-03-01');

create or replace function pg_temp.act_as(p_user_id text, p_headers jsonb default '{}')
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', (
           select json_build_object('sub', p_user_id, 'role', 'authenticated', 'app_metadata', u.raw_app_meta_data)::text
           from auth.users u where u.id = p_user_id::uuid
         ), true),
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

create or replace function pg_temp.last_event(p_table text)
returns audit.events language sql security definer as $$
  select * from audit.events where table_name = p_table order by id desc limit 1;
$$;

create or replace function pg_temp.event_count()
returns bigint language sql security definer as $$
  select count(*) from audit.events;
$$;

grant execute on all functions in schema pg_temp to authenticated, service_role;


select ok(
  not has_schema_privilege('authenticated', 'audit', 'usage')
    and not has_schema_privilege('anon', 'audit', 'usage')
    and not has_schema_privilege('service_role', 'audit', 'usage'),
  'no API role reaches the audit schema'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');
update public.employees set cnp = '1880314350014', blood_group = 'A(II)' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();

select results_eq(
  $$ select action, changed_columns, details, actor_id, impersonating_user_id, source, organization_id, row_id
     from pg_temp.last_event('employees') $$,
  $$ values ('update', '{blood_group,cnp}'::text[], null::jsonb, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, null::uuid, 'user',
            '11111111-0000-4000-8000-000000000001'::uuid, 'e1e1e1e1-0000-4000-8000-000000000001'::uuid) $$,
  'a member''s change of a CNP names the columns, the member, the organization and the row'
);
select ok(
  not exists (select 1 from audit.events e where e::text like '%1880314350014%' or e::text like '%A(II)%'),
  'and no event holds the CNP or the blood group'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');
insert into public.employees (id, organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at, cnp)
values ('e1e1e1e1-0000-4000-8000-000000000009', '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Nou', 'Vasile', 'Sudor', '2026-01-01', '1900101350017');
select pg_temp.act_as_postgres();
select ok(
  (select action = 'insert' and 'cnp' = any (changed_columns) and 'last_name' = any (changed_columns)
     and not 'notes' = any (changed_columns) and details = '{"status": [null, "active"]}'::jsonb
   from pg_temp.last_event('employees')),
  'an insert names the columns it filled and keeps the status, which says nothing of the person'
);
select ok(
  not exists (select 1 from audit.events e where e::text like '%1900101350017%' or e::text like '%Vasile%'),
  'and never the CNP or the name'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');
update public.employees set updated_at = now() + interval '1 minute' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
update public.employees set last_name = last_name where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select is(
  (select count(*)::int from audit.events where table_name = 'employees' and row_id = 'e1e1e1e1-0000-4000-8000-000000000001' and action = 'update'),
  1,
  'an update that changes nothing but updated_at records nothing'
);

select pg_temp.act_as_secret_key('{"x-audit-actor": "aaaaaaaa-0000-4000-8000-000000000001"}');
update public.employees set notes = 'Scris prin API' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select results_eq(
  $$ select changed_columns, actor_id, source from pg_temp.last_event('employees') $$,
  $$ values ('{notes}'::text[], 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'api') $$,
  'a write with the secret key names the user the API acts for'
);

select pg_temp.act_as_secret_key();
update public.employees set notes = 'Scris de un job' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select results_eq(
  $$ select actor_id, source from pg_temp.last_event('employees') $$,
  $$ values (null::uuid, 'service') $$,
  'without the header it is the service, acting for nobody'
);

select pg_temp.act_as_secret_key('{"x-audit-actor": "not-a-uuid"}');
update public.employees set notes = 'Antet stricat' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select results_eq(
  $$ select actor_id, source from pg_temp.last_event('employees') $$,
  $$ values (null::uuid, 'service') $$,
  'a header that is not an account id names nobody, and the write still goes through'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002', '{"x-audit-actor": "aaaaaaaa-0000-4000-8000-000000000001"}');
update public.employees set notes = 'Fals' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select results_eq(
  $$ select actor_id, source from pg_temp.last_event('employees') $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'user') $$,
  'a member''s token that sends the header is still the member: the header is believed only from the secret key'
);

update public.employees set notes = 'Din SQL' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select results_eq(
  $$ select actor_id, source from pg_temp.last_event('employees') $$,
  $$ values (null::uuid, 'database') $$,
  'a write outside any request is the database''s'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000002');
insert into public.employees (organization_id, client_id, job_position_id, last_name, first_name, job_title, hired_at)
select '11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001', 'Lot', n::text, 'Sudor', '2026-01-01'
from generate_series(1, 3) as n;
select pg_temp.act_as_postgres();
select is(
  (select count(*)::int from audit.events where table_name = 'employees' and action = 'insert' and actor_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  4,
  'a bulk insert records one event per row'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select public.change_organization_member_role('aaaaaaaa-0000-4000-8000-000000000002', 'owner');
select pg_temp.act_as_postgres();
select results_eq(
  $$ select action, changed_columns, details, actor_id, row_id from pg_temp.last_event('organization_members') $$,
  $$ values ('update', '{role}'::text[], '{"role": ["specialist", "owner"]}'::jsonb,
            'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid) $$,
  'a role change keeps the transition, through a definer function as the caller'
);


select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');
insert into public.impersonations (admin_user_id, target_user_id, reason)
values ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'Reproduce #123');
select pg_temp.act_as_postgres();
select results_eq(
  $$ select action, actor_id, impersonating_user_id, organization_id, details ->> 'reason', source
     from pg_temp.last_event('impersonations') $$,
  $$ values ('impersonation_started', 'eeeeeeee-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid,
            '11111111-0000-4000-8000-000000000001'::uuid, 'Reproduce #123', 'user') $$,
  'starting an impersonation names the admin, the impersonated member and their organization'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');
update public.employees set qualification = 'Sudor autorizat' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select results_eq(
  $$ select actor_id, impersonating_user_id, source, organization_id from pg_temp.last_event('employees') $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'user',
            '11111111-0000-4000-8000-000000000001'::uuid) $$,
  'a change during an impersonation names the real admin and the user they act as'
);

select pg_temp.act_as_secret_key('{"x-audit-actor": "eeeeeeee-0000-4000-8000-000000000001"}');
update public.employees set education = 'Liceu' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select pg_temp.act_as_postgres();
select results_eq(
  $$ select actor_id, impersonating_user_id, source from pg_temp.last_event('employees') $$,
  $$ values ('eeeeeeee-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'api') $$,
  'and so does the API''s, from the admin''s active impersonation'
);


select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.impersonations set expires_at = expires_at + interval '1 hour' where ended_at is null $$,
  '42501', null, 'the admin does not move the expiry'
);
select throws_ok(
  $$ update public.impersonations set reason = 'Altceva' where ended_at is null $$,
  '42501', null, 'nor rewrites the reason'
);
select throws_ok(
  $$ update public.impersonations set target_user_id = 'aaaaaaaa-0000-4000-8000-000000000001' where ended_at is null $$,
  '42501', null, 'nor changes whom they impersonate'
);
select throws_ok(
  $$ update public.impersonations set started_at = now() - interval '1 day' where ended_at is null $$,
  '42501', null, 'nor when it started'
);
select throws_ok(
  $$ delete from public.impersonations $$,
  '42501', null, 'nor deletes it'
);
select lives_ok(
  $$ update public.impersonations set ended_at = '2000-01-01' where ended_at is null $$,
  'the admin ends it'
);
select pg_temp.act_as_postgres();
select ok(
  (select ended_at = now() from public.impersonations where admin_user_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  'at the moment they end it, whatever they wrote'
);
select results_eq(
  $$ select action, actor_id, impersonating_user_id from pg_temp.last_event('impersonations') $$,
  $$ values ('impersonation_ended', 'eeeeeeee-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid) $$,
  'which is recorded with both users'
);
select pg_temp.act_as('eeeeeeee-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.impersonations set ended_at = now() where admin_user_id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
  'IMS01', 'An ended impersonation is not changed.', 'an ended impersonation stays as it ended'
);
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, started_at) values ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', now() + interval '1 year') $$,
  '42501', null, 'an admin does not choose when an impersonation starts'
);
select throws_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, expires_at) values ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', now() + interval '3 hours') $$,
  '23514', null, 'nor lets it last more than two hours'
);
select lives_ok(
  $$ insert into public.impersonations (admin_user_id, target_user_id, expires_at) values ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', now() + interval '30 minutes') $$,
  'a shorter one is fine'
);
select pg_temp.act_as_postgres();
select throws_ok(
  $$ update public.impersonations set expires_at = started_at + interval '1 day' where ended_at is null $$,
  '23514', null, 'and nobody stretches one past two hours'
);
update public.impersonations set ended_at = now() where ended_at is null;


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok($$ select count(*) from audit.events $$, '42501', null, 'a member reads no audit event');
select throws_ok($$ update audit.events set actor_id = null $$, '42501', null, 'nor changes one');
select throws_ok($$ delete from audit.events $$, '42501', null, 'nor deletes one');
select pg_temp.act_as_secret_key();
select throws_ok($$ select count(*) from audit.events $$, '42501', null, 'the secret key reads none either');
select throws_ok($$ update audit.events set actor_id = null $$, '42501', null, 'nor changes one');
select throws_ok($$ delete from audit.events $$, '42501', null, 'nor deletes one');
select throws_ok($$ insert into audit.events (action, table_name, source) values ('insert', 'employees', 'api') $$, '42501', null, 'nor writes one');
select pg_temp.act_as_postgres();
select throws_ok($$ update audit.events set actor_id = null $$, 'AUD01', 'The audit log is append-only.', 'even the owner changes no event');
select throws_ok($$ delete from audit.events $$, 'AUD01', 'The audit log is append-only.', 'nor deletes one');
select throws_ok($$ truncate audit.events $$, 'AUD01', 'The audit log is append-only.', 'nor empties the log');


update public.clients set archived_at = now() where id = 'c1c1c1c1-0000-4000-8000-000000000002';
create temp table counted (events bigint);
insert into counted select pg_temp.event_count();
select pg_temp.act_as_secret_key('{"x-audit-actor": "eeeeeeee-0000-4000-8000-000000000001"}');
select count(*) from public.delete_archived_client('11111111-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000002');
select pg_temp.act_as_postgres();
select is(
  pg_temp.event_count() - (select events from counted),
  1::bigint,
  'deleting an archived client records one event for the run, not one per row under it'
);
select results_eq(
  $$ select action, row_id, organization_id, details, actor_id, source from pg_temp.last_event('clients') $$,
  $$ values ('client_deleted', 'c1c1c1c1-0000-4000-8000-000000000002'::uuid, '11111111-0000-4000-8000-000000000001'::uuid,
            '{"cui": "5022670", "legal_name": "Client Gone"}'::jsonb, 'eeeeeeee-0000-4000-8000-000000000001'::uuid, 'api') $$,
  'naming the client and who deleted it'
);
select is(current_setting('audit.suppressed', true), '', 'and the rows after it are recorded again');
update public.employees set notes = 'După ștergere' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select is(
  (select changed_columns from pg_temp.last_event('employees')),
  '{notes}'::text[],
  'as the next change shows'
);


select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select set_config('audit.suppressed', 'delete_archived_client', true);
update public.employees set notes = 'Încercare de ascundere' where id = 'e1e1e1e1-0000-4000-8000-000000000001';
select set_config('audit.suppressed', '', true);
select pg_temp.act_as_postgres();
select results_eq(
  $$ select actor_id, source from pg_temp.last_event('employees') $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'user') $$,
  'a user''s request is recorded even if the suppression were set in it'
);

select ok(
  (select count(*) = 3 from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'employees' and t.tgname like 'audit\_%'),
  'employees carry the three audit triggers'
);
select is(
  (select count(distinct c.relname)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and t.tgname in ('audit_insert', 'audit_update', 'audit_delete')),
  25,
  'and so do the other audited tables'
);

select * from finish();
rollback;
