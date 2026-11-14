begin;
select plan(37);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Client of A', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lead of A', '14399840', 'lead'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Lead to promote', '18547290', 'lead');

insert into public.client_documents (id, organization_id, client_id, type_key, title, document_group, owners_only) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'service_contract', 'Contract de prestări servicii', 'other', true);

insert into public.document_revisions (id, document_id, organization_id, revision, status, docx_path, issued_at, docx_sha256) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 1, 'issued',
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx',
   now(), repeat('a', 64)),
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 2, 'draft',
   '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/2.docx',
   null, null);

insert into public.client_files (id, organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, owners_only, uploaded_by) values
  ('ffffffff-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'Ofertă', 'oferta.pdf', 'application/pdf', 10, repeat('a', 64), true, 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.client_owner_notes (client_id, organization_id, body) values ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Sunat.');

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

create or replace function pg_temp.subscribe(p_plan text, p_status text, p_trial_ends_at timestamptz)
returns void language sql as $$
  delete from public.subscriptions;
  insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
  values (
    '11111111-0000-4000-8000-000000000001',
    p_plan::public.subscription_plan,
    p_status::public.subscription_status,
    p_trial_ends_at,
    case when p_status = 'active' then null else now() + interval '30 days' end
  );
$$;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select ok(public.current_organization_has_offers(), 'without a subscription an organization has offers');

reset role;
select pg_temp.subscribe('profesional', 'trialing', now() + interval '14 days');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(public.current_organization_has_offers(), 'a trial has offers');

reset role;
select pg_temp.subscribe('start', 'trialing', now() + interval '14 days');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(public.current_organization_has_offers(), 'Start chosen during the trial keeps offers until the trial ends');

reset role;
select pg_temp.subscribe('profesional', 'active', null);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(public.current_organization_has_offers(), 'Profesional has offers');

reset role;
select pg_temp.subscribe('enterprise', 'active', null);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(public.current_organization_has_offers(), 'Enterprise has offers');

reset role;
select pg_temp.subscribe('start', 'trialing', now() - interval '1 day');
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(not public.current_organization_has_offers(), 'Start chosen in a trial that ended has no offers');

reset role;
select pg_temp.subscribe('start', 'past_due', null);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(not public.current_organization_has_offers(), 'Start awaiting a payment has no offers');

reset role;
select pg_temp.subscribe('start', 'canceled', null);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(not public.current_organization_has_offers(), 'a cancelled Start has no offers');

reset role;
select pg_temp.subscribe('start', 'active', null);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select ok(not public.current_organization_has_offers(), 'Start has no offers');

select throws_ok(
  $$ insert into public.clients (organization_id, legal_name, cui, stage)
     values ('11111111-0000-4000-8000-000000000001', 'New lead', '6859662', 'lead') $$,
  'CLL03',
  null,
  'Start creates no lead'
);

select lives_ok(
  $$ insert into public.clients (organization_id, legal_name, cui, stage)
     values ('11111111-0000-4000-8000-000000000001', 'New client', '6859662', 'client') $$,
  'Start still creates a client'
);

select throws_ok(
  $$ update public.clients set legal_name = 'Renamed lead' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'CLL03',
  null,
  'Start edits no lead'
);

select throws_ok(
  $$ update public.clients set contact_email = 'x@test.ro' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'CLL03',
  null,
  'Start changes no lead''s contact'
);

select lives_ok(
  $$ update public.clients set legal_name = 'Renamed client' where id = 'cccccccc-0000-4000-8000-000000000001' $$,
  'Start still edits a client'
);

select lives_ok(
  $$ update public.clients set archived_at = now() where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'Start archives a lead'
);

select lives_ok(
  $$ update public.clients set archived_at = null where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'Start restores a lead'
);

select throws_ok(
  $$ update public.clients set stage = 'client', legal_name = 'Sneaked in' where id = 'cccccccc-0000-4000-8000-000000000003' $$,
  'CLL03',
  null,
  'a promotion carries no other change'
);

select lives_ok(
  $$ update public.clients set stage = 'client' where id = 'cccccccc-0000-4000-8000-000000000003' $$,
  'Start promotes a lead'
);

select throws_ok(
  $$ insert into public.client_owner_notes (client_id, organization_id, body)
     values ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'x') $$,
  'CLL03',
  null,
  'Start writes no notes on a lead'
);

select lives_ok(
  $$ insert into public.client_owner_notes (client_id, organization_id, body)
     values ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'x') $$,
  'Start writes notes on a client'
);

select throws_ok(
  $$ insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 51, '2026-02-15', '2026-02-15', 12) $$,
  'CLL03',
  null,
  'Start records no contract for a lead'
);

select lives_ok(
  $$ insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 52, '2026-02-15', '2026-02-15', 12) $$,
  'Start records the contract of a client'
);

select throws_ok(
  $$ insert into public.client_documents (organization_id, client_id, type_key, title, document_group, owners_only)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'service_contract', 'Contract', 'other', true) $$,
  'CLL03',
  null,
  'Start starts no contract for a lead'
);

select throws_ok(
  $$ insert into public.client_files (organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256, uploaded_by, owners_only)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'Ofertă', 'oferta.pdf', 'application/pdf', 10, repeat('a', 64), 'aaaaaaaa-0000-4000-8000-000000000001', true) $$,
  'CLL03',
  null,
  'Start adds no file to a lead'
);

select throws_ok(
  $$ insert into public.document_revisions (document_id, organization_id, revision, status, docx_path, created_by)
     values ('dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 1, 'draft',
             '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.docx',
             'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'CLL03',
  null,
  'Start drafts no contract of a lead'
);

select throws_ok(
  $$ insert into public.document_signed_copies (revision_id, organization_id, document_id, storage_path, sha256)
     values ('eeeeeeee-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001',
             '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/1.signed.pdf',
             repeat('b', 64)) $$,
  'CLL03',
  null,
  'Start attaches no signed copy to a lead''s contract'
);

select throws_ok(
  $$ insert into public.service_contract_sends (organization_id, document_id, revision_id, sent_to)
     values ('11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'andrei@client.ro') $$,
  'CLL03',
  null,
  'Start records no send of a lead''s contract'
);

select throws_ok(
  $$ update public.client_owner_notes set client_id = 'cccccccc-0000-4000-8000-000000000001' where client_id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'CLL03',
  null,
  'a row does not leave a lead for a client'
);

select ok(
  not public.is_draft_document_path(
    '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/2.docx'
  ),
  'Start writes no file of a lead''s draft to Storage'
);

select ok(
  not public.is_writable_client_file_path((select storage_path from public.client_files where id = 'ffffffff-0000-4000-8000-000000000001')),
  'Start writes or removes no file of a lead in Storage'
);

select results_eq(
  $$ select legal_name from public.clients where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  $$ values ('Lead of A') $$,
  'Start still reads its leads'
);

reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$ update public.clients set contact_name = 'Ion Pop' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'the secret key is not refused'
);

reset role;
select pg_temp.subscribe('profesional', 'active', null);
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ update public.clients set legal_name = 'Renamed lead' where id = 'cccccccc-0000-4000-8000-000000000002' $$,
  'Profesional edits a lead'
);

select lives_ok(
  $$ insert into public.service_contracts (organization_id, client_id, contract_number, contract_date, start_date, duration_months)
     values ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 53, '2026-02-15', '2026-02-15', 12) $$,
  'Profesional records the contract of a lead'
);

select lives_ok(
  $$ insert into public.clients (organization_id, legal_name, cui, stage)
     values ('11111111-0000-4000-8000-000000000001', 'Another lead', '4221306', 'lead') $$,
  'Profesional creates a lead'
);

select ok(
  public.is_draft_document_path(
    '11111111-0000-4000-8000-000000000001/cccccccc-0000-4000-8000-000000000002/dddddddd-0000-4000-8000-000000000001/2.docx'
  ),
  'Profesional writes the file of a lead''s draft'
);

select ok(
  public.is_writable_client_file_path((select storage_path from public.client_files where id = 'ffffffff-0000-4000-8000-000000000001')),
  'Profesional writes the files of a lead'
);

select * from finish();
rollback;
