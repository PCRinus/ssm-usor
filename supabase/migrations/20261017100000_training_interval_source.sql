-- One employee's standing in one domain (ADR 021): the interval runs from the last periodic
-- record, else the workplace training record, else the hire date; a supplementary training never
-- moves it. No due date before a hiring training is recorded: the hire date plus the interval
-- names a day long past for an employee hired years ago, which reads as nonsense. A null
-- interval, undecided or not applicable, leaves no due date and the state current. Days are
-- Romanian days, as the documents date them.
--
-- No search_path setting, and every name qualified instead: a function with one is never
-- inlined, and the employee lists read this once per row.
create or replace function public.employee_training_due(
  p_employee_id uuid,
  p_hired_at date,
  p_status public.employee_status,
  p_domain public.training_domain,
  p_interval_months integer
)
returns table (
  last_periodic_on date,
  workplace_trained_on date,
  has_hiring_training boolean,
  due_on date,
  state public.training_state
)
language sql
stable
as $$
  select
    held.last_periodic_on,
    held.workplace_trained_on,
    held.has_hiring_training,
    due.due_on,
    case
      when p_status = 'terminated' then null
      when not held.has_hiring_training then 'untrained'
      when due.due_on is null then 'current'
      when due.due_on < today.day then 'overdue'
      when due.due_on <= today.day + 30 then 'due'
      else 'current'
    end::public.training_state
  from (
    select
      max(t.held_on) filter (where t.phase = 'periodic') as last_periodic_on,
      max(t.held_on) filter (where t.phase = 'workplace') as workplace_trained_on,
      coalesce(bool_or(t.phase in ('introductory_general', 'workplace')), false) as has_hiring_training
    from public.training_records r
    join public.trainings t on t.id = r.training_id
    where r.employee_id = p_employee_id and t.domain = p_domain
  ) as held
  cross join lateral (
    select case when held.has_hiring_training then (
      coalesce(held.last_periodic_on, held.workplace_trained_on, p_hired_at)
      + pg_catalog.make_interval(months => p_interval_months)
    )::date end as due_on
  ) as due
  cross join (select (pg_catalog.now() at time zone 'Europe/Bucharest')::date as day) as today;
$$;

-- The interval columns come last: a replaced view keeps its existing columns in place.
create or replace view public.employee_training_status
with (security_invoker = true)
as
select
  e.id as employee_id,
  e.client_id,
  e.organization_id,
  ssm.last_periodic_on as ssm_last_periodic_on,
  ssm.workplace_trained_on as ssm_workplace_trained_on,
  ssm.has_hiring_training as ssm_has_hiring_training,
  ssm.due_on as ssm_due_on,
  ssm.state as ssm_state,
  psi.last_periodic_on as psi_last_periodic_on,
  psi.workplace_trained_on as psi_workplace_trained_on,
  psi.has_hiring_training as psi_has_hiring_training,
  psi.due_on as psi_due_on,
  psi.state as psi_state,
  coalesce(p.training_interval_months, programme.ssm_months) as ssm_interval_months,
  case
    when p.training_interval_months is not null then 'position'
    when programme.ssm_months is not null then 'client'
  end as ssm_interval_source,
  programme.psi_months as psi_interval_months,
  case when programme.psi_months is not null then 'client' end as psi_interval_source
from public.employees e
join public.job_positions p on p.id = e.job_position_id
join public.clients c on c.id = e.client_id
left join public.client_fire_safety f on f.client_id = e.client_id
cross join lateral (
  select
    case p.staff_category
      when 'execution' then c.worker_training_interval_months
      else c.administrative_training_interval_months
    end as ssm_months,
    -- A position cannot override the fire-safety interval (#371).
    case p.staff_category
      when 'execution' then f.worker_training_interval_months
      else f.administrative_training_interval_months
    end as psi_months
) as programme
cross join lateral public.employee_training_due(
  e.id, e.hired_at, e.status, 'ssm',
  coalesce(p.training_interval_months, programme.ssm_months)
) as ssm
cross join lateral public.employee_training_due(
  e.id, e.hired_at, e.status, 'psi', programme.psi_months
) as psi;

comment on view public.employee_training_status is
  'Per employee and domain: the last periodic training, the workplace training, the next training due, the training state and the interval with its source, position or client (ADR 021). Null states for a leaver; no due date before a hiring training.';
