begin;
select plan(7);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row-level security enabled'
);

select is_empty(
  $$ select c.relname, privilege
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) privilege
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_table_privilege('anon', c.oid, privilege) $$,
  'anon holds no privilege on any table or view in public'
);

select is_empty(
  $$ select c.relname, a.attname
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('anon', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES') $$,
  'anon holds no privilege on any column in public'
);

select is_empty(
  $$ select c.relname, privilege
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) privilege
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_table_privilege('authenticated', c.oid, privilege) $$,
  'authenticated holds no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN in public'
);

select is_empty(
  $$ select p.oid::regprocedure
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (select 1 from unnest(p.proconfig) setting where setting like 'search_path=%') $$,
  'every security definer function in public sets its search_path'
);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any (c.reloptions), false) $$,
  'every view in public runs with the privileges of the caller'
);

-- No allowlist: the waitlist and the auth hooks reach the database through the API's service role.
select is_empty(
  $$ select p.oid::regprocedure
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon cannot execute any security definer function in public'
);

select * from finish();
rollback;
