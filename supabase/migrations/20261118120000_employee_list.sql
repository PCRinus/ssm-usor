-- Both workers lists search, filter and sort over every employee in scope, so what they filter
-- on is computed here, once per query. The states and the pending signatures are each a grouped
-- join on the employee, so a query that neither selects nor filters on them leaves them out.
-- The page's full training and test statuses are still read for its rows only.
create view public.employee_list
with (security_invoker = true)
as
select
  e.id,
  e.organization_id,
  e.client_id,
  e.last_name,
  e.first_name,
  e.employee_number,
  e.email,
  e.phone,
  e.job_title,
  e.job_position_id,
  e.workplace_id,
  e.hired_at,
  e.status,
  e.terminated_at,
  e.created_at,
  e.updated_at,
  e.archived_at,
  lower(public.unaccent_immutable(e.last_name || ' ' || e.first_name)) as search_name,
  p.name as job_position_name,
  w.name as workplace_name,
  c.legal_name as client_name,
  c.stage as client_stage,
  c.archived_at as client_archived_at,
  s.ssm_training_state,
  s.ssm_training_due_on,
  s.ssm_training_rank,
  s.su_training_state,
  s.su_training_due_on,
  s.su_training_rank,
  s.ssm_test_state,
  s.su_test_state,
  coalesce(signatures.pending, 0) as signatures_pending_count
from public.employees e
join public.job_positions p on p.id = e.job_position_id
join public.clients c on c.id = e.client_id
left join public.client_workplaces w on w.id = e.workplace_id
-- One row per employee already; grouped only so that the planner can drop the join.
left join (
  select
    st.employee_id,
    min(st.ssm_training_state) as ssm_training_state,
    min(st.ssm_training_due_on) as ssm_training_due_on,
    min(case st.ssm_training_state
      when 'overdue' then 0 when 'untrained' then 1 when 'due' then 2 else 3
    end) as ssm_training_rank,
    min(st.su_training_state) as su_training_state,
    min(st.su_training_due_on) as su_training_due_on,
    min(case st.su_training_state
      when 'overdue' then 0 when 'untrained' then 1 when 'due' then 2 else 3
    end) as su_training_rank,
    min(st.ssm_test_state) as ssm_test_state,
    min(st.su_test_state) as su_test_state
  from public.organization_employee_states((select public.current_organization_id())) st
  group by st.employee_id
) s on s.employee_id = e.id
-- A trainee signs a training record or a test sheet; either belongs to one employee.
left join (
  select coalesce(tr.employee_id, ts.employee_id) as employee_id, count(*)::integer as pending
  from public.signature_requests r
  left join public.training_records tr on tr.id = r.training_record_id
  left join public.test_sheets ts on ts.id = r.test_sheet_id
  where r.slot = 'trainee' and r.state = 'pending'
  group by coalesce(tr.employee_id, ts.employee_id)
) signatures on signatures.employee_id = e.id;

comment on view public.employee_list is
  'Every employee with what the workers lists show, search, filter and sort on. The states are those of organization_employee_states: null for a leaver, an archived employee and an employee of a lead or an archived client.';
comment on column public.employee_list.search_name is
  'Last and first name, lowercase and without diacritics, as employee_search_name; the CNP is never searched.';
comment on column public.employee_list.ssm_training_rank is
  'The order the list sorts the occupational safety training by: 0 overdue, 1 untrained, 2 due within 30 days, 3 current; null without a state.';
comment on column public.employee_list.su_training_rank is
  'The order the list sorts the fire-safety training by: 0 overdue, 1 untrained, 2 due within 30 days, 3 current; null without a state.';
comment on column public.employee_list.signatures_pending_count is
  'The trainee signatures the employee has still to give, for training records and test sheets alike.';

revoke all on table public.employee_list from anon, authenticated;
grant select on table public.employee_list to authenticated, service_role;
