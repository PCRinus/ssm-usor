begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');
insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.legal_acts (id, name, verified_consolidated_on) values
  ('oug-195-2002', 'O.U.G. 195/2002', '2030-01-01'),
  ('lege-319-2006', 'Legea 319/2006', '2030-01-01')
on conflict (id) do update set verified_consolidated_on = excluded.verified_consolidated_on;

insert into public.legal_changes (id, act_id, consolidated_on, outcome, assessed_at, compared_with) values
  ('d1d1d1d1-0000-4000-8000-000000000001', 'oug-195-2002', '2030-02-01', 'quote_differs', now(), '2030-01-01'),
  ('d1d1d1d1-0000-4000-8000-000000000002', 'lege-319-2006', '2030-03-01', 'quote_differs', now(), '2030-01-01'),
  ('d1d1d1d1-0000-4000-8000-000000000004', 'lege-319-2006', '2030-02-15', 'quote_differs', now(), '2030-01-01');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/1.docx', repeat('1', 64), 'correction', 'Versiunea inițială.') $$,
  $$ values (1, true) $$,
  'the six-argument call registers as before'
);

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/2.docx', repeat('2', 64), 'legal',
       'Art. 36 alin. (2) din O.U.G. 195/2002 citat în forma în vigoare.',
       '{"act": "oug-195-2002", "consolidatedOn": "2030-02-01"}') $$,
  $$ values (2, true) $$,
  'a legal version names the change it resolves'
);

select results_eq(
  $$ select resolution, resolved_by_note, resolved_at is not null from public.legal_changes
     where id = 'd1d1d1d1-0000-4000-8000-000000000001' $$,
  $$ values ('template_version', 'Art. 36 alin. (2) din O.U.G. 195/2002 citat în forma în vigoare.', true) $$,
  'the change is resolved by the version, with its note'
);

select is(
  (select resolves_legal_change_id from public.document_template_versions where sha256 = repeat('2', 64)),
  'd1d1d1d1-0000-4000-8000-000000000001'::uuid,
  'the version names the change it answers'
);

select results_eq(
  $$ select l.legal_change_id from public.template_version_legal_changes l
     join public.document_template_versions tv on tv.id = l.template_version_id
     where tv.sha256 = repeat('2', 64) $$,
  $$ values ('d1d1d1d1-0000-4000-8000-000000000001'::uuid) $$,
  'the link is listed once'
);

select is(
  (select verified_consolidated_on from public.legal_acts where id = 'oug-195-2002'),
  '2030-02-01'::date,
  'the act is now verified against the form the version quotes'
);

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/2.docx', repeat('2', 64), 'legal', 'Altă notă.',
       '[{"act": "lege-319-2006", "consolidatedOn": "2030-02-15"}]') $$,
  $$ values (2, false) $$,
  'a file registered again is the version it already is'
);

select results_eq(
  $$ select kind, note from public.document_template_versions where sha256 = repeat('2', 64) $$,
  $$ values ('legal', 'Art. 36 alin. (2) din O.U.G. 195/2002 citat în forma în vigoare.') $$,
  'and keeps the kind and note it came with'
);

select results_eq(
  $$ select resolution, resolved_by_note from public.legal_changes
     where id = 'd1d1d1d1-0000-4000-8000-000000000004' $$,
  $$ values ('template_version', 'Art. 36 alin. (2) din O.U.G. 195/2002 citat în forma în vigoare.') $$,
  'but still resolves the changes its manifest names, with the version''s note'
);

select is(
  (select count(*) from public.template_version_legal_changes l
   join public.document_template_versions tv on tv.id = l.template_version_id
   where tv.sha256 = repeat('2', 64)),
  2::bigint,
  'and is linked to them'
);

select results_eq(
  $$ select version, created from public.register_built_in_template_version(
       'resolves_list_test', 'Tematica', 'built-in/resolves_list_test/1.docx', repeat('3', 64), 'legal',
       'Art. 36 din O.U.G. 195/2002 și art. 7 din Legea 319/2006 citate în forma în vigoare.',
       '[{"act": "lege-319-2006", "consolidatedOn": "2030-03-01"}, {"act": "oug-195-2002", "consolidatedOn": "2030-04-01"}, {"act": "oug-195-2002", "consolidatedOn": "2030-02-01"}]') $$,
  $$ values (1, true) $$,
  'a version resolves a list of changes'
);

select is(
  (select resolution from public.legal_changes where id = 'd1d1d1d1-0000-4000-8000-000000000002'),
  'template_version',
  'an open change in the list is resolved'
);

select results_eq(
  $$ select resolution, outcome, resolved_by_note from public.legal_changes
     where act_id = 'oug-195-2002' and consolidated_on = '2030-04-01' $$,
  $$ values ('template_version', null::text, 'Art. 36 din O.U.G. 195/2002 și art. 7 din Legea 319/2006 citate în forma în vigoare.') $$,
  'a change this environment never recorded is recorded as resolved'
);

select is(
  (select resolved_by_note from public.legal_changes where id = 'd1d1d1d1-0000-4000-8000-000000000001'),
  'Art. 36 alin. (2) din O.U.G. 195/2002 citat în forma în vigoare.',
  'a change already resolved keeps its resolution'
);

select is(
  (select count(*) from public.template_version_legal_changes l
   join public.document_template_versions tv on tv.id = l.template_version_id
   where tv.sha256 = repeat('3', 64)),
  3::bigint,
  'the version is linked to every change it lists'
);

select is(
  (select resolves_legal_change_id from public.document_template_versions where sha256 = repeat('3', 64)),
  'd1d1d1d1-0000-4000-8000-000000000002'::uuid,
  'the version''s own column names the first'
);

select results_eq(
  $$ select id, verified_consolidated_on from public.legal_acts where id in ('oug-195-2002', 'lege-319-2006') order by id $$,
  $$ values ('lege-319-2006', '2030-03-01'::date), ('oug-195-2002', '2030-04-01'::date) $$,
  'each act moves to the newest form a version quotes, never back'
);

select throws_ok(
  $$ select * from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/4.docx', repeat('4', 64), 'correction', 'Corectură.',
       '{"act": "oug-195-2002", "consolidatedOn": "2030-05-01"}') $$,
  '22023',
  null,
  'only a legal version resolves a change'
);

select throws_ok(
  $$ select * from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/4.docx', repeat('4', 64), 'legal', 'Lege.',
       '{"act": "lege-1-1900", "consolidatedOn": "2030-05-01"}') $$,
  'P0002',
  null,
  'an act that is not watched is refused'
);

select throws_ok(
  $$ select * from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/4.docx', repeat('4', 64), 'legal', 'Lege.',
       '[{"act": "oug-195-2002", "consolidatedOn": "a doua zi"}]') $$,
  '22023',
  null,
  'a resolved change needs a date'
);

select throws_ok(
  $$ select * from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/4.docx', repeat('4', 64), 'legal', 'Lege.', '"oug-195-2002"') $$,
  '22023',
  null,
  'resolves is an object or a list'
);

select is(
  (select count(*) from public.document_template_versions where sha256 = repeat('4', 64)),
  0::bigint,
  'a refused registration leaves no version'
);

insert into public.legal_changes (id, act_id, consolidated_on) values
  ('d1d1d1d1-0000-4000-8000-000000000003', 'lege-319-2006', '2030-06-01');
update public.document_template_versions set resolves_legal_change_id = 'd1d1d1d1-0000-4000-8000-000000000003'
where sha256 = repeat('1', 64);

select is(
  (select count(*) from public.template_version_legal_changes where legal_change_id = 'd1d1d1d1-0000-4000-8000-000000000003'),
  1::bigint,
  'a version linked by its column is listed too'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select ok(
  (select count(*) from public.template_version_legal_changes) >= 5,
  'members read which versions answer the changes'
);

select throws_ok(
  $$ insert into public.template_version_legal_changes (template_version_id, legal_change_id)
     select id, 'd1d1d1d1-0000-4000-8000-000000000003' from public.document_template_versions where sha256 = repeat('2', 64) $$,
  '42501',
  null,
  'members do not link versions to changes'
);

select throws_ok(
  $$ select * from public.register_built_in_template_version(
       'resolves_test', 'Material', 'built-in/resolves_test/5.docx', repeat('5', 64), 'legal', 'Lege.', null) $$,
  '42501',
  null,
  'members do not register templates'
);

reset role;

select * from finish();
rollback;
