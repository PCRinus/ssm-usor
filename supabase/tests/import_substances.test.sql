begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'specialist@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'specialist');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Cofetăria Albă SRL', '1590082', 'client'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Spălătoria Bujor SRL', '14399840', 'client');

insert into public.client_fire_safety (client_id, organization_id, substances_state) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'undecided'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'listed');

insert into public.fire_substances (organization_id, client_id, name, classification, quantity, sort_order) values
  ('11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'Propan', 'Flam. Gas 1, H220', '1 butelie de 11 kg', 0);

create or replace function pg_temp.act_as(user_id text)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', '{"provider":"email"}'::jsonb)::text, true);
$$;

set local role service_role;

insert into public.imports (id, organization_id, kind, client_id, into_existing_client, created_by, company_cui) values
  ('10000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '18547290'),
  ('10000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000001', true, 'bbbbbbbb-0000-4000-8000-000000000001', '1590082'),
  ('10000000-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'client', 'cccccccc-0000-4000-8000-000000000002', true, 'bbbbbbbb-0000-4000-8000-000000000001', '14399840'),
  ('10000000-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '5022670'),
  ('10000000-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000001', 'client', null, false, 'bbbbbbbb-0000-4000-8000-000000000001', '5022671');

update public.imports set status = 'ready', started_at = now(), ready_at = now(), proposal = '{"client": {}}';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000001');

select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000001', 0, '{
       "client": {"legal_name": "Patiseria Lunii SRL", "cui": "18547290"},
       "fire_safety": {"substances_state": "listed"},
       "fire_substances": [{"name": "Detergenți"}, {"name": "Ulei uzat"}]
     }') $$,
  'a new client''s import writes the answer and the substances the documents name'
);

select results_eq(
  $$ select f.substances_state::text from public.client_fire_safety f
     join public.clients c on c.id = f.client_id where c.cui = '18547290' $$,
  $$ values ('listed') $$,
  'the client lists its substances'
);

select results_eq(
  $$ select s.name, s.classification, s.quantity, s.sort_order, s.created_by from public.fire_substances s
     join public.clients c on c.id = s.client_id where c.cui = '18547290' order by s.sort_order $$,
  $$ values ('Detergenți', null::text, null::text, 0, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid),
            ('Ulei uzat', null, null, 1, 'bbbbbbbb-0000-4000-8000-000000000001'::uuid) $$,
  'by name only, in the documents'' order, waiting for their classification and quantity'
);

select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000004', 0, '{
       "client": {"legal_name": "Birourile Nord SRL", "cui": "5022670"},
       "fire_safety": {"substances_state": "none"}
     }') $$,
  'a new client''s import writes a declared "none"'
);

select results_eq(
  $$ select f.substances_state::text, (select count(*)::int from public.fire_substances s where s.client_id = f.client_id)
     from public.client_fire_safety f join public.clients c on c.id = f.client_id where c.cui = '5022670' $$,
  $$ values ('none', 0) $$,
  'with no substance'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000005', 0, '{
       "client": {"legal_name": "Atelier Sud SRL", "cui": "5022671"},
       "fire_safety": {"periodic_training_hours": 2},
       "fire_substances": [{"name": "Diluant"}]
     }') $$,
  'SUB02',
  null,
  'a substance under a client whose answer is not "listed" is refused by the list''s own trigger'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000005', 0, '{
       "client": {"legal_name": "Atelier Sud SRL", "cui": "5022671"},
       "fire_substances": [{"name": "Diluant", "quantity": "2 l"}]
     }') $$,
  '22023',
  null,
  'a substance carries its name only'
);

select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000002', 0, '{
       "client": {},
       "fire_safety": {"substances_state": "listed"},
       "fire_substances": [{"name": "Dezinfectant"}]
     }') $$,
  'an existing client whose answer is undecided takes the documents'''
);

select results_eq(
  $$ select f.substances_state::text, (select string_agg(s.name, ', ') from public.fire_substances s where s.client_id = f.client_id)
     from public.client_fire_safety f where f.client_id = 'cccccccc-0000-4000-8000-000000000001' $$,
  $$ values ('listed', 'Dezinfectant') $$,
  'and the substances with it'
);

select throws_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000003', 0, '{
       "client": {},
       "fire_safety": {"substances_state": "none", "replace": ["substances_state"]}
     }') $$,
  'SUB01',
  null,
  'a declared "none" is refused while the client lists substances'
);

select lives_ok(
  $$ select public.apply_client_import('10000000-0000-4000-8000-000000000003', 0, '{
       "client": {},
       "fire_safety": {"substances_state": "none"},
       "fire_substances": [{"name": " propan "}, {"name": "Motorină"}]
     }') $$,
  'an existing client''s decided answer is kept unless replaced'
);

select results_eq(
  $$ select f.substances_state::text from public.client_fire_safety f
     where f.client_id = 'cccccccc-0000-4000-8000-000000000002' $$,
  $$ values ('listed') $$,
  'so it still lists its substances'
);

select results_eq(
  $$ select s.name, s.classification, s.sort_order from public.fire_substances s
     where s.client_id = 'cccccccc-0000-4000-8000-000000000002' order by s.sort_order $$,
  $$ values ('Propan', 'Flam. Gas 1, H220', 0), ('Motorină', null, 1) $$,
  'a substance named like one it lists is not added again, and a new one goes after its own'
);

select * from finish();
rollback;
