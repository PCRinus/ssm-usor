-- employee_test_due's rule from 20261101100100 (ADR 032), repeated: with no pass recorded, the
-- newest hiring record of the domain decides, and on a day with both the one held in the app.
-- A hiring record is held in the app on its newest day exactly when its newest app day is that day.

create or replace function public.organization_employee_states(p_organization_id uuid)
returns table (
  employee_id uuid,
  ssm_training_state public.training_state,
  ssm_training_due_on date,
  psi_training_state public.training_state,
  psi_training_due_on date,
  ssm_test_state public.test_state,
  psi_test_state public.test_state
)
language sql
stable
security definer
set search_path = ''
as $$
  with held as (
    select
      r.employee_id,
      max(t.held_on) filter (where t.domain = 'ssm' and t.phase = 'periodic') as ssm_last_periodic_on,
      max(t.held_on) filter (where t.domain = 'ssm' and t.phase = 'workplace') as ssm_workplace_trained_on,
      max(t.held_on) filter (where t.domain = 'ssm' and t.phase = 'introductory_general') as ssm_introduced_on,
      max(t.held_on) filter (
        where t.domain = 'ssm' and t.phase = 'introductory_general' and t.source = 'app'
      ) as ssm_introduced_in_app_on,
      max(t.held_on) filter (where t.domain = 'psi' and t.phase = 'periodic') as psi_last_periodic_on,
      max(t.held_on) filter (where t.domain = 'psi' and t.phase = 'workplace') as psi_workplace_trained_on,
      max(t.held_on) filter (
        where t.domain = 'psi' and t.phase = 'workplace' and t.source = 'app'
      ) as psi_workplace_in_app_on,
      max(t.held_on) filter (where t.domain = 'psi' and t.phase = 'introductory_general') as psi_introduced_on
    from public.training_records r
    join public.trainings t on t.id = r.training_id
    where r.organization_id = p_organization_id
      and t.organization_id = p_organization_id
    group by r.employee_id
  ),
  passed as (
    select
      x.employee_id,
      max(x.taken_on) filter (where x.domain = 'ssm') as ssm_last_passed_on,
      max(x.taken_on) filter (where x.domain = 'psi') as psi_last_passed_on
    from public.test_results x
    where x.organization_id = p_organization_id
    group by x.employee_id
  )
  select
    e.id,
    ssm.state,
    ssm.due_on,
    psi.state,
    psi.due_on,
    case
      when passed.ssm_last_passed_on is null then
        case
          when held.ssm_introduced_on is null then 'none'
          when held.ssm_introduced_in_app_on = held.ssm_introduced_on then 'pending'
          else 'unverified'
        end
      else 'passed'
    end::public.test_state,
    -- The fire-safety hiring test awaits from the workplace record (ADR 024).
    case
      when passed.psi_last_passed_on is null then
        case
          when held.psi_workplace_trained_on is null then 'none'
          when held.psi_workplace_in_app_on = held.psi_workplace_trained_on then 'pending'
          else 'unverified'
        end
      when (passed.psi_last_passed_on + pg_catalog.make_interval(months => 12))::date <= today.day
        then 'annual_due'
      else 'passed'
    end::public.test_state
  from public.employees e
  join public.clients c on c.id = e.client_id
  join public.job_positions p on p.id = e.job_position_id
  left join public.client_fire_safety f on f.client_id = e.client_id
  left join held on held.employee_id = e.id
  left join passed on passed.employee_id = e.id
  cross join (select (pg_catalog.now() at time zone 'Europe/Bucharest')::date as day) as today
  cross join lateral (
    select
      held.ssm_introduced_on is not null or held.ssm_workplace_trained_on is not null
        as ssm_hired,
      held.psi_introduced_on is not null or held.psi_workplace_trained_on is not null
        as psi_hired
  ) as hiring
  cross join lateral (
    select
      case when hiring.ssm_hired then (
        coalesce(held.ssm_last_periodic_on, held.ssm_workplace_trained_on, e.hired_at)
        + pg_catalog.make_interval(months => coalesce(
          p.training_interval_months,
          case p.staff_category
            when 'execution' then c.worker_training_interval_months
            else c.administrative_training_interval_months
          end
        ))
      )::date end as ssm_due_on,
      case when hiring.psi_hired then (
        coalesce(held.psi_last_periodic_on, held.psi_workplace_trained_on, e.hired_at)
        + pg_catalog.make_interval(months => case p.staff_category
          when 'execution' then f.worker_training_interval_months
          else f.administrative_training_interval_months
        end)
      )::date end as psi_due_on
  ) as due
  cross join lateral (
    select
      due.ssm_due_on as due_on,
      case
        when not hiring.ssm_hired then 'untrained'
        when due.ssm_due_on is null then 'current'
        when due.ssm_due_on < today.day then 'overdue'
        when due.ssm_due_on <= today.day + 30 then 'due'
        else 'current'
      end::public.training_state as state
  ) as ssm
  cross join lateral (
    select
      due.psi_due_on as due_on,
      case
        when not hiring.psi_hired then 'untrained'
        when due.psi_due_on is null then 'current'
        when due.psi_due_on < today.day then 'overdue'
        when due.psi_due_on <= today.day + 30 then 'due'
        else 'current'
      end::public.training_state as state
  ) as psi
  where p_organization_id = (select public.current_organization_id())
    and e.organization_id = p_organization_id
    and e.status = 'active'
    and e.archived_at is null
    and c.stage = 'client'
    and c.archived_at is null;
$$;
