begin;
select plan(3);

select is_empty(
  $$ select schemaname || '.' || tablename || ': ' || policyname
     from pg_policies
     where schemaname in ('public', 'storage')
       and regexp_replace(
             coalesce(qual, '') || ' ' || coalesce(with_check, ''),
             '\( SELECT (public\.)?(current_organization_id|is_organization_owner)\(\) AS \2\)', '', 'g'
           ) ~ '(current_organization_id|is_organization_owner)\(' $$,
  'every policy calls the organization helpers inside a subquery, once per query'
);

select ok(
  (select count(*) > 0 from pg_policies
   where qual ~ '\( SELECT (public\.)?current_organization_id\(\) AS current_organization_id\)'),
  'the subquery form is the one the check above looks past'
);

select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p
     where p.oid in ('public.training_status(public.employees)'::regprocedure, 'public.test_status(public.employees)'::regprocedure)
       and (p.proconfig is not null or p.prosecdef or p.prolang <> (select oid from pg_language where lanname = 'sql')) $$,
  'the employee statuses stay inlinable into the employee lists'
);

select * from finish();
rollback;
