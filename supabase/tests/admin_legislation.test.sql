begin;
select plan(38);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), v.app_metadata::jsonb, '{}', now(), now()
from (values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'owner-admin-legislation@example.com', '{"provider":"email"}'),
  ('eeeeeeee-0000-4000-8000-0000000000c1', 'admin-legislation@example.com', '{"provider":"email","role":"admin"}')
) as v (id, email, app_metadata);

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-0000000000c1', 'Protecția Muncii Expert SRL');
insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', '11111111-0000-4000-8000-0000000000c1', 'owner');

insert into public.legal_acts (id, name, portal_id, portal_status, verified_consolidated_on, last_consolidated_on) values
  ('oug-195-2002', 'O.U.G. 195/2002', 41006, 'in_force', '2026-08-25', '2026-11-06'),
  ('lege-227-2015', 'Legea 227/2015', 171280, 'in_force', '2026-10-25', '2026-10-25'),
  ('lege-319-2006', 'Legea 319/2006', 73772, 'in_force', '2021-07-25', '2021-07-25'),
  ('lege-53-2003', 'Legea 53/2003', 41625, 'in_force', '2026-04-27', '2026-10-30'),
  ('omai-163-2007', 'OMAI 163/2007', null, null, null, null)
on conflict (id) do update set
  verified_consolidated_on = excluded.verified_consolidated_on,
  last_consolidated_on = excluded.last_consolidated_on;

insert into public.legal_changes (id, act_id, seen_at, consolidated_on, outcome, assessed_at, compared_with) values
  ('d1d1d1d1-0000-4000-8000-0000000000c1', 'oug-195-2002', '2026-10-31 03:20+00', '2026-10-30', 'quote_differs', now(), '2026-08-25'),
  ('d1d1d1d1-0000-4000-8000-0000000000c2', 'lege-227-2015', '2026-10-19 03:20+00', '2026-10-18', 'needs_review', now(), '2026-08-01'),
  ('d1d1d1d1-0000-4000-8000-0000000000c3', 'lege-319-2006', '2026-11-10 03:20+00', '2026-11-09', 'quote_differs', now(), '2021-07-25'),
  ('d1d1d1d1-0000-4000-8000-0000000000d4', 'lege-53-2003', '2026-10-01 03:20+00', '2026-09-30', 'needs_review', now(), '2026-04-27');

insert into public.legal_change_passages (change_id, manifest, template_file, type_key, paragraph, citation_form, unit_label, status, old_text, new_text) values
  ('d1d1d1d1-0000-4000-8000-0000000000c1', 'ssm', '2.2_general_training_material.docx', 'test_material', 2048, 'quote', 'Art. 36 alin. (2)', 'changed', 'casca', 'pe cap cască'),
  ('d1d1d1d1-0000-4000-8000-0000000000c3', 'ssm', '2.2_general_training_material.docx', 'test_material', 120, 'quote', 'Art. 7', 'changed', 'vechi', 'nou');

insert into public.document_templates (id, organization_id, type_key, title) values
  ('70000000-0000-4000-8000-0000000000c1', null, 'test_material', 'Material instruire generală'),
  ('70000000-0000-4000-8000-0000000000c2', null, 'test_themes', 'Tematica instruirii'),
  ('70000000-0000-4000-8000-0000000000c3', '11111111-0000-4000-8000-0000000000c1', 'test_material', 'Materialul nostru');

insert into public.document_template_versions (id, template_id, version, storage_path, sha256, kind, note, created_at) values
  ('a1a1a1a1-0000-4000-8000-0000000000c1', '70000000-0000-4000-8000-0000000000c1', 901, 'test/c1', repeat('1', 64), 'correction', 'Corecturi.', '2026-10-20 10:00+00'),
  ('a1a1a1a1-0000-4000-8000-0000000000c2', '70000000-0000-4000-8000-0000000000c1', 902, 'test/c2', repeat('2', 64), 'layout', null, '2026-11-08 10:00+00'),
  ('a1a1a1a1-0000-4000-8000-0000000000c3', '70000000-0000-4000-8000-0000000000c2', 903, 'test/c3', repeat('3', 64), 'legal', 'Tematica.', '2026-11-08 10:00+00'),
  ('a1a1a1a1-0000-4000-8000-0000000000c4', '70000000-0000-4000-8000-0000000000c3', 904, 'test/c4', repeat('4', 64), 'legal', 'A lor.', '2026-11-08 10:00+00'),
  ('a1a1a1a1-0000-4000-8000-0000000000c5', '70000000-0000-4000-8000-0000000000c1', 905, 'test/c5', repeat('5', 64), 'legal', 'Art. 36 alin. (2) preia forma din 30 octombrie 2026.', '2026-11-12 10:00+00');

create or replace function pg_temp.act_as(p_user_id text, p_aal text default 'aal2')
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object(
           'sub', p_user_id, 'role', 'authenticated', 'aal', p_aal,
           'app_metadata', case when p_user_id = 'eeeeeeee-0000-4000-8000-0000000000c1'
             then '{"provider":"email","role":"admin"}'::json else '{"provider":"email"}'::json end
         )::text, true),
         set_config('request.headers', '{}', true);
$$;

grant execute on all functions in schema pg_temp to authenticated;

select ok(
  bool_and(has_function_privilege('authenticated', f, 'execute')
    and not has_function_privilege('anon', f, 'execute')
    and not has_function_privilege('service_role', f, 'execute')),
  'only a signed-in token reaches the admin''s legislation writes, which then ask for the admin'
)
from unnest(array[
  'public.admin_resolve_legal_change_no_impact(uuid, text)',
  'public.admin_link_legal_change(uuid, uuid)',
  'public.admin_record_verified_form(text, date)'
]) as f;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000c1');

select throws_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000c2', 'Fără impact.') $$,
  '42501', null, 'a member cannot resolve a change'
);
select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000c5') $$,
  '42501', null, 'a member cannot link a change to a version'
);
select throws_ok(
  $$ select public.admin_record_verified_form('oug-195-2002', '2026-11-06') $$,
  '42501', null, 'a member cannot record a verified form'
);
select is(
  (select count(*) from public.legal_changes where resolution = 'open' and id::text like 'd1d1d1d1-%-0000000000c_'),
  3::bigint,
  'a member still reads the changes'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000c1', 'aal1');

select throws_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000c2', 'Fără impact.') $$,
  '42501', null, 'an admin without his second factor cannot resolve a change'
);
select throws_ok(
  $$ select public.admin_record_verified_form('oug-195-2002', '2026-11-06') $$,
  '42501', null, 'an admin without his second factor cannot record a verified form'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000c1');

select throws_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000c2', '  . ') $$,
  '22023', null, 'a change is resolved with a note'
);
select throws_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000c2', repeat('a', 501)) $$,
  '22023', null, 'the note has at most 500 characters'
);
select throws_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000ff', 'Fără impact.') $$,
  'P0002', null, 'a change that does not exist is not resolved'
);

select lives_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000c2', '  Art. 342 nu e citat în niciun document. ') $$,
  'the admin resolves a change as no impact'
);

reset role;

select results_eq(
  $$ select resolution, resolved_at is not null, resolved_by_note from public.legal_changes where id = 'd1d1d1d1-0000-4000-8000-0000000000c2' $$,
  $$ values ('no_impact'::text, true, 'Art. 342 nu e citat în niciun document.'::text) $$,
  'the change is resolved with the trimmed note'
);
select is(
  (select verified_consolidated_on from public.legal_acts where id = 'lege-227-2015'),
  '2026-10-25'::date,
  'a change older than the verified form leaves the form where it is'
);
select results_eq(
  $$ select action, table_name, actor_id, source, organization_id is null, details ->> 'resolution'
     from audit.events where row_id = 'd1d1d1d1-0000-4000-8000-0000000000c2' $$,
  $$ values ('legal_change_resolved'::text, 'legal_changes'::text, 'eeeeeeee-0000-4000-8000-0000000000c1'::uuid, 'user'::text, true, 'no_impact'::text) $$,
  'resolving a change is recorded in the audit log, with the admin as its actor'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000c1');

select throws_ok(
  $$ select public.admin_resolve_legal_change_no_impact('d1d1d1d1-0000-4000-8000-0000000000c2', 'Din nou.') $$,
  'LGA01', null, 'a resolved change is not resolved again'
);
select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c2', 'a1a1a1a1-0000-4000-8000-0000000000c5') $$,
  'LGA01', null, 'a resolved change is not linked'
);

select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000c1') $$,
  'LGA02', null, 'a version registered before the change was seen cannot answer it'
);
select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000c2') $$,
  'LGA02', null, 'a layout version cannot answer a change'
);
select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000c3') $$,
  'LGA02', null, 'a version of a template the change''s passages do not name cannot answer it'
);
select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000c4') $$,
  'LGA02', null, 'an organization''s own template cannot answer a change'
);
select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000ff') $$,
  'LGA02', null, 'a version that does not exist cannot answer a change'
);

select lives_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c1', 'a1a1a1a1-0000-4000-8000-0000000000c5') $$,
  'the admin links a change to the version that answers it'
);

reset role;

select results_eq(
  $$ select resolution, resolved_at is not null, resolved_by_note from public.legal_changes where id = 'd1d1d1d1-0000-4000-8000-0000000000c1' $$,
  $$ values ('template_version'::text, true, 'Art. 36 alin. (2) preia forma din 30 octombrie 2026.'::text) $$,
  'the change is resolved by the version, with its note'
);
select is(
  (select resolves_legal_change_id from public.document_template_versions where id = 'a1a1a1a1-0000-4000-8000-0000000000c5'),
  'd1d1d1d1-0000-4000-8000-0000000000c1'::uuid,
  'the version names the change it answers'
);
select is(
  (select verified_consolidated_on from public.legal_acts where id = 'oug-195-2002'),
  '2026-10-30'::date,
  'the act''s verified form becomes the change''s'
);
select results_eq(
  $$ select action, details ->> 'resolution', details ->> 'template_version_id', details -> 'verified_consolidated_on'
     from audit.events where row_id = 'd1d1d1d1-0000-4000-8000-0000000000c1' $$,
  $$ values ('legal_change_resolved'::text, 'template_version'::text, 'a1a1a1a1-0000-4000-8000-0000000000c5'::text, '["2026-08-25", "2026-10-30"]'::jsonb) $$,
  'linking a change is recorded in the audit log with the version and the verified form it moved'
);

select pg_temp.act_as('eeeeeeee-0000-4000-8000-0000000000c1');

select throws_ok(
  $$ select public.admin_link_legal_change('d1d1d1d1-0000-4000-8000-0000000000c3', 'a1a1a1a1-0000-4000-8000-0000000000c5') $$,
  'LGA02', null, 'a version answers one change'
);

select throws_ok(
  $$ select public.admin_record_verified_form('lege-319-2006', '2021-07-26') $$,
  'LGA03', null, 'a form newer than the last one seen is not recorded'
);
select throws_ok(
  $$ select public.admin_record_verified_form('omai-163-2007', '2020-01-01') $$,
  'LGA03', null, 'an act with no form seen has none to record'
);
select throws_ok(
  $$ select public.admin_record_verified_form('lege-1-1900', '2020-01-01') $$,
  'P0002', null, 'an act that is not watched has no form to record'
);
select throws_ok(
  $$ select public.admin_record_verified_form('lege-53-2003', '2026-09-30') $$,
  'LGA04', null, 'a form at an open change of the act is not recorded while it is open'
);
select throws_ok(
  $$ select public.admin_record_verified_form('lege-53-2003', '2026-10-30') $$,
  'LGA04', null, 'a form after an open change of the act is not recorded while it is open'
);
select lives_ok(
  $$ select public.admin_record_verified_form('lege-53-2003', '2026-09-29') $$,
  'a form before the act''s open changes is recorded'
);
select lives_ok(
  $$ select public.admin_record_verified_form('lege-319-2006', '2021-05-06') $$,
  'the admin records an earlier form as the verified one'
);

reset role;

select is(
  (select verified_consolidated_on from public.legal_acts where id = 'lege-319-2006'),
  '2021-05-06'::date,
  'the act has the form the admin recorded'
);
select results_eq(
  $$ select action, table_name, actor_id, details from audit.events where action = 'legal_act_verified' and details ->> 'act_id' = 'lege-319-2006' $$,
  $$ values ('legal_act_verified'::text, 'legal_acts'::text, 'eeeeeeee-0000-4000-8000-0000000000c1'::uuid,
       '{"act_id": "lege-319-2006", "verified_consolidated_on": ["2021-07-25", "2021-05-06"]}'::jsonb) $$,
  'recording a verified form is in the audit log with the form before and after'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000c1');

select throws_ok(
  $$ update public.legal_change_passages set type_key = 'test_themes' $$,
  '42501', null, 'a member cannot change a passage''s template'
);
select is(
  (select type_key from public.legal_change_passages where change_id = 'd1d1d1d1-0000-4000-8000-0000000000c1'),
  'test_material',
  'a member reads the template a passage is in'
);

select * from finish();
rollback;
