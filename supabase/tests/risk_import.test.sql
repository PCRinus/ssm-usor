begin;
select plan(41);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000081', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'risk-import-owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000082', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'risk-import-other@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000081', 'Risk Import Org'),
  ('11111111-0000-4000-8000-000000000082', 'Other Org');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000082', '11111111-0000-4000-8000-000000000082', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'Royal Hotel SRL', '1590082', 'client');

insert into public.job_positions (id, organization_id, client_id, name, archived_at) values
  ('dddddddd-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'Bucătar', null),
  ('dddddddd-0000-4000-8000-000000000082', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'Ospătar', null),
  ('dddddddd-0000-4000-8000-000000000083', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'Recepționer', null),
  ('dddddddd-0000-4000-8000-000000000084', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'Portar', now());

insert into public.risk_evaluations (id, organization_id, client_id, kind, job_position_id, name, work_environment) values
  ('eeeeeeee-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'job_position', 'dddddddd-0000-4000-8000-000000000081', null, 'Bucătăria scrisă de mână'),
  ('eeeeeeee-0000-4000-8000-000000000083', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'job_position', 'dddddddd-0000-4000-8000-000000000083', null, null),
  ('eeeeeeee-0000-4000-8000-000000000084', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'other', null, 'Vizitatori', null);

insert into public.risk_factors (id, organization_id, client_id, evaluation_id, component, factor_group, description, gravity_class, probability_class, sort_order) values
  ('ffffffff-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'eeeeeeee-0000-4000-8000-000000000081', 'work_task', 'Suprasolicitare fizică', 'Ridicarea oalelor mari', 3, 3, 0),
  ('ffffffff-0000-4000-8000-000000000083', '11111111-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000081', 'eeeeeeee-0000-4000-8000-000000000083', 'executant', 'Acțiuni greșite', 'Neatenție la ghișeu', 2, 2, 0);

insert into public.evaluation_profiles (id, organization_id, name, archived_at) values
  ('99999999-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'Ospătar', null),
  ('99999999-0000-4000-8000-000000000082', '11111111-0000-4000-8000-000000000081', 'Bucătar vechi', now());

insert into public.evaluation_profile_factors (id, organization_id, profile_id, component, factor_group, description, gravity_class, probability_class, sort_order) values
  ('88888888-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', '99999999-0000-4000-8000-000000000081', 'work_environment', 'Factori de risc mecanic', 'Alunecare pe pardoseala udă', 3, 4, 0),
  ('88888888-0000-4000-8000-000000000082', '11111111-0000-4000-8000-000000000081', '99999999-0000-4000-8000-000000000082', 'means_of_production', 'Factori de risc termic', 'Atingerea plitei fierbinți', 3, 4, 0);

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at) values
  ('10000000-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'client', 'cccccccc-0000-4000-8000-000000000081', true, 'ready', now(), now());

insert into public.import_library_parts (import_id, organization_id, part, status, proposal, read_at) values
  ('10000000-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'risk_evaluations', 'to_review', '{"sheets": []}', now()),
  ('10000000-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000081', 'instructions_ssm', 'to_review', '{"domain": "ssm", "instructions": []}', now());

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.factor(key text, description text, gravity int, probability int, source jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'key', key,
    'component', 'means_of_production',
    'group', 'Factori de risc mecanic',
    'description', description,
    'gravity_class', gravity,
    'probability_class', probability,
    'measures', jsonb_build_array(
      jsonb_build_object('kind', 'technical', 'description', 'Apărători la utilaje'),
      jsonb_build_object('kind', 'organizational', 'description', 'Instruire la locul de muncă')
    ),
    'actions', 'Verificarea apărătorilor',
    'deadline', 'Permanent',
    'responsible_person', 'Administrator',
    'observations', null
  ) || case when source is null then '{}'::jsonb else jsonb_build_object('source', source) end;
$$;

create or replace function pg_temp.payload()
returns jsonb language sql as $$
  select jsonb_build_object(
    'entries', jsonb_build_array(jsonb_build_object(
      'key', 'sheet-1',
      'name', 'Bucătar (Royal Hotel)',
      'means_of_production', 'Plită, cuptor, cuțite',
      'work_environment', 'Bucătărie',
      'exposure', '8 h / schimb',
      'factors', jsonb_build_array(
        pg_temp.factor('f-1', 'Tăiere cu cuțitul', 3, 4),
        pg_temp.factor('f-2', 'Arsuri de la plită', 4, 3)
      )
    )),
    'evaluations', jsonb_build_array(
      jsonb_build_object(
        'sheet', 'sheet-1', 'kind', 'job_position', 'job_position_id', 'dddddddd-0000-4000-8000-000000000081',
        'name', null, 'mode', 'append',
        'means_of_production', 'Plită, cuptor, cuțite', 'work_environment', 'Bucătărie', 'exposure', '6 h / zi',
        'factors', jsonb_build_array(
          pg_temp.factor('f-1', 'Tăiere cu cuțitul', 3, 4, '{"entry": "sheet-1", "factor": "f-1"}'),
          pg_temp.factor('f-2', 'Arsuri de la plită', 4, 3, '{"entry": "sheet-1", "factor": "f-2"}')
        )
      ),
      jsonb_build_object(
        'sheet', 'sheet-2', 'kind', 'job_position', 'job_position_id', 'dddddddd-0000-4000-8000-000000000082',
        'name', null, 'mode', 'append',
        'means_of_production', 'Tăvi', 'work_environment', 'Salon', 'exposure', '8 h / schimb',
        'factors', jsonb_build_array(
          pg_temp.factor('f-1', 'Alunecare pe pardoseala udă', 3, 4, '{"profile_factor_id": "88888888-0000-4000-8000-000000000081"}')
        )
      ),
      jsonb_build_object(
        'sheet', 'sheet-3', 'kind', 'job_position', 'job_position_id', 'dddddddd-0000-4000-8000-000000000083',
        'name', null, 'mode', 'replace',
        'means_of_production', null, 'work_environment', 'Recepție', 'exposure', '8 h / schimb',
        'factors', jsonb_build_array(pg_temp.factor('f-1', 'Lovire de colțul ghișeului', 2, 3))
      ),
      jsonb_build_object(
        'sheet', 'sheet-4', 'kind', 'sensitive_groups', 'job_position_id', null, 'name', null, 'mode', 'append',
        'means_of_production', null, 'work_environment', null, 'exposure', '8 h / schimb',
        'factors', jsonb_build_array(pg_temp.factor('f-1', 'Efort fizic pentru gravide', 3, 2))
      ),
      jsonb_build_object(
        'sheet', 'sheet-5', 'kind', 'other', 'job_position_id', null, 'name', 'VIZITATORI', 'mode', 'append',
        'means_of_production', null, 'work_environment', 'Holul hotelului', 'exposure', '8 h / schimb',
        'factors', jsonb_build_array(pg_temp.factor('f-1', 'Împiedicare de bagaje', 2, 2))
      ),
      jsonb_build_object(
        'sheet', 'sheet-6', 'kind', 'other', 'job_position_id', null, 'name', 'Curieri', 'mode', 'append',
        'means_of_production', null, 'work_environment', null, 'exposure', '8 h / schimb',
        'factors', jsonb_build_array(pg_temp.factor('f-1', 'Lovire de ușa de serviciu', 2, 2))
      )
    )
  );
$$;

create temp table applied (result jsonb);
grant select, insert on applied to authenticated;

select is(public.import_library_part_domain('risk_evaluations'), null, 'the risk evaluations'' part has no domain');

select results_eq(
  $$ select public.import_library_part_domain('instructions_ssm')::text, public.import_library_part_domain('instructions_su')::text $$,
  $$ values ('ssm', 'su') $$,
  'the instructions parts keep theirs'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000082');

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 0, pg_temp.payload()) $$,
  'P0002', null, 'another organization does not confirm the part'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000081');

select is(
  public.save_import_library_part_changes('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 0, '{"sheets": {}}'),
  1,
  'the part is reviewed before the client is confirmed'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1, pg_temp.payload()) $$,
  'ILP03', null, 'and confirmed only once the client is'
);

reset role;
update public.imports
set status = 'confirmed', confirmed_at = now(), confirmed_by = 'aaaaaaaa-0000-4000-8000-000000000081'
where id = '10000000-0000-4000-8000-000000000081';
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000081');

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'instructions_ssm', 0, pg_temp.payload()) $$,
  '22023', null, 'an instructions part is not confirmed as risk evaluations'
);

select throws_ok(
  $$ select public.apply_instruction_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1, '{}') $$,
  '22023', null, 'nor the risk evaluations as instructions'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 0, pg_temp.payload()) $$,
  'ILP02', null, 'confirming an older version is refused'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       jsonb_set(pg_temp.payload(), '{entries,0,name}', '"bucătar VECHI"')) $$,
  'ILP05', 'The library already has an evaluation named bucătar VECHI.',
  'a new entry''s name taken by an archived entry is refused, naming it'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       jsonb_set(pg_temp.payload(), '{evaluations,1,factors,0,source}', '{"profile_factor_id": "88888888-0000-4000-8000-000000000082"}')) $$,
  '22023', null, 'a factor of an archived entry is never used'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       jsonb_set(pg_temp.payload(), '{evaluations,0,factors,0,source}', '{"entry": "sheet-9", "factor": "f-1"}')) $$,
  '22023', null, 'nor a factor of an entry the payload does not create'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       jsonb_set(pg_temp.payload(), '{evaluations,1,job_position_id}', '"dddddddd-0000-4000-8000-000000000084"')) $$,
  '22023', null, 'an archived post is refused'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       jsonb_set(pg_temp.payload(), '{evaluations,0,mode}', '"keep"')) $$,
  '22023', null, 'a post left as it is has no place in the payload'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       pg_temp.payload() || '{"create": []}') $$,
  '22023', null, 'a payload with a field it does not know is refused'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1,
       jsonb_set(pg_temp.payload(), '{evaluations,2,factors,0,gravity_class}', '8')) $$,
  '23514', null, 'a class off the scale is refused'
);

select lives_ok(
  $$ insert into applied select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1, pg_temp.payload()) $$,
  'a member confirms the part after the client'
);

select is(
  (select jsonb_array_length(result -> 'created') || ' ' || jsonb_array_length(result -> 'evaluations') || ' ' || (result ->> 'factors') from applied),
  '1 6 7',
  'it answers the entries created, the evaluations written and the factors'
);

select results_eq(
  $$ select name, means_of_production, work_environment, exposure, archived_at, created_by
     from public.evaluation_profiles where id = (select (result -> 'created' ->> 0)::uuid from applied) $$,
  $$ values ('Bucătar (Royal Hotel)', 'Plită, cuptor, cuțite', 'Bucătărie', '8 h / schimb', null::timestamptz,
             'aaaaaaaa-0000-4000-8000-000000000081'::uuid) $$,
  'the new entry has its name and texts, carrying the confirming member'
);

select results_eq(
  $$ select f.description, f.gravity_class::int, f.sort_order, f.actions, f.deadline, f.responsible_person, f.observations,
            (select string_agg(m.kind::text, ',' order by m.sort_order) from public.evaluation_profile_measures m where m.factor_id = f.id)
     from public.evaluation_profile_factors f
     where f.profile_id = (select (result -> 'created' ->> 0)::uuid from applied)
     order by f.sort_order $$,
  $$ values ('Tăiere cu cuțitul', 3, 0, 'Verificarea apărătorilor', 'Permanent', 'Administrator', null::text, 'technical,organizational'),
            ('Arsuri de la plită', 4, 1, 'Verificarea apărătorilor', 'Permanent', 'Administrator', null::text, 'technical,organizational') $$,
  'its factors keep their order, measures and plan fields as defaults'
);

select results_eq(
  $$ select f.description, f.sort_order, f.created_by is not null,
            pf.description, pf.profile_id = (select (result -> 'created' ->> 0)::uuid from applied)
     from public.risk_factors f
     left join public.evaluation_profile_factors pf on pf.id = f.source_profile_factor_id
     where f.evaluation_id = 'eeeeeeee-0000-4000-8000-000000000081'
     order by f.sort_order $$,
  $$ values ('Ridicarea oalelor mari', 0, false, null::text, null::boolean),
            ('Tăiere cu cuțitul', 1, true, 'Tăiere cu cuțitul', true),
            ('Arsuri de la plită', 2, true, 'Arsuri de la plită', true) $$,
  'a post''s factors are added after its own, each pointing at the entry''s factor it was added to'
);

select results_eq(
  $$ select means_of_production, work_environment, exposure from public.risk_evaluations
     where id = 'eeeeeeee-0000-4000-8000-000000000081' $$,
  $$ values ('Plită, cuptor, cuțite', 'Bucătăria scrisă de mână', '6 h / zi') $$,
  'its empty texts are filled and a written one is kept'
);

select results_eq(
  $$ select e.means_of_production, e.work_environment, e.exposure, e.created_by, f.description, f.source_profile_factor_id,
            (select count(*)::int from public.prevention_measures m where m.factor_id = f.id)
     from public.risk_evaluations e join public.risk_factors f on f.evaluation_id = e.id
     where e.job_position_id = 'dddddddd-0000-4000-8000-000000000082' $$,
  $$ values ('Tăvi', 'Salon', '8 h / schimb', 'aaaaaaaa-0000-4000-8000-000000000081'::uuid, 'Alunecare pe pardoseala udă',
             '88888888-0000-4000-8000-000000000081'::uuid, 2) $$,
  'a post without a sheet gets one, its factor pointing at the library''s entry it matched'
);

select results_eq(
  $$ select f.description, f.sort_order, f.source_profile_factor_id from public.risk_factors f
     where f.evaluation_id = 'eeeeeeee-0000-4000-8000-000000000083' $$,
  $$ values ('Lovire de colțul ghișeului', 0, null::uuid) $$,
  'a post replaced loses its own factors'
);

select is(
  (select count(*)::int from public.risk_factors where id = 'ffffffff-0000-4000-8000-000000000083'),
  0,
  'with their measures'
);

select results_eq(
  $$ select c.sensitive_groups_state::text, (select count(*)::int from public.risk_factors f where f.evaluation_id = e.id)
     from public.clients c join public.risk_evaluations e on e.client_id = c.id and e.kind = 'sensitive_groups' $$,
  $$ values ('evaluated', 1) $$,
  'the sensitive groups'' sheet is created and the client''s state follows it'
);

select results_eq(
  $$ select e.id, e.name, e.work_environment, (select count(*)::int from public.risk_factors f where f.evaluation_id = e.id)
     from public.risk_evaluations e where e.kind = 'other' order by e.name $$,
  $$ values ((select id from public.risk_evaluations where name = 'Curieri'), 'Curieri', null::text, 1),
            ('eeeeeeee-0000-4000-8000-000000000084'::uuid, 'Vizitatori', 'Holul hotelului', 1) $$,
  'a client-level sheet is written to the one of its name, any case, or creates it'
);

select results_eq(
  $$ select status::text, confirmed_by from public.import_library_parts where part = 'risk_evaluations' $$,
  $$ values ('confirmed', 'aaaaaaaa-0000-4000-8000-000000000081'::uuid) $$,
  'the part is confirmed by the member'
);

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1, pg_temp.payload()) $$,
  'ILP01', null, 'a part is confirmed once'
);

select throws_ok(
  $$ delete from public.evaluation_profiles where id = (select (result -> 'created' ->> 0)::uuid from applied) $$,
  'RSK04', null, 'the new entry is in use from the first day'
);

select results_eq(
  $$ select name, client_count from public.evaluation_profile_list order by name $$,
  $$ values ('Bucătar (Royal Hotel)', 1), ('Bucătar vechi', 0), ('Ospătar', 1) $$,
  'and the library counts the client for it and for the entry matched'
);

reset role;

set local role service_role;

select results_eq(
  $$ select charged, refused from public.charge_credits(
       '11111111-0000-4000-8000-000000000081', 'library_part', 15, '10000000-0000-4000-8000-000000000081', null, null,
       public.library_part_charge_key('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 1), false,
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 5,
       null, null, null, 'risk_evaluations') $$,
  $$ values (15, false) $$,
  'the reading is charged under its part, never refused'
);

select lives_ok(
  $$ select public.record_library_part_usage('10000000-0000-4000-8000-000000000081', 'risk_evaluations', 50000, 2000, 3000, 0.07) $$,
  'its usage is recorded'
);

select results_eq(
  $$ select p.input_tokens, p.cost_usd, i.usage_by_step #>> '{risks,cost_usd}', i.usage_by_step ? 'instructions'
     from public.import_library_parts p join public.imports i on i.id = p.import_id
     where p.part = 'risk_evaluations' $$,
  $$ values (50000::bigint, 0.07::numeric, '0.07', false) $$,
  'on the part and on the import''s totals, under a step of its own'
);

reset role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at) values
  ('10000000-0000-4000-8000-000000000082', '11111111-0000-4000-8000-000000000081', 'client', 'cccccccc-0000-4000-8000-000000000081', true, 'ready', now(), now());
insert into public.import_library_parts (import_id, organization_id, part) values
  ('10000000-0000-4000-8000-000000000082', '11111111-0000-4000-8000-000000000081', 'risk_evaluations');

set local role service_role;
select results_eq(
  $$ select charged from public.charge_credits(
       '11111111-0000-4000-8000-000000000081', 'library_part', 15, '10000000-0000-4000-8000-000000000082', null, null,
       public.library_part_charge_key('10000000-0000-4000-8000-000000000082', 'risk_evaluations', 1), false,
       date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 5,
       null, null, null, 'risk_evaluations') $$,
  $$ values (15) $$,
  'another import''s reading is charged'
);
reset role;

update public.import_library_parts
set status = 'failed', failure_reason = 'Nu am putut citi evaluările de risc.', failed_at = now()
where import_id = '10000000-0000-4000-8000-000000000082';

select results_eq(
  $$ select kind::text, credits, import_part::text from public.credit_entries
     where import_id = '10000000-0000-4000-8000-000000000082' order by id $$,
  $$ values ('library_part', -15, 'risk_evaluations'), ('library_part_refund', 15, 'risk_evaluations') $$,
  'and given back when it fails'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000081');

select is(
  public.retry_import_library_part('10000000-0000-4000-8000-000000000082', 'risk_evaluations'),
  2,
  'a failed reading is read again under its next attempt'
);

reset role;

update public.import_library_parts
set status = 'to_review', proposal = '{"sheets": []}', read_at = now()
where import_id = '10000000-0000-4000-8000-000000000082';
update public.imports
set status = 'confirmed', confirmed_at = now() - interval '15 days', confirmed_by = 'aaaaaaaa-0000-4000-8000-000000000081'
where id = '10000000-0000-4000-8000-000000000082';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000081');

select throws_ok(
  $$ select public.apply_risk_import('10000000-0000-4000-8000-000000000082', 'risk_evaluations', 0, '{}') $$,
  'ILP04', null, 'a part not confirmed 14 days after the client has expired'
);

reset role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, status, started_at, ready_at) values
  ('10000000-0000-4000-8000-000000000083', '11111111-0000-4000-8000-000000000081', 'client', 'cccccccc-0000-4000-8000-000000000081', true, 'ready', now(), now());
insert into public.import_library_parts (import_id, organization_id, part, updated_at) values
  ('10000000-0000-4000-8000-000000000083', '11111111-0000-4000-8000-000000000081', 'risk_evaluations', now() - interval '7 hours');

select results_eq(
  $$ select import_id, part::text from public.fail_stalled_library_parts('Citirea instrucțiunilor s-a oprit.', 'Citirea evaluărilor de risc s-a oprit.') $$,
  $$ values ('10000000-0000-4000-8000-000000000083'::uuid, 'risk_evaluations') $$,
  'a reading stalled for 6 hours fails'
);

select results_eq(
  $$ select status::text, failure_reason from public.import_library_parts where import_id = '10000000-0000-4000-8000-000000000083' $$,
  $$ values ('failed', 'Citirea evaluărilor de risc s-a oprit.') $$,
  'with its reason'
);

select ok(
  has_function_privilege('authenticated', 'public.apply_risk_import(uuid, public.import_library_part, integer, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.apply_risk_import(uuid, public.import_library_part, integer, jsonb)', 'execute'),
  'members confirm the part, anonymous callers do not'
);

select ok(
  not has_function_privilege('authenticated', 'public.imported_risk_evaluation(public.imports, jsonb, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.add_imported_profile_factor(uuid, uuid, jsonb, integer, uuid)', 'execute'),
  'its helpers are not callable on their own'
);

select * from finish();
rollback;
