-- The clients list searches, filters and sorts over every client of the organization, so what
-- it filters on is computed here, once per query, rather than in the API for one page.

-- Declared in the order the list sorts them: least done first.
create type public.documentation_state as enum ('none', 'in_progress', 'issued');

-- The built-in documents of each set and when one applies, as documentSetTypeKeys,
-- fireSafetyTypeKeysFromTenEmployees and documentApplies say; a test holds the two together.
-- From ten employees: the workers' representative decision (requiredWorkersRepresentatives) and
-- the fire-safety documents of ADR 020. With participants: the signing annex of ADR 023.
-- No search_path setting: a function with one is never inlined, and the list reads this per client.
create function public.built_in_document_types()
returns table (document_group public.document_group, type_key text, applies_when text)
language sql
immutable
parallel safe
as $$
  values
    ('documentation_set'::public.document_group, 'cover_decisions', 'always'),
    ('documentation_set', 'decision_training', 'always'),
    ('documentation_set', 'decision_risk_evaluation_team', 'always'),
    ('documentation_set', 'decision_first_aid', 'always'),
    ('documentation_set', 'decision_imminent_danger', 'always'),
    ('documentation_set', 'decision_workers_representative', 'from_ten_employees'),
    ('documentation_set', 'cover_general_training_material', 'always'),
    ('documentation_set', 'general_training_material', 'always'),
    ('documentation_set', 'cover_own_instructions', 'always'),
    ('documentation_set', 'own_instructions', 'always'),
    ('documentation_set', 'cover_training_themes', 'always'),
    ('documentation_set', 'training_themes', 'always'),
    ('documentation_set', 'cover_tests', 'always'),
    ('documentation_set', 'test_hiring', 'always'),
    ('documentation_set', 'protective_equipment_list', 'always'),
    ('documentation_set', 'cover_event_registers', 'always'),
    ('documentation_set', 'event_registers', 'always'),
    ('documentation_set', 'control_report', 'always'),
    ('documentation_set', 'risk_assessment', 'always'),
    ('documentation_set', 'prevention_plan', 'always'),
    ('documentation_set', 'cover_employer_briefing', 'always'),
    ('documentation_set', 'employer_briefing', 'always'),
    ('documentation_set', 'control_regulation', 'always'),
    ('documentation_set', 'signing_regulation_annex', 'with_participants'),
    ('fire_safety_set', 'fire_cover_decisions', 'always'),
    ('fire_safety_set', 'fire_decision_organization', 'always'),
    ('fire_safety_set', 'fire_decision_training', 'always'),
    ('fire_safety_set', 'fire_decision_open_fire', 'always'),
    ('fire_safety_set', 'fire_decision_smoking', 'always'),
    ('fire_safety_set', 'fire_decision_technician', 'always'),
    ('fire_safety_set', 'fire_decision_instructions', 'always'),
    ('fire_safety_set', 'fire_decision_waste', 'always'),
    ('fire_safety_set', 'fire_decision_seasons', 'from_ten_employees'),
    ('fire_safety_set', 'fire_decision_control', 'from_ten_employees'),
    ('fire_safety_set', 'fire_cover_own_instructions', 'always'),
    ('fire_safety_set', 'fire_own_instructions', 'always'),
    ('fire_safety_set', 'fire_cover_training_themes', 'always'),
    ('fire_safety_set', 'fire_training_themes', 'always'),
    ('fire_safety_set', 'fire_cover_tests', 'always'),
    ('fire_safety_set', 'fire_test_hiring', 'always'),
    ('fire_safety_set', 'fire_test_annual', 'always'),
    ('fire_safety_set', 'fire_means_list', 'always'),
    ('fire_safety_set', 'fire_workplace_organization', 'always'),
    ('fire_safety_set', 'fire_substances_list', 'always'),
    ('fire_safety_set', 'fire_maintenance_schedules', 'from_ten_employees'),
    ('fire_safety_set', 'fire_cover_registers', 'always'),
    ('fire_safety_set', 'fire_registers', 'always'),
    ('fire_safety_set', 'fire_work_permit', 'always'),
    ('fire_safety_set', 'fire_installation_register', 'from_ten_employees'),
    ('fire_safety_set', 'fire_extinguisher_register', 'always'),
    ('fire_safety_set', 'fire_site_sheet', 'from_ten_employees'),
    ('fire_safety_set', 'fire_annual_report', 'from_ten_employees')
$$;

comment on function public.built_in_document_types() is
  'The built-in documents of the two documentation sets and when each applies: always, from ten current employees, or for a client with participants.';

-- No search_path setting: only the inlined expression matches the index below.
create function public.client_search_text(public.clients)
returns text
language sql
immutable
parallel safe
as $$
  select lower(public.unaccent_immutable($1.legal_name || ' ' || $1.cui || ' ' || coalesce($1.locality, '')));
$$;

comment on function public.client_search_text(public.clients) is
  'The legal name, the CUI and the locality, lowercase and without diacritics, as the clients list search matches them.';

create index clients_search_text_idx on public.clients
  using gin (lower(public.unaccent_immutable(legal_name || ' ' || cui || ' ' || coalesce(locality, ''))) extensions.gin_trgm_ops);

-- The columns after fire_safety_last_generated_at are new: a replaced view keeps its existing
-- columns in place. Each filter of the list reads a grouped join of its own, so a query that
-- neither selects nor filters on it leaves the join out, documents_behind's above all.
create or replace view public.client_list
with (security_invoker = true)
as
select
  c.id,
  c.legal_name,
  c.cui,
  c.vat_payer,
  c.caen_code,
  c.trade_register_number,
  c.county_code,
  c.locality,
  c.address_line,
  c.legal_representative_name,
  c.declared_employee_count,
  c.stage,
  c.contact_name,
  c.contact_email,
  c.contact_phone,
  c.promoted_at,
  c.created_at,
  c.updated_at,
  c.archived_at,
  coalesce(c.promoted_at, c.created_at) as client_since,
  coalesce(e.employee_count, 0) as current_employee_count,
  coalesce(d.generated_type_keys, '{}') as documentation_generated_type_keys,
  coalesce(d.issued_count, 0) as documentation_issued_count,
  g.last_generated_at as documentation_last_generated_at,
  coalesce(d.fire_safety_generated_type_keys, '{}') as fire_safety_generated_type_keys,
  coalesce(d.fire_safety_issued_count, 0) as fire_safety_issued_count,
  g.fire_safety_last_generated_at,
  lower(public.unaccent_immutable(c.legal_name || ' ' || c.cui || ' ' || coalesce(c.locality, '')))
    as search_text,
  cardinality(coalesce(d.generated_type_keys, '{}')) + missing.documentation as documentation_total_count,
  case
    when cardinality(coalesce(d.generated_type_keys, '{}')) = 0 then 'none'
    when coalesce(d.issued_count, 0) >= cardinality(d.generated_type_keys) + missing.documentation
      then 'issued'
    else 'in_progress'
  end::public.documentation_state as documentation_state,
  cardinality(coalesce(d.fire_safety_generated_type_keys, '{}')) + missing.fire_safety
    as fire_safety_total_count,
  case
    when cardinality(coalesce(d.fire_safety_generated_type_keys, '{}')) = 0 then 'none'
    when coalesce(d.fire_safety_issued_count, 0)
      >= cardinality(d.fire_safety_generated_type_keys) + missing.fire_safety then 'issued'
    else 'in_progress'
  end::public.documentation_state as fire_safety_state,
  coalesce(t.employees, 0) as training_employee_count,
  coalesce(t.untrained, 0) as training_untrained_count,
  coalesce(t.overdue, 0) as training_overdue_count,
  coalesce(t.due, 0) as training_due_count,
  coalesce(t.attention, 0) as training_attention_count,
  case
    when t.attention > 0 then 0
    when t.due > 0 then 1
    when t.employees > 0 then 2
    else 3
  end as training_rank,
  case when t.attention > 0 then t.attention when t.due > 0 then t.due else 0 end
    as training_flagged_count,
  t.next_due_on as next_training_due_on,
  coalesce(t.tests_pending, 0) as tests_pending_count,
  behind.client_id is not null as documents_behind,
  gaps.client_id is not null as missing_basic_data,
  coalesce(signatures.pending, 0) as signatures_pending_count,
  coalesce(
    not sc.renews_automatically
      and (sc.start_date + make_interval(months => sc.duration_months))::date - 1
        between (now() at time zone 'Europe/Bucharest')::date
        and (now() at time zone 'Europe/Bucharest')::date + 60,
    false
  ) as contract_ending_within_60_days
from public.clients c
left join (
  select client_id, count(*)::integer as employee_count
  from public.employees
  where status = 'active' and archived_at is null
  group by client_id
) e on e.client_id = c.id
-- A document without a revision is what a failed generation leaves behind, not a document.
left join (
  select
    cd.client_id,
    array_agg(cd.type_key order by cd.type_key)
      filter (where cd.document_group = 'documentation_set') as generated_type_keys,
    (count(*) filter (where cd.document_group = 'documentation_set' and r.any_issued))::integer
      as issued_count,
    array_agg(cd.type_key order by cd.type_key)
      filter (where cd.document_group = 'fire_safety_set') as fire_safety_generated_type_keys,
    (count(*) filter (where cd.document_group = 'fire_safety_set' and r.any_issued))::integer
      as fire_safety_issued_count
  from public.client_documents cd
  join (
    select document_id, bool_or(status = 'issued') as any_issued
    from public.document_revisions
    group by document_id
  ) r on r.document_id = cd.id
  where cd.document_group in ('documentation_set', 'fire_safety_set')
    and (cd.period is null
      or cd.period = extract(year from now() at time zone 'Europe/Bucharest')::smallint)
  group by cd.client_id
) d on d.client_id = c.id
left join (
  select
    client_id,
    max(created_at) filter (where document_group = 'documentation_set') as last_generated_at,
    max(created_at) filter (where document_group = 'fire_safety_set')
      as fire_safety_last_generated_at
  from public.document_generations
  group by client_id
) g on g.client_id = c.id
-- The signing annex applies as soon as one is invited, before the invitation is accepted.
left join (
  select client_id from public.client_participants where revoked_at is null
  union
  select client_id
  from public.participant_invitations
  where accepted_at is null and revoked_at is null and expires_at > now()
) p on p.client_id = c.id
-- A generated document counts even where it no longer applies, as the set's tab still lists it.
left join lateral (
  select
    (count(*) filter (where b.document_group = 'documentation_set'))::integer as documentation,
    (count(*) filter (where b.document_group = 'fire_safety_set'))::integer as fire_safety
  from public.built_in_document_types() b
  where case b.applies_when
      when 'from_ten_employees' then coalesce(e.employee_count, 0) >= 10
      when 'with_participants' then p.client_id is not null
      else true
    end
    and not b.type_key = any (
      case b.document_group
        when 'documentation_set' then coalesce(d.generated_type_keys, '{}')
        else coalesce(d.fire_safety_generated_type_keys, '{}')
      end
    )
) as missing on true
-- By the dashboard's rules (ADR 027), so the two agree: current employees of active clients,
-- each counted once per state they are in, in either domain; an archived client has none.
left join (
  select
    w.client_id,
    count(*)::integer as employees,
    (count(*) filter (where 'untrained' in (s.ssm_training_state, s.su_training_state)))::integer
      as untrained,
    (count(*) filter (where 'overdue' in (s.ssm_training_state, s.su_training_state)))::integer
      as overdue,
    (count(*) filter (where 'due' in (s.ssm_training_state, s.su_training_state)))::integer as due,
    (count(*) filter (
      where s.ssm_training_state in ('untrained', 'overdue')
        or s.su_training_state in ('untrained', 'overdue')
    ))::integer as attention,
    min(least(
      case when s.ssm_training_state in ('current', 'due') then s.ssm_training_due_on end,
      case when s.su_training_state in ('current', 'due') then s.su_training_due_on end
    )) as next_due_on,
    (count(*) filter (where s.ssm_test_state = 'pending' or s.su_test_state = 'pending'))::integer
      as tests_pending
  from public.organization_employee_states((select public.current_organization_id())) s
  join public.employees w on w.id = s.employee_id
  group by w.client_id
) t on t.client_id = c.id
left join (
  select b.client_id from public.documents_behind b group by b.client_id
) behind on behind.client_id = c.id
left join (
  select m.client_id from public.clients_missing_basic_data m group by m.client_id
) gaps on gaps.client_id = c.id
left join (
  select r.client_id, count(*)::integer as pending
  from public.signature_requests r
  where r.slot = 'trainee' and r.state = 'pending'
  group by r.client_id
) signatures on signatures.client_id = c.id
-- Owners only: for anyone else the policy hides every contract, and the column reads false.
left join public.service_contracts sc on sc.client_id = c.id;

comment on column public.client_list.search_text is
  'The text the list search matches, as client_search_text: name, CUI and locality, lowercase and without diacritics.';
comment on column public.client_list.documentation_total_count is
  'The documents the occupational safety tab lists: every generated one and each built-in one that applies and is not generated yet.';
comment on column public.client_list.training_attention_count is
  'Current employees untrained or overdue in either domain. Zero for an archived client, whose employees the training rules do not follow.';
comment on column public.client_list.training_rank is
  '0 with someone untrained or overdue, 1 with someone due within 30 days, 2 with everyone current, 3 with no current employee.';
comment on column public.client_list.next_training_due_on is
  'The nearest due date not yet passed of a current employee, in either domain; null when none has one.';
comment on column public.client_list.contract_ending_within_60_days is
  'The service contract does not renew by itself and ends between today and 60 days from now, in Bucharest. False for a member who is not an owner.';
