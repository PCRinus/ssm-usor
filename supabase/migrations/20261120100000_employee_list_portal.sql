-- The Portal tab filters and sorts on the standing across pages, so it is computed here, the
-- same state the row shows. The columns after signatures_pending_count are new: a replaced view
-- keeps its existing columns in place.
--
-- One standing per employee, in this order: the active participant; else the newest invitation
-- neither accepted nor revoked, open or expired; else the latest revoked participant or
-- invitation. Distinct on both columns the join names, so a client's list reads only that
-- client's participants and invitations, and the organization's list, which neither selects nor
-- filters on the standing, leaves the join out. (A client's list keeps it even unselected: its
-- client filter makes the join on the client a constant, which the planner cannot prove unique.)
create or replace view public.employee_list
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
  coalesce(signatures.pending, 0) as signatures_pending_count,
  coalesce(portal.state, 'none') as portal_state,
  case coalesce(portal.state, 'none')
    when 'active' then 0 when 'invited' then 1 when 'expired' then 2 when 'none' then 3 else 4
  end as portal_rank,
  portal.since as portal_since,
  portal.expires_at as portal_expires_at,
  portal.revoked_at as portal_revoked_at,
  portal.channel as portal_channel,
  portal.address as portal_address,
  portal.language as portal_language,
  portal.participant_id as portal_participant_id,
  portal.invitation_id as portal_invitation_id,
  coalesce(portal.administrator, false) as portal_administrator
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
) signatures on signatures.employee_id = e.id
-- An administrator who is also an employee of the client is that employee's standing too.
left join (
  select distinct on (standing.client_id, standing.employee_id)
    standing.client_id,
    standing.employee_id,
    standing.state,
    standing.since,
    standing.expires_at,
    standing.revoked_at,
    standing.channel,
    standing.address,
    standing.language,
    standing.participant_id,
    standing.invitation_id,
    standing.administrator
  from (
    select
      cp.client_id,
      cp.employee_id,
      case when cp.revoked_at is null then 'active' else 'revoked' end as state,
      case when cp.revoked_at is null then 0 else 2 end as precedence,
      coalesce(cp.revoked_at, cp.created_at) as happened_at,
      cp.created_at as since,
      null::timestamptz as expires_at,
      cp.revoked_at,
      accepted.channel,
      accepted.address,
      cp.language,
      cp.id as participant_id,
      null::uuid as invitation_id,
      cp.kind = 'client_administrator' as administrator
    from public.client_participants cp
    left join public.participant_invitations accepted
      on accepted.participant_id = cp.id
      and accepted.client_id = cp.client_id
      and accepted.accepted_at is not null
    where cp.employee_id is not null
    union all
    select
      pi.client_id,
      pi.employee_id,
      case
        when pi.revoked_at is not null then 'revoked'
        when pi.expires_at <= now() then 'expired'
        else 'invited'
      end,
      case when pi.revoked_at is null then 1 else 2 end,
      coalesce(pi.revoked_at, pi.created_at),
      pi.last_sent_at,
      pi.expires_at,
      pi.revoked_at,
      pi.channel,
      pi.address,
      null,
      null,
      pi.id,
      pi.kind = 'client_administrator'
    from public.participant_invitations pi
    where pi.employee_id is not null and pi.accepted_at is null
  ) standing
  order by standing.client_id, standing.employee_id, standing.precedence, standing.happened_at desc
) portal on portal.client_id = e.client_id and portal.employee_id = e.id;

comment on column public.employee_list.portal_state is
  'The employee''s standing on the portal (ADR 022): active, invited, expired (an invitation neither accepted nor revoked past its expiry), revoked (the latest participant or invitation was revoked, and nothing newer is pending) or none.';
comment on column public.employee_list.portal_rank is
  'The order the Portal tab sorts the standing by: 0 active, 1 invited, 2 expired, 3 none, 4 revoked.';
comment on column public.employee_list.portal_since is
  'When the active or revoked participant was created, or when the pending invitation was last sent.';
comment on column public.employee_list.portal_language is
  'The language the participant chose in the portal; null for an invitation or before a choice.';
comment on column public.employee_list.portal_administrator is
  'The standing is the client administrator''s, held by this employee.';
