-- Repeats the rules of employee_training_due and employee_test_due rather than calling them: once
-- per employee, even as the owner, they took over a second on 21,000 employees (ADR 027,
-- amended). organization_statuses.test.sql holds the two copies to the same rows. The caller
-- check stands in for the policies.
create function public.organization_employee_states(p_organization_id uuid)
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
      max(t.held_on) filter (where t.domain = 'psi' and t.phase = 'periodic') as psi_last_periodic_on,
      max(t.held_on) filter (where t.domain = 'psi' and t.phase = 'workplace') as psi_workplace_trained_on,
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
        case when held.ssm_introduced_on is null then 'none' else 'pending' end
      else 'passed'
    end::public.test_state,
    -- The fire-safety hiring test awaits from the workplace record (ADR 024).
    case
      when passed.psi_last_passed_on is null then
        case when held.psi_workplace_trained_on is null then 'none' else 'pending' end
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

comment on function public.organization_employee_states(uuid) is
  'The training state and due date (ADR 021) and the test state (ADR 024) in each domain of every current employee of the organization''s active clients, by the rules of employee_training_due and employee_test_due. Nothing for an organization other than the caller''s.';

revoke all on function public.organization_employee_states(uuid) from public, anon;
grant execute on function public.organization_employee_states(uuid) to authenticated, service_role;

-- Employees rather than states, so that PostgREST embeds, filters, sorts and pages the result as
-- it does the table. Without a domain, "current" and "passed" mean in both domains and every
-- other state in either, as the client employee list filters.
create function public.organization_employees_in_state(
  p_organization_id uuid,
  p_training_state public.training_state default null,
  p_test_state public.test_state default null,
  p_domain public.training_domain default null
)
returns setof public.employees
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
  from public.organization_employee_states(p_organization_id) s
  join public.employees e on e.id = s.employee_id
  where (p_training_state is null or case
      when p_domain = 'ssm' then s.ssm_training_state = p_training_state
      when p_domain = 'psi' then s.psi_training_state = p_training_state
      when p_training_state = 'current' then
        s.ssm_training_state = 'current' and s.psi_training_state = 'current'
      else p_training_state in (s.ssm_training_state, s.psi_training_state)
    end)
    and (p_test_state is null or case
      when p_domain = 'ssm' then s.ssm_test_state = p_test_state
      when p_domain = 'psi' then s.psi_test_state = p_test_state
      when p_test_state = 'passed' then s.ssm_test_state = 'passed' and s.psi_test_state = 'passed'
      else p_test_state in (s.ssm_test_state, s.psi_test_state)
    end);
$$;

comment on function public.organization_employees_in_state(
  uuid, public.training_state, public.test_state, public.training_domain
) is
  'The current employees of the organization''s active clients in the training state, the test state or both, in one domain or, without one, in the sense of the employee lists. Nothing for an organization other than the caller''s.';

revoke all on function public.organization_employees_in_state(
  uuid, public.training_state, public.test_state, public.training_domain
) from public, anon;
grant execute on function public.organization_employees_in_state(
  uuid, public.training_state, public.test_state, public.training_domain
) to authenticated, service_role;

create or replace view public.dashboard_summary
with (security_invoker = true)
as
select
  o.id as organization_id,
  coalesce(staff.ssm_overdue, 0) as ssm_overdue,
  coalesce(staff.ssm_due, 0) as ssm_due,
  coalesce(staff.ssm_untrained, 0) as ssm_untrained,
  coalesce(staff.ssm_current, 0) as ssm_current,
  coalesce(staff.psi_overdue, 0) as psi_overdue,
  coalesce(staff.psi_due, 0) as psi_due,
  coalesce(staff.psi_untrained, 0) as psi_untrained,
  coalesce(staff.psi_current, 0) as psi_current,
  coalesce(staff.employees, 0) as employees,
  staff.next_due_on,
  coalesce(staff.next_due_count, 0) as next_due_count,
  coalesce(staff.tests_pending, 0) as tests_pending,
  coalesce(drafts.to_issue, 0) as drafts_to_issue,
  coalesce(behind.documents, 0) as documents_behind,
  coalesce(gaps.clients, 0) as clients_missing_data,
  coalesce(trainees.pending, 0) as employee_signatures_pending,
  trainees.oldest_issued_at as employee_signatures_oldest_issued_at,
  coalesce(portfolio.active_clients, 0) as active_clients,
  coalesce(received.copies, 0) as contracts_received_to_confirm,
  coalesce(ending.contracts, 0) as contracts_ending_within_60_days
from public.organizations o
cross join (select (pg_catalog.now() at time zone 'Europe/Bucharest')::date as day) as today
-- The employees the list counts: current, of active clients, so that a count and the list it
-- links to agree.
left join lateral (
  with standing as (
    select * from public.organization_employee_states(o.id)
  ),
  next_due as (
    select due.due_on, count(distinct st.employee_id)::integer as employees
    from standing st
    cross join lateral (
      values
        (st.ssm_training_state, st.ssm_training_due_on),
        (st.psi_training_state, st.psi_training_due_on)
    ) as due (state, due_on)
    where due.state in ('current', 'due') and due.due_on is not null
    group by due.due_on
    order by due.due_on
    limit 1
  )
  select
    (count(*) filter (where ssm_training_state = 'overdue'))::integer as ssm_overdue,
    (count(*) filter (where ssm_training_state = 'due'))::integer as ssm_due,
    (count(*) filter (where ssm_training_state = 'untrained'))::integer as ssm_untrained,
    (count(*) filter (where ssm_training_state = 'current'))::integer as ssm_current,
    (count(*) filter (where psi_training_state = 'overdue'))::integer as psi_overdue,
    (count(*) filter (where psi_training_state = 'due'))::integer as psi_due,
    (count(*) filter (where psi_training_state = 'untrained'))::integer as psi_untrained,
    (count(*) filter (where psi_training_state = 'current'))::integer as psi_current,
    count(*)::integer as employees,
    (select due_on from next_due) as next_due_on,
    (select employees from next_due) as next_due_count,
    (count(*) filter (where ssm_test_state = 'pending' or psi_test_state = 'pending'))::integer
      as tests_pending
  from standing
) as staff on true
-- An earlier year's draft of a dated type is not waiting to be issued.
left join lateral (
  select count(*)::integer as to_issue
  from public.client_documents d
  join public.clients c on c.id = d.client_id
  join lateral (
    select r.status
    from public.document_revisions r
    where r.document_id = d.id
    order by r.revision desc
    limit 1
  ) as newest on true
  where d.organization_id = o.id
    and d.document_group <> 'other'
    and c.stage = 'client'
    and c.archived_at is null
    and newest.status = 'draft'
    and (d.period is null or d.period = (
      select max(same_type.period)
      from public.client_documents same_type
      where same_type.client_id = d.client_id and same_type.type_key = d.type_key
    ))
) as drafts on true
left join lateral (
  select count(*)::integer as documents
  from public.documents_behind b
  where b.organization_id = o.id
) as behind on true
left join lateral (
  select count(*)::integer as clients
  from public.clients_missing_basic_data m
  where m.organization_id = o.id
) as gaps on true
left join lateral (
  select count(*)::integer as pending, min(r.issued_at) as oldest_issued_at
  from public.signature_requests r
  join public.clients c on c.id = r.client_id
  where r.organization_id = o.id
    and r.slot = 'trainee'
    and r.state = 'pending'
    and c.stage = 'client'
    and c.archived_at is null
) as trainees on true
left join lateral (
  select count(*)::integer as active_clients
  from public.clients c
  where c.organization_id = o.id and c.stage = 'client' and c.archived_at is null
) as portfolio on true
-- The copy of the revision in force: a correction drafted beside it leaves the contract
-- received, as the clients list shows it. Leads count: a copy mostly comes back before the
-- lead is promoted, and the owner who sees this row is the one who promotes it.
left join lateral (
  select count(*)::integer as copies
  from public.document_signed_copies sc
  join public.document_revisions r on r.id = sc.revision_id
  join public.client_documents d on d.id = sc.document_id
  join public.clients c on c.id = d.client_id
  where sc.organization_id = o.id
    and sc.source = 'client'
    and sc.confirmed_at is null
    and r.status = 'issued'
    and d.type_key = 'service_contract'
    and c.archived_at is null
) as received on true
-- A contract that renews by itself never ends, so it is nothing to act on (ADR 027).
left join lateral (
  select count(*)::integer as contracts
  from public.service_contracts sc
  join public.clients c on c.id = sc.client_id
  cross join lateral (
    select (sc.start_date + pg_catalog.make_interval(months => sc.duration_months))::date - 1 as end_date
  ) as term
  where sc.organization_id = o.id
    and not sc.renews_automatically
    and c.stage = 'client'
    and c.archived_at is null
    and term.end_date between today.day and today.day + 60
) as ending on true;
