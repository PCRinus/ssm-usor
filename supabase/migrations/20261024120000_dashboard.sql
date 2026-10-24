-- Every source is read as the caller: a specialist's row counts no contract and no received
-- copy, since the policies on those tables keep them from specialists.

-- The codes are the full check's (missingDocumentData), so the app words them the same way.
create view public.clients_missing_basic_data
with (security_invoker = true)
as
select
  c.organization_id,
  c.id as client_id,
  c.legal_name as client_name,
  gaps.missing
from public.clients c
cross join lateral (
  select array_agg(role.role) as held
  from public.client_responsible_persons p
  cross join lateral unnest(p.roles) as role(role)
  where p.client_id = c.id and p.archived_at is null
) as responsible
cross join lateral (
  select
    count(*) as positions,
    coalesce(bool_or(p.needs_protective_equipment is null), false) as equipment_undecided,
    coalesce(bool_or(p.needs_instructions is null), false) as instructions_undecided,
    coalesce(bool_or(p.needs_fire_instructions is null), false) as fire_instructions_undecided
  from public.job_positions p
  where p.client_id = c.id and p.archived_at is null
) as positions
cross join lateral (
  select array_remove(array[
    case when coalesce(btrim(c.legal_representative_name), '') = '' then 'client.representativeName' end,
    case when coalesce(btrim(c.legal_representative_role), '') = '' then 'client.representativeRole' end,
    case when not coalesce('workplace_manager' = any (responsible.held), false) then 'responsible.workplace_manager' end,
    case when not coalesce('first_aid' = any (responsible.held), false) then 'responsible.first_aid' end,
    case when not coalesce('risk_evaluation_team' = any (responsible.held), false) then 'responsible.risk_evaluation_team' end,
    case when not coalesce('imminent_danger' = any (responsible.held), false) then 'responsible.imminent_danger' end,
    case when not coalesce('fire_safety_coordinator' = any (responsible.held), false) then 'responsible.fire_safety_coordinator' end,
    case when not coalesce('fire_intervention_leader' = any (responsible.held), false) then 'responsible.fire_intervention_leader' end,
    case when positions.positions = 0 then 'positions.any' end,
    case when positions.equipment_undecided then 'positions.equipment' end,
    case when positions.instructions_undecided then 'positions.instructions' end,
    case when positions.fire_instructions_undecided then 'fire.instructions' end
  ], null) as missing
) as gaps
where c.stage = 'client'
  and c.archived_at is null
  and cardinality(gaps.missing) > 0;

comment on view public.clients_missing_basic_data is
  'Active clients that fail the basic part of the readiness check (ADR 027): the legal representative, the responsible persons, the job positions and their undecided answers. A client absent here may still miss what the full check asks.';
comment on column public.clients_missing_basic_data.missing is
  'Codes of the full readiness check (missingDocumentData), in its order: client.representativeName, client.representativeRole, responsible.<role>, positions.any, positions.equipment, positions.instructions, fire.instructions.';

revoke all on table public.clients_missing_basic_data from anon, authenticated;
grant select on table public.clients_missing_basic_data to authenticated, service_role;

create view public.dashboard_summary
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
  coalesce(tests.pending, 0) as tests_pending,
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
    select s.employee_id, s.ssm_state, s.ssm_due_on, s.psi_state, s.psi_due_on
    from public.employee_training_status s
    join public.employees e on e.id = s.employee_id
    join public.clients c on c.id = s.client_id
    where s.organization_id = o.id
      and e.status = 'active'
      and e.archived_at is null
      and c.stage = 'client'
      and c.archived_at is null
  ),
  next_due as (
    select due.due_on, count(distinct st.employee_id)::integer as employees
    from standing st
    cross join lateral (
      values (st.ssm_state, st.ssm_due_on), (st.psi_state, st.psi_due_on)
    ) as due (state, due_on)
    where due.state in ('current', 'due') and due.due_on is not null
    group by due.due_on
    order by due.due_on
    limit 1
  )
  select
    (count(*) filter (where ssm_state = 'overdue'))::integer as ssm_overdue,
    (count(*) filter (where ssm_state = 'due'))::integer as ssm_due,
    (count(*) filter (where ssm_state = 'untrained'))::integer as ssm_untrained,
    (count(*) filter (where ssm_state = 'current'))::integer as ssm_current,
    (count(*) filter (where psi_state = 'overdue'))::integer as psi_overdue,
    (count(*) filter (where psi_state = 'due'))::integer as psi_due,
    (count(*) filter (where psi_state = 'untrained'))::integer as psi_untrained,
    (count(*) filter (where psi_state = 'current'))::integer as psi_current,
    count(*)::integer as employees,
    (select due_on from next_due) as next_due_on,
    (select employees from next_due) as next_due_count
  from standing
) as staff on true
left join lateral (
  select count(*)::integer as pending
  from public.employee_test_status s
  join public.employees e on e.id = s.employee_id
  join public.clients c on c.id = s.client_id
  where s.organization_id = o.id
    and e.status = 'active'
    and e.archived_at is null
    and c.stage = 'client'
    and c.archived_at is null
    and (s.ssm_state = 'pending' or s.psi_state = 'pending')
) as tests on true
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
-- received, as the clients list shows it.
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
    and c.stage = 'client'
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

comment on view public.dashboard_summary is
  'One row per organization the caller can read, with the dashboard''s counts (ADR 027). Employees are the current ones of active clients; a count over a table the caller may not read is zero.';
comment on column public.dashboard_summary.next_due_on is
  'The nearest training due date in either domain among employees current or due; null when none has one.';
comment on column public.dashboard_summary.next_due_count is
  'How many employees have a training due on next_due_on, in either domain.';
comment on column public.dashboard_summary.employee_signatures_pending is
  'Pending trainee slots, of training records and test sheets, on active clients.';
comment on column public.dashboard_summary.contracts_received_to_confirm is
  'Signed copies of the issued service contract received through the return link and not yet confirmed, on active clients.';
comment on column public.dashboard_summary.contracts_ending_within_60_days is
  'Service contracts of active clients that do not renew by themselves and end between today and 60 days from now, in Bucharest.';

revoke all on table public.dashboard_summary from anon, authenticated;
grant select on table public.dashboard_summary to authenticated, service_role;

-- No history is stored: each month end is rebuilt from the employment dates, which say when
-- someone worked there rather than when the provider typed them in. The current month counts up
-- to today. Only clients active today count, whatever they were then.
create function public.dashboard_employees_at_month_ends(p_organization_id uuid)
returns table (month date, employees integer)
language sql
stable
as $$
  with today as (
    select (pg_catalog.now() at time zone 'Europe/Bucharest')::date as day
  ),
  months as (
    select
      m.month::date as month,
      least((m.month + interval '1 month')::date - 1, today.day) as counted_on
    from today
    cross join lateral pg_catalog.generate_series(
      pg_catalog.date_trunc('month', today.day) - interval '11 months',
      pg_catalog.date_trunc('month', today.day),
      interval '1 month'
    ) as m (month)
  )
  select
    months.month,
    (
      select count(*)::integer
      from public.employees e
      join public.clients c on c.id = e.client_id
      where e.organization_id = p_organization_id
        and e.archived_at is null
        and c.stage = 'client'
        and c.archived_at is null
        and e.hired_at <= months.counted_on
        and (e.terminated_at is null or e.terminated_at > months.counted_on)
    ) as employees
  from months
  order by months.month;
$$;

comment on function public.dashboard_employees_at_month_ends(uuid) is
  'The employees of the organization''s active clients at the end of each of the last twelve months, the current one up to today, oldest first (ADR 027).';

revoke all on function public.dashboard_employees_at_month_ends(uuid) from public, anon;
grant execute on function public.dashboard_employees_at_month_ends(uuid) to authenticated, service_role;
