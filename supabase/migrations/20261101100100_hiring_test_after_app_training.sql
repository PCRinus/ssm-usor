-- A hiring test awaits only when the newest hiring record of the domain was held in the app
-- (ADR 032). A hiring training transcribed from paper was closed by its test on the sheet, so
-- without a pass recorded the state is `unverified`, which awaits nothing: no test in the portal
-- and no count on the dashboard.
--
-- No search_path setting, and every name qualified instead: a function with one is never
-- inlined, and the employee lists read this once per row.
create or replace function public.employee_test_due(
  p_employee_id uuid,
  p_status public.employee_status,
  p_domain public.training_domain
)
returns table (
  hiring_trained_on date,
  last_passed_on date,
  due_on date,
  state public.test_state,
  awaiting_test public.knowledge_test
)
language sql
stable
as $$
  select
    held.hiring_trained_on,
    passed.last_passed_on,
    due.due_on,
    standing.state,
    case standing.state
      when 'pending' then 'hiring'
      when 'annual_due' then 'annual'
    end::public.knowledge_test
  from (select 1) as one
  -- On a day with both, the training held in the app wins: its test is the one still owed.
  left join lateral (
    select t.held_on as hiring_trained_on, t.source = 'app' as held_in_app
    from public.training_records r
    join public.trainings t on t.id = r.training_id
    where r.employee_id = p_employee_id
      and t.domain = p_domain
      and t.phase = case p_domain
        when 'ssm' then 'introductory_general'
        else 'workplace'
      end::public.training_phase
    order by t.held_on desc, (t.source = 'app') desc
    limit 1
  ) as held on true
  cross join (
    select max(x.taken_on) as last_passed_on
    from public.test_results x
    where x.employee_id = p_employee_id and x.domain = p_domain
  ) as passed
  cross join lateral (
    select case
      when p_domain = 'psi' then (passed.last_passed_on + pg_catalog.make_interval(months => 12))::date
    end as due_on
  ) as due
  cross join (select (pg_catalog.now() at time zone 'Europe/Bucharest')::date as day) as today
  cross join lateral (
    select case
      when p_status = 'terminated' then null
      when passed.last_passed_on is null then
        case
          when held.hiring_trained_on is null then 'none'
          when held.held_in_app then 'pending'
          else 'unverified'
        end
      when due.due_on <= today.day then 'annual_due'
      else 'passed'
    end::public.test_state as state
  ) as standing;
$$;
