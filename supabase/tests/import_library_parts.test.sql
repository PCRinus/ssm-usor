begin;
select plan(42);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'library-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'library-other@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000071', 'Library Org'),
  ('11111111-0000-4000-8000-000000000072', 'Other Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000072', '11111111-0000-4000-8000-000000000072', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'Royal Hotel SRL', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name, archived_at) values
  ('dddddddd-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'cccccccc-0000-4000-8000-000000000071', 'Recepționer', null),
  ('dddddddd-0000-4000-8000-000000000072', '11111111-0000-4000-8000-000000000071', 'cccccccc-0000-4000-8000-000000000071', 'Bucătar', null),
  ('dddddddd-0000-4000-8000-000000000073', '11111111-0000-4000-8000-000000000071', 'cccccccc-0000-4000-8000-000000000071', 'Portar', now());

create or replace function pg_temp.body(text_ text)
returns jsonb language sql as $$
  select jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('kind', 'heading', 'text', 'În timpul lucrului'),
    jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array(text_)),
    jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array('Se poartă echipamentul de protecție.'))
  ));
$$;

insert into public.instruction_modules (id, organization_id, title, module_group, domain) values
  ('eeeeeeee-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'Scări metalice', 'work_equipment', 'ssm'),
  ('eeeeeeee-0000-4000-8000-000000000072', '11111111-0000-4000-8000-000000000071', 'Birouri', 'premises_activity', 'psi');

insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash) values
  ('11111111-0000-4000-8000-000000000071', 'eeeeeeee-0000-4000-8000-000000000071', 1, pg_temp.body('Scara se verifică.'), repeat('1', 64)),
  ('11111111-0000-4000-8000-000000000071', 'eeeeeeee-0000-4000-8000-000000000072', 1, pg_temp.body('Nu se fumează.'), repeat('2', 64));

insert into public.job_position_instructions (organization_id, client_id, job_position_id, module_id, domain) values
  ('11111111-0000-4000-8000-000000000071', 'cccccccc-0000-4000-8000-000000000071', 'dddddddd-0000-4000-8000-000000000071', 'eeeeeeee-0000-4000-8000-000000000071', 'ssm');

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at) values
  ('10000000-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'client', 'cccccccc-0000-4000-8000-000000000071', true, 'ready', now(), now());

insert into public.imports (id, organization_id, kind, client_id, into_existing_client) values
  ('10000000-0000-4000-8000-000000000074', '11111111-0000-4000-8000-000000000071', 'client', 'cccccccc-0000-4000-8000-000000000071', true);

insert into public.import_files (import_id, organization_id, upload_path, original_file_name, mime_type, size_bytes, sha256, document_kind) values
  ('10000000-0000-4000-8000-000000000074', '11111111-0000-4000-8000-000000000071', 'Decizie.docx', 'Decizie.docx',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100, repeat('a', 64), 'decision');

insert into public.import_library_parts (import_id, organization_id, part, status, proposal, read_at) values
  ('10000000-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'instructions_ssm', 'to_review', '{"domain": "ssm", "instructions": []}', now());
insert into public.import_library_parts (import_id, organization_id, part) values
  ('10000000-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'instructions_psi');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.payload()
returns jsonb language sql as $$
  select jsonb_build_object(
    'create', jsonb_build_array(jsonb_build_object(
      'title', 'Polizor unghiular',
      'category', 'work_equipment',
      'body', pg_temp.body('Polizorul se verifică înainte de pornire.'),
      'text_hash', repeat('3', 64),
      'job_position_ids', jsonb_build_array('dddddddd-0000-4000-8000-000000000071', 'dddddddd-0000-4000-8000-000000000072')
    )),
    'use', jsonb_build_array(jsonb_build_object(
      'module_id', 'eeeeeeee-0000-4000-8000-000000000071',
      'job_position_ids', jsonb_build_array('dddddddd-0000-4000-8000-000000000071', 'dddddddd-0000-4000-8000-000000000072')
    ))
  );
$$;

create temp table applied (result jsonb);
grant select, insert on applied to authenticated;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.import_library_parts'::regclass),
  'row-level security is on'
);

select throws_ok(
  $$ update public.import_files set document_domain = 'ssm' where upload_path = 'Decizie.docx' $$,
  '23514', null, 'only own instructions and training themes have a domain'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000071');

select is(
  (select count(*)::int from public.import_library_parts),
  2,
  'a member reads the library parts of the organization''s imports'
);

select throws_ok(
  $$ insert into public.import_library_parts (import_id, organization_id, part)
     values ('10000000-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000071', 'instructions_ssm') $$,
  '42501', null, 'members do not write parts themselves'
);

select throws_ok(
  $$ update public.import_library_parts set status = 'confirmed' $$,
  '42501', null, 'nor change them'
);

select throws_ok(
  $$ select public.record_library_part_usage('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1, 0, 1, 0.1) $$,
  '42501', null, 'nor record usage'
);

select throws_ok(
  $$ select public.refund_library_part_credits('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1) $$,
  '42501', null, 'nor refund a reading'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000072');

select is(
  (select count(*)::int from public.import_library_parts),
  0,
  'another organization reads none'
);

select throws_ok(
  $$ select public.save_import_library_part_changes('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 0, '{}') $$,
  'P0002', null, 'nor saves changes to them'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000071');

select is(
  public.save_import_library_part_changes('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 0, '{"instructions": {}}'),
  1,
  'a part is reviewed before the client is confirmed'
);

select throws_ok(
  $$ select public.save_import_library_part_changes('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 0, '{}') $$,
  'ILP02', null, 'a save on an older version is refused'
);

select throws_ok(
  $$ select public.save_import_library_part_changes('10000000-0000-4000-8000-000000000071', 'instructions_psi', 0, '{}') $$,
  'ILP01', null, 'a part still being read takes no changes'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1, pg_temp.payload()) $$,
  'ILP03', null, 'a part is confirmed only once the client is'
);

reset role;
update public.imports
set status = 'confirmed', confirmed_at = now(), confirmed_by = 'aaaaaaaa-0000-4000-8000-000000000071'
where id = '10000000-0000-4000-8000-000000000071';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000071');

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 0, pg_temp.payload()) $$,
  'ILP02', null, 'confirming an older version is refused'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1,
       jsonb_set(pg_temp.payload(), '{create,0,title}', '"scări METALICE"')) $$,
  'ILP05', 'The library already has a module titled scări METALICE.',
  'a new module''s title taken by an active module is refused, naming it'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1,
       jsonb_set(pg_temp.payload(), '{use,0,job_position_ids}', '["dddddddd-0000-4000-8000-000000000073"]')) $$,
  '22023', null, 'an archived post is refused'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1,
       jsonb_set(pg_temp.payload(), '{use,0,module_id}', '"eeeeeeee-0000-4000-8000-000000000072"')) $$,
  '22023', null, 'a module of the other domain is refused'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1,
       jsonb_set(pg_temp.payload(), '{create,0,body}', '{"blocks": []}')) $$,
  '23514', null, 'a body without an article is refused'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1,
       jsonb_set(pg_temp.payload(), '{create,0,category}', '"premises_activity"')) $$,
  '23514', null, 'a category of the other domain is refused'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1,
       pg_temp.payload() || '{"replace": []}') $$,
  '22023', null, 'a payload with a field it does not know is refused'
);

select lives_ok(
  $$ insert into applied select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1, pg_temp.payload()) $$,
  'a member confirms the part after the client'
);

select is(
  (select jsonb_array_length(result -> 'created') || ' ' || (result -> 'used')::text || ' ' || (result ->> 'links') from applied),
  '1 ["eeeeeeee-0000-4000-8000-000000000071"] 3',
  'it creates the new module, takes the library''s as it is, and skips a post that applies it already'
);

select results_eq(
  $$ select m.title, m.module_group::text, m.domain::text, m.created_by, v.number, v.article_count, v.text_hash, v.created_by
     from public.instruction_modules m
     join public.instruction_module_versions v on v.module_id = m.id
     where m.id = (select (result -> 'created' ->> 0)::uuid from applied) $$,
  $$ values ('Polizor unghiular', 'work_equipment', 'ssm', 'aaaaaaaa-0000-4000-8000-000000000071'::uuid, 1, 2, repeat('3', 64),
             'aaaaaaaa-0000-4000-8000-000000000071'::uuid) $$,
  'the new module has its first version, carrying the confirming member'
);

select results_eq(
  $$ select p.name, count(*)::int, count(i.created_by)::int
     from public.job_position_instructions i join public.job_positions p on p.id = i.job_position_id
     group by p.name order by p.name $$,
  $$ values ('Bucătar', 2, 2), ('Recepționer', 2, 1) $$,
  'each post applies both modules once'
);

select results_eq(
  $$ select name, needs_instructions from public.job_positions where archived_at is null order by name $$,
  $$ values ('Bucătar', true), ('Recepționer', true) $$,
  'and its decision follows its links'
);

select results_eq(
  $$ select status::text, confirmed_by from public.import_library_parts where part = 'instructions_ssm' $$,
  $$ values ('confirmed', 'aaaaaaaa-0000-4000-8000-000000000071'::uuid) $$,
  'the part is confirmed by the member'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_ssm', 1, '{}') $$,
  'ILP01', null, 'a part is confirmed once'
);

select throws_ok(
  $$ select public.retry_import_library_part('10000000-0000-4000-8000-000000000071', 'instructions_psi') $$,
  'ILP06', null, 'a part still being read is not read again'
);

reset role;

select throws_ok(
  $$ update public.import_library_parts set status = 'failed', failure_reason = 'x', failed_at = now(), confirmed_at = null
     where part = 'instructions_ssm' $$,
  'ILP07', null, 'a confirmed part does not change step, not even from the secret key'
);

set local role service_role;

select results_eq(
  $$ select charged, refused from public.charge_credits(
       '11111111-0000-4000-8000-000000000071', 'library_part', 10, '10000000-0000-4000-8000-000000000071', null, null,
       public.library_part_charge_key('10000000-0000-4000-8000-000000000071', 'instructions_psi', 1), false,
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 5,
       null, null, null, 'instructions_psi') $$,
  $$ values (10, false) $$,
  'a part''s reading is charged when sent, never refused, below zero if it must'
);

select throws_ok(
  $$ select * from public.charge_credits(
       '11111111-0000-4000-8000-000000000071', 'library_part', 10, '10000000-0000-4000-8000-000000000071', null, null,
       'library:x', false, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 5,
       null, null, null) $$,
  '22023', null, 'a reading''s charge names its part'
);

select lives_ok(
  $$ select public.record_library_part_usage('10000000-0000-4000-8000-000000000071', 'instructions_psi', 60000, 1000, 4000, 0.08) $$,
  'the reading''s usage is recorded'
);

select results_eq(
  $$ select p.input_tokens, p.cost_usd, i.input_tokens, i.usage_by_step #>> '{instructions,cost_usd}'
     from public.import_library_parts p join public.imports i on i.id = p.import_id
     where p.part = 'instructions_psi' $$,
  $$ values (60000::bigint, 0.08::numeric, 60000::bigint, '0.08') $$,
  'on the part and on the import''s totals, under its own step'
);

update public.import_library_parts
set status = 'failed', failure_reason = 'Nu am putut citi instrucțiunile.', failed_at = now()
where part = 'instructions_psi';

select results_eq(
  $$ select kind::text, credits, import_part::text from public.credit_entries
     where import_id = '10000000-0000-4000-8000-000000000071' order by id $$,
  $$ values ('library_part', -10, 'instructions_psi'), ('library_part_refund', 10, 'instructions_psi') $$,
  'a reading that fails gets its credits back'
);

select is(
  (select used from public.credit_period_counts('11111111-0000-4000-8000-000000000071',
     date_trunc('month', now()), date_trunc('month', now()) + interval '1 month')),
  0,
  'so the month counts nothing for it'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000071');

select is(
  public.retry_import_library_part('10000000-0000-4000-8000-000000000071', 'instructions_psi'),
  2,
  'a failed part is read again under its next attempt'
);

select results_eq(
  $$ select status::text, failure_reason, failed_at from public.import_library_parts where part = 'instructions_psi' $$,
  $$ values ('reading', null::text, null::timestamptz) $$,
  'and reads from the start'
);

reset role;

update public.import_library_parts
set status = 'to_review', proposal = '{"domain": "psi", "instructions": []}', read_at = now()
where part = 'instructions_psi';
update public.imports set confirmed_at = now() - interval '15 days' where id = '10000000-0000-4000-8000-000000000071';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000071');

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000071', 'instructions_psi', 0, '{}') $$,
  'ILP04', null, 'a part not confirmed 14 days after the client has expired'
);

reset role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at) values
  ('10000000-0000-4000-8000-000000000072', '11111111-0000-4000-8000-000000000071', 'client', 'cccccccc-0000-4000-8000-000000000071', true, 'ready', now(), now()),
  ('10000000-0000-4000-8000-000000000073', '11111111-0000-4000-8000-000000000071', 'client', 'cccccccc-0000-4000-8000-000000000071', true, 'ready', now(), now());
update public.imports set status = 'abandoned', abandoned_at = now() where id = '10000000-0000-4000-8000-000000000073';

insert into public.import_library_parts (import_id, organization_id, part, updated_at) values
  ('10000000-0000-4000-8000-000000000072', '11111111-0000-4000-8000-000000000071', 'instructions_ssm', now() - interval '7 hours'),
  ('10000000-0000-4000-8000-000000000072', '11111111-0000-4000-8000-000000000071', 'instructions_psi', now() - interval '5 hours'),
  ('10000000-0000-4000-8000-000000000073', '11111111-0000-4000-8000-000000000071', 'instructions_ssm', now() - interval '7 hours');

select results_eq(
  $$ select import_id, part::text from public.fail_stalled_library_parts('Citirea instrucțiunilor s-a oprit.') $$,
  $$ values ('10000000-0000-4000-8000-000000000072'::uuid, 'instructions_ssm') $$,
  'a part read for 6 hours without progress fails, not one of an abandoned import'
);

update public.imports set confirmed_at = now() - interval '31 days' where id = '10000000-0000-4000-8000-000000000071';

select is(public.drop_import_proposals(), 1, 'the 30-day clean-up drops the import''s proposal');

select results_eq(
  $$ select part::text, proposal is null and changes is null and proposal_dropped_at is not null, status::text
     from public.import_library_parts where import_id = '10000000-0000-4000-8000-000000000071' order by part $$,
  $$ values ('instructions_psi', true, 'to_review'), ('instructions_ssm', true, 'confirmed') $$,
  'and its parts'' with it, keeping their status'
);

delete from public.imports where id = '10000000-0000-4000-8000-000000000072';

select is(
  (select count(*)::int from public.import_library_parts where import_id = '10000000-0000-4000-8000-000000000072'),
  0,
  'an import deleted takes its parts'
);

select * from finish();
rollback;
