begin;
select plan(41);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'copies-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'copies-reporter@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000091', 'Copies Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'Copii SRL', '1590082', 'client');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at, confirmed_at, abandoned_at) values
  ('10000000-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'client', 'cccccccc-0000-4000-8000-000000000091', true,
   'confirmed', '2025-06-01 09:00+00', '2025-06-01 09:30+00', '2025-06-01 10:00+00', null),
  ('10000000-0000-4000-8000-000000000092', '11111111-0000-4000-8000-000000000091', 'client', 'cccccccc-0000-4000-8000-000000000091', true,
   'abandoned', null, null, null, now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000093', '11111111-0000-4000-8000-000000000091', 'client', 'cccccccc-0000-4000-8000-000000000091', true,
   'ready', now(), now(), null, null);

insert into public.import_library_parts (import_id, organization_id, part, status, proposal, read_at, confirmed_at, failure_reason, failed_at) values
  ('10000000-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'instructions_ssm', 'confirmed', '{}', '2025-06-01 09:30+00', '2025-06-05 10:00+00', null, null),
  ('10000000-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'instructions_su', 'to_review', '{}', '2025-06-01 09:30+00', null, null, null),
  ('10000000-0000-4000-8000-000000000091', '11111111-0000-4000-8000-000000000091', 'risk_evaluations', 'failed', null, null, null, 'Nu s-a putut citi.', '2025-06-02 10:00+00'),
  ('10000000-0000-4000-8000-000000000093', '11111111-0000-4000-8000-000000000091', 'instructions_ssm', 'to_review', '{}', now(), null, null, null);

insert into storage.objects (bucket_id, name) values
  ('import-copies', '11111111-0000-4000-8000-000000000091/10000000-0000-4000-8000-000000000091/proposal.json');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select has_table('public', 'import_copies', 'improvement copies are recorded');

select is(
  (select public from storage.buckets where id = 'import-copies'),
  false,
  'the copies bucket is private'
);

select ok(
  (select c.file_size_limit >= i.file_size_limit and c.allowed_mime_types @> i.allowed_mime_types
   from storage.buckets c, storage.buckets i
   where c.id = 'import-copies' and i.id = 'imports'),
  'it takes every file the imports bucket takes, as large'
);

select results_eq(
  $$ select count(*)::int from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (qual like '%import-copies%' or with_check like '%import-copies%') $$,
  array[0],
  'no storage policy names the copies bucket'
);

select throws_ok(
  $$ update public.imports set reading_version = '[]' where id = '10000000-0000-4000-8000-000000000091' $$,
  '23514', null,
  'an import''s reading version is an object'
);

select throws_ok(
  $$ update public.imports set reading_flags = '"many"' where id = '10000000-0000-4000-8000-000000000091' $$,
  '23514', null,
  'and its reading flags'
);

select throws_ok(
  $$ update public.imports set reported_by = 'aaaaaaaa-0000-4000-8000-000000000091' where id = '10000000-0000-4000-8000-000000000091' $$,
  '23514', null,
  'a reporter needs the time of the report'
);

select throws_ok(
  $$ update public.import_library_parts set quality = '[]' where import_id = '10000000-0000-4000-8000-000000000091' and part = 'instructions_ssm' $$,
  '23514', null,
  'a part''s quality is an object'
);

select throws_ok(
  $$ update public.import_library_parts set reading_flags = '1' where import_id = '10000000-0000-4000-8000-000000000091' and part = 'instructions_ssm' $$,
  '23514', null,
  'and its reading flags'
);

select throws_ok(
  $$ update public.import_library_parts set reported_by = 'aaaaaaaa-0000-4000-8000-000000000091'
     where import_id = '10000000-0000-4000-8000-000000000091' and part = 'instructions_ssm' $$,
  '23514', null,
  'a part''s reporter needs the time of the report too'
);

update public.imports
set reported_at = now(), reported_by = 'aaaaaaaa-0000-4000-8000-000000000092',
    reading_version = '{"reading": "gpt-5.1", "hash": "a1b2c3"}', reading_flags = '{"files": 3}'
where id = '10000000-0000-4000-8000-000000000091';
update public.import_library_parts
set reported_at = now(), reported_by = 'aaaaaaaa-0000-4000-8000-000000000092', quality = '{"instructions": {"kept": 2}}'
where import_id = '10000000-0000-4000-8000-000000000091' and part = 'instructions_ssm';
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000092';

select results_eq(
  $$ select reported_at is not null, reported_by is null from public.imports where id = '10000000-0000-4000-8000-000000000091'
     union all
     select reported_at is not null, reported_by is null from public.import_library_parts
     where import_id = '10000000-0000-4000-8000-000000000091' and part = 'instructions_ssm' $$,
  $$ values (true, true), (true, true) $$,
  'deleting the reporter''s account keeps the report'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000091');

select results_eq(
  $$ select id, status::text from public.imports order by id $$,
  $$ values ('10000000-0000-4000-8000-000000000091'::uuid, 'confirmed'),
            ('10000000-0000-4000-8000-000000000092'::uuid, 'abandoned'),
            ('10000000-0000-4000-8000-000000000093'::uuid, 'ready') $$,
  'a member still reads their imports'
);

select results_eq(
  $$ select part::text, status::text from public.import_library_parts where import_id = '10000000-0000-4000-8000-000000000091' order by part $$,
  $$ values ('instructions_ssm', 'confirmed'), ('instructions_su', 'to_review'), ('risk_evaluations', 'failed') $$,
  'and their library parts'
);

select throws_ok(
  $$ select reading_version from public.imports $$,
  '42501', null,
  'but not an import''s reading version'
);

select throws_ok(
  $$ select reading_flags from public.imports $$,
  '42501', null,
  'nor its reading flags'
);

select throws_ok(
  $$ select reported_at, reported_by from public.imports $$,
  '42501', null,
  'nor who reported it'
);

select throws_ok(
  $$ select quality, reading_version, reading_flags, reported_at, reported_by from public.import_library_parts $$,
  '42501', null,
  'nor the same of a part'
);

select throws_ok(
  $$ update public.imports set reported_at = now() where id = '10000000-0000-4000-8000-000000000093' $$,
  '42501', null,
  'a member does not report an import by writing the row'
);

select throws_ok(
  $$ update public.imports set reading_flags = '{}' where id = '10000000-0000-4000-8000-000000000093' $$,
  '42501', null,
  'nor writes its reading flags'
);

select throws_ok(
  $$ update public.import_library_parts set reported_at = now(), quality = '{}' where import_id = '10000000-0000-4000-8000-000000000093' $$,
  '42501', null,
  'nor a part''s report or quality'
);

select throws_ok(
  $$ select * from public.import_copies $$,
  '42501', null,
  'a member does not read the copies'' records'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'import-copies'),
  0,
  'nor any object of the copies bucket'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('import-copies',
     '11111111-0000-4000-8000-000000000091/10000000-0000-4000-8000-000000000093/proposal.json') $$,
  '42501', null,
  'nor writes one'
);

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not has_function_privilege('authenticated', 'public.record_import_copy(uuid, public.import_library_part)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_expired_import_copies()', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_import_copies_removed(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.record_import_copy(uuid, public.import_library_part)', 'execute')
  and not has_function_privilege('anon', 'public.list_expired_import_copies()', 'execute')
  and not has_function_privilege('anon', 'public.mark_import_copies_removed(uuid[])', 'execute'),
  'only the secret key records, lists and removes copies'
);

set local role service_role;

select is(
  public.record_import_copy('10000000-0000-4000-8000-000000000091'),
  '2026-06-01 10:00+00'::timestamptz,
  'a confirmed import''s copy expires 12 months after its confirmation'
);

select is(
  public.record_import_copy('10000000-0000-4000-8000-000000000092'),
  (select abandoned_at + interval '12 months' from public.imports where id = '10000000-0000-4000-8000-000000000092'),
  'an abandoned one''s 12 months after it was abandoned'
);

select throws_ok(
  $$ select public.record_import_copy('10000000-0000-4000-8000-000000000093') $$,
  'IMP09', null,
  'an open import has no copy yet'
);

select throws_ok(
  $$ select public.record_import_copy('10000000-0000-4000-8000-000000000099') $$,
  'P0002', null,
  'nor an import that does not exist'
);

select is(
  public.record_import_copy('10000000-0000-4000-8000-000000000091', 'instructions_ssm'),
  '2026-06-05 10:00+00'::timestamptz,
  'a confirmed part''s copy expires 12 months after the part was confirmed'
);

select is(
  public.record_import_copy('10000000-0000-4000-8000-000000000091', 'instructions_su'),
  '2026-06-15 10:00+00'::timestamptz,
  'a part never confirmed ends 14 days after its import, when it expired'
);

select is(
  public.record_import_copy('10000000-0000-4000-8000-000000000091', 'risk_evaluations'),
  '2026-06-02 10:00+00'::timestamptz,
  'a failed part''s 12 months after it failed'
);

select throws_ok(
  $$ select public.record_import_copy('10000000-0000-4000-8000-000000000093', 'instructions_ssm') $$,
  'IMP09', null,
  'a part under review has no copy yet'
);

select throws_ok(
  $$ select public.record_import_copy('10000000-0000-4000-8000-000000000092', 'risk_evaluations') $$,
  'P0002', null,
  'nor a part the import does not have'
);

select public.record_import_copy('10000000-0000-4000-8000-000000000091');

select is(
  (select count(*)::int from public.import_copies where import_id = '10000000-0000-4000-8000-000000000091' and part is null),
  1,
  'recording a copy again keeps one record of it'
);

select results_eq(
  $$ select import_id, part::text, folder from public.list_expired_import_copies() order by folder $$,
  $$ values
       ('10000000-0000-4000-8000-000000000091'::uuid, null::text,
        '11111111-0000-4000-8000-000000000091/10000000-0000-4000-8000-000000000091'),
       ('10000000-0000-4000-8000-000000000091'::uuid, 'instructions_ssm',
        '11111111-0000-4000-8000-000000000091/10000000-0000-4000-8000-000000000091/parts/instructions_ssm'),
       ('10000000-0000-4000-8000-000000000091'::uuid, 'instructions_su',
        '11111111-0000-4000-8000-000000000091/10000000-0000-4000-8000-000000000091/parts/instructions_su'),
       ('10000000-0000-4000-8000-000000000091'::uuid, 'risk_evaluations',
        '11111111-0000-4000-8000-000000000091/10000000-0000-4000-8000-000000000091/parts/risk_evaluations') $$,
  'the clean-up lists the copies past their 12 months, each with its folder, and not the others'
);

select results_eq(
  $$ select import_id, part::text from public.import_copies
     where id in (select * from public.mark_import_copies_removed(array(select id from public.import_copies)))
     order by import_id, part nulls first $$,
  $$ values
       ('10000000-0000-4000-8000-000000000091'::uuid, null::text),
       ('10000000-0000-4000-8000-000000000091'::uuid, 'instructions_ssm'),
       ('10000000-0000-4000-8000-000000000091'::uuid, 'instructions_su'),
       ('10000000-0000-4000-8000-000000000091'::uuid, 'risk_evaluations') $$,
  'marking removes only the copies the list gave'
);

select is_empty(
  $$ select * from public.list_expired_import_copies() $$,
  'a removed copy is listed no more'
);

select is_empty(
  $$ select * from public.mark_import_copies_removed(array(select id from public.import_copies)) $$,
  'nor marked again'
);

select throws_ok(
  $$ update public.import_copies set removed_at = written_at - interval '1 day'
     where import_id = '10000000-0000-4000-8000-000000000091' and part is null $$,
  '23514', null,
  'a copy is not removed before it was written'
);

select public.record_import_copy('10000000-0000-4000-8000-000000000091');

select ok(
  (select removed_at is null from public.import_copies where import_id = '10000000-0000-4000-8000-000000000091' and part is null),
  'a copy written again after its removal is kept again'
);

reset role;
delete from public.imports where id = '10000000-0000-4000-8000-000000000092';

select is(
  (select count(*)::int from public.import_copies where import_id = '10000000-0000-4000-8000-000000000092'),
  1,
  'an abandoned import''s copy outlives the import''s row'
);

select * from finish();
rollback;
