-- The acknowledgement sheets of the SSM duties (ADR 046): each record is one sheet a current or
-- former employee signed, against one issued revision of document 13. Records are never changed;
-- a mistaken one is deleted, and the newest left is the one the status is read from.
--
-- The post is kept by id and printed name, without a foreign key: a post may be deleted once
-- nobody holds it, and the sheet signed on it stays.
create table public.employee_duty_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  employee_id uuid not null,
  revision_id uuid not null,
  job_position_id uuid not null,
  position_name text not null,
  annex_number integer not null
    constraint employee_duty_acknowledgements_annex_number_positive check (annex_number > 0),
  annex_fingerprint text not null
    constraint employee_duty_acknowledgements_annex_fingerprint_present
    check (annex_fingerprint <> ''),
  roles jsonb not null default '[]'::jsonb
    constraint employee_duty_acknowledgements_roles_array check (jsonb_typeof(roles) = 'array'),
  -- The signing agreement's values; signing in the portal adds signed_electronically.
  state text not null default 'signed_on_paper'
    constraint employee_duty_acknowledgements_state_valid check (state in ('signed_on_paper')),
  signed_at timestamptz not null,
  client_file_id uuid,
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint employee_duty_acknowledgements_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint employee_duty_acknowledgements_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete cascade,
  constraint employee_duty_acknowledgements_revision_in_organization
    foreign key (revision_id, organization_id) references public.document_revisions (id, organization_id)
    on delete cascade,
  constraint employee_duty_acknowledgements_scan_of_client
    foreign key (client_file_id, client_id) references public.client_files (id, client_id)
    on delete set null (client_file_id)
);

create index employee_duty_acknowledgements_employee_idx
  on public.employee_duty_acknowledgements (employee_id, recorded_at desc, id desc);
create index employee_duty_acknowledgements_client_id_idx
  on public.employee_duty_acknowledgements (client_id);
create index employee_duty_acknowledgements_organization_id_idx
  on public.employee_duty_acknowledgements (organization_id);
create index employee_duty_acknowledgements_revision_id_idx
  on public.employee_duty_acknowledgements (revision_id, organization_id);
create index employee_duty_acknowledgements_client_file_id_idx
  on public.employee_duty_acknowledgements (client_file_id, client_id)
  where client_file_id is not null;
create index employee_duty_acknowledgements_recorded_by_idx
  on public.employee_duty_acknowledgements (recorded_by)
  where recorded_by is not null;

comment on table public.employee_duty_acknowledgements is
  'The acknowledgement sheets of SSM duties an employee signed, each against one issued revision of document 13, with the annex''s and the roles'' fingerprints signed (ADR 046).';
comment on column public.employee_duty_acknowledgements.roles is
  'The roles the employee held in that revision with their fingerprints, [{ "role", "fingerprint" }] ordered by role, as employee_duty_acknowledgement_states.roles reads them.';

-- Who recorded it and when are the database's, from the member signed in and the clock.
create function public.stamp_duty_acknowledgement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.recorded_by := (select auth.uid());
  -- Not now(), the transaction's start, which ties records made in one transaction.
  new.recorded_at := clock_timestamp();
  return new;
end;
$$;

create trigger employee_duty_acknowledgements_stamp
  before insert on public.employee_duty_acknowledgements
  for each row execute function public.stamp_duty_acknowledgement();

create trigger employee_duty_acknowledgements_protect_archived_client
  before insert or update or delete on public.employee_duty_acknowledgements
  for each row execute function public.protect_rows_of_archived_client();

alter table public.employee_duty_acknowledgements enable row level security;
revoke all on table public.employee_duty_acknowledgements from anon;
revoke update on table public.employee_duty_acknowledgements from authenticated;

create policy "members read their duty acknowledgements"
  on public.employee_duty_acknowledgements for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members record duty acknowledgements for their active clients"
  on public.employee_duty_acknowledgements for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
    )
  );

create policy "members remove their duty acknowledgements"
  on public.employee_duty_acknowledgements for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

-- Each employee against the latest issued revision of their client's document 13: a draft does
-- not count, and neither does a file uploaded in its place, which records no fingerprints. The
-- roles an employee holds are the role blocks of their post's annex whose employeeIds name them;
-- a revision issued before the snapshot kept them names nobody. The annexes of a revision are
-- read once per client rather than once per employee, since its snapshot is large.
create view public.employee_duty_acknowledgement_states
with (security_invoker = true)
as
select
  e.id as employee_id,
  e.organization_id,
  e.client_id,
  issued.document_id,
  issued.revision_id,
  issued.issue_date,
  annex.annex_number,
  annex.position_name,
  annex.fingerprint as annex_fingerprint,
  held.roles,
  latest.id as record_id,
  case
    when issued.revision_id is null then 'not_issued'
    when annex.fingerprint is null then 'no_annex'
    when latest.id is null then 'to_sign'
    when latest.annex_fingerprint = annex.fingerprint and latest.roles = held.roles then 'signed'
    else 'sign_again'
  end as state,
  coalesce(latest.annex_fingerprint <> annex.fingerprint, false) as annex_changed,
  coalesce(latest.roles <> held.roles and annex.fingerprint is not null, false) as roles_changed
from public.employees e
left join (
  select d.client_id, d.id as document_id, r.id as revision_id, g.issue_date
  from public.client_documents d
  join public.document_revisions r on r.document_id = d.id and r.status = 'issued'
  join public.document_generations g on g.id = r.generation_id
  where d.type_key = 'ssm_duties' and r.duty_fingerprints is not null
) issued on issued.client_id = e.client_id
left join (
  select
    d.client_id,
    (printed.annex ->> 'positionId')::uuid as position_id,
    (printed.annex ->> 'number')::integer as annex_number,
    printed.annex ->> 'position' as position_name,
    fingerprinted.annex ->> 'fingerprint' as fingerprint,
    r.duty_fingerprints -> 'roles' as role_fingerprints,
    jsonb_build_object(
      'workplace_manager', coalesce(printed.annex -> 'workplaceManagerDuties' -> 'employeeIds', '[]'::jsonb),
      'first_aid', coalesce(printed.annex -> 'firstAidDuties' -> 'employeeIds', '[]'::jsonb),
      'imminent_danger', coalesce(printed.annex -> 'imminentDangerDuties' -> 'employeeIds', '[]'::jsonb),
      'workers_representative',
        coalesce(printed.annex -> 'workersRepresentativeDuties' -> 'employeeIds', '[]'::jsonb)
    ) as holders
  from public.client_documents d
  join public.document_revisions r on r.document_id = d.id and r.status = 'issued'
  join public.document_generations g on g.id = r.generation_id
  cross join lateral jsonb_array_elements(r.duty_fingerprints -> 'annexes') as fingerprinted (annex)
  join lateral jsonb_array_elements(r.data_snapshot -> 'dutyAnnexes') as printed (annex)
    on printed.annex ->> 'positionId' = fingerprinted.annex ->> 'positionId'
  where d.type_key = 'ssm_duties' and r.duty_fingerprints is not null
) annex on annex.client_id = e.client_id and annex.position_id = e.job_position_id
cross join lateral (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('role', role.fingerprint ->> 'role', 'fingerprint', role.fingerprint ->> 'fingerprint')
      order by role.fingerprint ->> 'role'
    ),
    '[]'::jsonb
  ) as roles
  from jsonb_array_elements(annex.role_fingerprints) as role (fingerprint)
  where annex.holders -> (role.fingerprint ->> 'role') ? e.id::text
) held
left join lateral (
  select a.id, a.annex_fingerprint, a.roles
  from public.employee_duty_acknowledgements a
  where a.employee_id = e.id
  order by a.recorded_at desc, a.id desc
  limit 1
) latest on true;

comment on view public.employee_duty_acknowledgement_states is
  'Each employee''s acknowledgement of their SSM duties against the latest issued document 13 (ADR 046): not_issued, no_annex, to_sign, signed or sign_again, with what the current sheet prints and the newest record.';

grant select on public.employee_duty_acknowledgement_states to authenticated;
revoke all on public.employee_duty_acknowledgement_states from anon;

-- The workers lists filter on the state across pages, so it is a column of the list; a former
-- employee has none. The new column is last: a replaced view keeps its existing columns in place.
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
  coalesce(portal.administrator, false) as portal_administrator,
  case when e.status <> 'terminated' then duties.state end as duties_acknowledgement_state
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
) portal on portal.client_id = e.client_id and portal.employee_id = e.id
-- One row per employee already; grouped so that the planner can drop the join where the state is
-- not read, and joined on the client too, so that a client's list computes the states of its own
-- employees, reading the revision's snapshot once, rather than those of the whole organization.
left join (
  select st.employee_id, st.client_id, min(st.state) as state
  from public.employee_duty_acknowledgement_states st
  group by st.employee_id, st.client_id
) duties on duties.employee_id = e.id and duties.client_id = e.client_id;

comment on column public.employee_list.duties_acknowledgement_state is
  'A current employee''s acknowledgement of their SSM duties (ADR 046), as employee_duty_acknowledgement_states reads it; null for a former employee.';
