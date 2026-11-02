begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test', 'x', now(), '{"provider":"email"}', '{}', now(), now());

insert into public.organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.organization_members (user_id, organization_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner');

create or replace function pg_temp.articles(n int)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array('Articolul ' || i || '.'))), '[]'::jsonb)
  from generate_series(1, n) i;
$$;

create or replace function pg_temp.act_as(user_id text, app_metadata jsonb)
returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated', 'app_metadata', app_metadata)::text, true);
$$;

select ok(
  public.is_instruction_body('{"blocks": [
    {"kind": "heading", "text": "Înainte de începerea lucrului"},
    {"kind": "article", "paragraphs": ["Se verifică scara.", "a) treptele;", "b) talpa antiderapantă."]}
  ]}'),
  'a body of headings and articles of paragraphs is a body'
);

select ok(
  not public.is_instruction_body('{"blocks": [{"kind": "heading", "text": "Domeniul de aplicare"}]}'),
  'a body without an article is not'
);

select ok(
  not public.is_instruction_body('{"blocks": []}'),
  'nor is an empty one'
);

select ok(
  public.is_instruction_body(jsonb_build_object('blocks', pg_temp.articles(400))),
  'a body holds up to 400 articles'
);

select ok(
  not public.is_instruction_body(jsonb_build_object('blocks', pg_temp.articles(401))),
  'and no more'
);

select ok(
  not public.is_instruction_body(jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('kind', 'article', 'paragraphs', (
      select jsonb_agg(repeat('a', 20000)) from generate_series(1, 10)
    )),
    jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array('b'))
  ))),
  'a body holds at most 200,000 characters'
);

select ok(
  not public.is_instruction_body('{"blocks": [{"kind": "article", "paragraphs": []}]}'),
  'an article has a paragraph'
);

select ok(
  not public.is_instruction_body('{"blocks": [{"kind": "article", "paragraphs": ["  "]}]}'),
  'a blank paragraph is refused'
);

select ok(
  not public.is_instruction_body(jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array(repeat('a', 20001)))
  ))),
  'a paragraph is at most 20,000 characters'
);

select ok(
  not public.is_instruction_body(jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array('Rândul unu' || chr(10) || 'rândul doi'))
  ))),
  'a paragraph is one line'
);

select ok(
  not public.is_instruction_body('{"blocks": [{"kind": "article", "paragraphs": [12]}]}'),
  'a paragraph is text'
);

select ok(
  not public.is_instruction_body(jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('kind', 'heading', 'text', repeat('T', 301)),
    jsonb_build_object('kind', 'article', 'paragraphs', jsonb_build_array('a'))
  ))),
  'a heading is at most 300 characters'
);

select ok(
  not public.is_instruction_body('{"blocks": [{"kind": "table", "rows": []}, {"kind": "article", "paragraphs": ["a"]}]}'),
  'a block is a heading or an article'
);

select ok(
  not public.is_instruction_body('{"blocks": [{"kind": "article", "paragraphs": ["a"], "bold": true}]}'),
  'a block carries no formatting'
);

select ok(
  not public.is_instruction_body('[{"kind": "article", "paragraphs": ["a"]}]'),
  'a body is an object of blocks'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001', '{"provider":"email"}');

select lives_ok(
  $$ insert into public.instruction_modules (id, organization_id, title, module_group, domain) values
       ('a0a0a0a0-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Scări metalice', 'work_equipment', 'ssm'),
       ('a0a0a0a0-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Lucrul cu foc deschis', 'hazardous_work', 'su') $$,
  'a fire-safety module takes a fire-safety category'
);

select throws_ok(
  $$ insert into public.instruction_modules (organization_id, title, module_group, domain)
     values ('11111111-0000-4000-8000-000000000001', 'Birouri', 'premises_activity', 'ssm') $$,
  '23514',
  null,
  'an occupational safety module refuses a fire-safety category'
);

select throws_ok(
  $$ insert into public.instruction_modules (organization_id, title, module_group, domain)
     values ('11111111-0000-4000-8000-000000000001', 'Căști', 'protective_equipment', 'su') $$,
  '23514',
  null,
  'and a fire-safety module an occupational safety one'
);

select throws_ok(
  $$ update public.instruction_modules set domain = 'su' where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'the domain changes only with a category of the other domain'
);

select lives_ok(
  $$ update public.instruction_modules set domain = 'su', module_group = 'installation_equipment'
     where id = 'a0a0a0a0-0000-4000-8000-000000000001' $$,
  'and does with one'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
             '{"blocks": [{"kind": "heading", "text": "Doar un titlu"}]}', repeat('a', 64)) $$,
  '23514',
  null,
  'a version refuses a body that is not one'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
             jsonb_build_object('blocks', pg_temp.articles(2)), 'not a hash') $$,
  '23514',
  null,
  'and a text hash that is not a SHA-256'
);

select throws_ok(
  $$ insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash, article_count)
     values ('11111111-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-000000000001', 1,
             jsonb_build_object('blocks', pg_temp.articles(2)), repeat('a', 64), 9) $$,
  '428C9',
  null,
  'the article count is never written'
);

reset role;

select hasnt_column('public', 'instruction_module_versions', 'docx_path', 'a version names no file');

select is(
  (select count(*)::int from storage.buckets where id = 'instruction-modules'),
  0,
  'the module files bucket is gone'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and (qual like '%instruction-modules%' or with_check like '%instruction-modules%')),
  0,
  'and so are its policies'
);

select * from finish();
rollback;
