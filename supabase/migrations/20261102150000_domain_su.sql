-- ADR 035. A renamed enum value carries its rows, the checks and the views' parsed constants;
-- function bodies kept as text, column names and stored keys need the statements below.

alter type public.instruction_domain rename value 'psi' to 'su';
alter type public.training_domain rename value 'psi' to 'su';
alter type public.import_library_part rename value 'instructions_psi' to 'instructions_su';

comment on column public.instruction_modules.domain is
  'The set whose own instructions annex the module: ssm for the occupational safety one (3.2), su for the fire-safety one (2.1).';
comment on column public.instruction_modules.module_group is
  'The category: work_activity, work_equipment or protective_equipment for ssm; premises_activity, installation_equipment or hazardous_work for su (ADR 034).';
comment on column public.import_files.document_domain is
  'For own instructions and training themes, whether the sorting found them about ssm or su: the library part they are read for.';

update public.document_templates
set type_key = 'training_sheet_su'
where organization_id is null and type_key = 'training_sheet_psi';

update public.credit_entries
set key = replace(key, ':instructions_psi:', ':instructions_su:')
where key like 'library:%:instructions\_psi:%';

create or replace function public.import_library_part_domain(p_part public.import_library_part)
returns public.instruction_domain
language sql
immutable
set search_path = ''
as $$
  select case p_part when 'instructions_su' then 'su' else 'ssm' end::public.instruction_domain;
$$;

create or replace function public.follow_job_position_instructions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.domain = 'su' then
      update public.job_positions set needs_fire_instructions = true
      where id = new.job_position_id and needs_fire_instructions is distinct from true;
    else
      update public.job_positions set needs_instructions = true
      where id = new.job_position_id and needs_instructions is distinct from true;
    end if;
    return new;
  end if;
  if not exists (
    select 1 from public.job_position_instructions
    where job_position_id = old.job_position_id and domain = old.domain
  ) then
    if old.domain = 'su' then
      update public.job_positions set needs_fire_instructions = null
      where id = old.job_position_id and needs_fire_instructions is not null;
    else
      update public.job_positions set needs_instructions = null
      where id = old.job_position_id and needs_instructions is not null;
    end if;
  end if;
  return old;
end;
$$;

create or replace function public.protect_job_position_instructions_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  checked public.instruction_domain;
  decided boolean;
  has_modules boolean;
begin
  foreach checked in array array['ssm', 'su']::public.instruction_domain[] loop
    if checked = 'ssm' then
      continue when new.needs_instructions is not distinct from old.needs_instructions;
      decided := new.needs_instructions;
    else
      continue when new.needs_fire_instructions is not distinct from old.needs_fire_instructions;
      decided := new.needs_fire_instructions;
    end if;
    select exists (
      select 1 from public.job_position_instructions i
      where i.job_position_id = new.id and i.domain = checked
    ) into has_modules;
    if decided = false and has_modules then
      raise exception 'The position applies instruction modules.' using errcode = 'INS01';
    end if;
    if decided = true and not has_modules then
      raise exception 'Apply an instruction module instead.' using errcode = 'INS02';
    end if;
  end loop;
  return new;
end;
$$;

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
      when p_domain = 'su' then (passed.last_passed_on + pg_catalog.make_interval(months => 12))::date
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

create or replace function public.finish_test_attempt(
  p_attempt_id uuid,
  p_client_address inet default null,
  p_user_agent text default null
)
returns public.test_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts := public.own_test_attempt_for_update(p_attempt_id);
  answer_key jsonb;
  marked jsonb;
  right_count integer;
  examiner_name text;
  examiner_job_title text;
  still_awaiting boolean;
begin
  select k.key into answer_key from public.test_attempt_keys k where k.attempt_id = attempt.id;

  select
    jsonb_agg(
      scored.question || jsonb_build_object(
        'correct', scored.chosen = scored.correct,
        'explanation', scored.explanation
      )
      order by scored.place
    ),
    count(*) filter (where scored.chosen = scored.correct)
  into marked, right_count
  from (
    select
      q.place,
      q.value as question,
      k.value -> 'explanation' as explanation,
      (
        select coalesce(array_agg(c.value::integer order by c.value::integer), '{}')
        from jsonb_array_elements_text(q.value -> 'chosen') as c (value)
      ) as chosen,
      (
        select coalesce(array_agg(c.value::integer order by c.value::integer), '{}')
        from jsonb_array_elements_text(k.value -> 'correct') as c (value)
      ) as correct
    from jsonb_array_elements(attempt.questions) with ordinality as q (value, place)
    join jsonb_array_elements(answer_key) with ordinality as k (value, place) on k.place = q.place
  ) as scored;

  update public.test_attempts a
  set questions = marked,
      score = right_count,
      passed = right_count * 10 >= a.total * 7,
      finished_at = now(),
      client_address = coalesce(p_client_address, a.client_address),
      user_agent = coalesce(p_user_agent, a.user_agent)
  where a.id = attempt.id
  returning * into attempt;

  -- An attempt left open while a paper pass was recorded would otherwise give a second pass.
  select d.state = (case attempt.test when 'hiring' then 'pending' else 'annual_due' end)::public.test_state
  into still_awaiting
  from public.employees e
  cross join lateral public.employee_test_due(e.id, e.status, attempt.domain) as d
  where e.id = attempt.employee_id;

  if attempt.passed and still_awaiting then
    if attempt.domain = 'su' then
      -- As the API's fireSafetyTechnicianJobTitle, which the training proposals use.
      select o.fire_safety_technician_name, 'Cadru tehnic PSI'
      into examiner_name, examiner_job_title
      from public.organizations o
      where o.id = attempt.organization_id and o.fire_safety_technician_name is not null;
    end if;
    if examiner_name is null then
      select t.trainer_name, t.trainer_job_title
      into examiner_name, examiner_job_title
      from public.training_records r
      join public.trainings t on t.id = r.training_id
      where r.employee_id = attempt.employee_id
        and t.domain = attempt.domain
        and t.phase = 'introductory_general'
      order by t.held_on desc, t.created_at desc
      limit 1;
    end if;
    insert into public.test_results (
      organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name,
      examiner_job_title, source, attempt_id
    )
    values (
      attempt.organization_id, attempt.client_id, attempt.employee_id, attempt.domain, attempt.test,
      (attempt.finished_at at time zone 'Europe/Bucharest')::date,
      case
        when attempt.test = 'annual' then 'Verificare anuală pe bază de test (TPSU)'
        when attempt.domain = 'ssm' then 'Test de verificare a cunoștințelor la angajare (TASSM)'
        else 'Test de verificare a cunoștințelor la angajare (TASU)'
      end,
      examiner_name, examiner_job_title, 'portal', attempt.id
    );
  end if;

  return attempt;
end;
$$;

-- Renamed in place rather than dropped: training_status and test_status return these rows.
alter view public.employee_training_status rename column psi_last_periodic_on to su_last_periodic_on;
alter view public.employee_training_status rename column psi_workplace_trained_on to su_workplace_trained_on;
alter view public.employee_training_status rename column psi_has_hiring_training to su_has_hiring_training;
alter view public.employee_training_status rename column psi_due_on to su_due_on;
alter view public.employee_training_status rename column psi_state to su_state;
alter view public.employee_training_status rename column psi_interval_months to su_interval_months;
alter view public.employee_training_status rename column psi_interval_source to su_interval_source;

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
  su.last_periodic_on as su_last_periodic_on,
  su.workplace_trained_on as su_workplace_trained_on,
  su.has_hiring_training as su_has_hiring_training,
  su.due_on as su_due_on,
  su.state as su_state,
  coalesce(p.training_interval_months, programme.ssm_months) as ssm_interval_months,
  case
    when p.training_interval_months is not null then 'position'
    when programme.ssm_months is not null then 'client'
  end as ssm_interval_source,
  programme.su_months as su_interval_months,
  case when programme.su_months is not null then 'client' end as su_interval_source
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
    end as su_months
) as programme
cross join lateral public.employee_training_due(
  e.id, e.hired_at, e.status, 'ssm',
  coalesce(p.training_interval_months, programme.ssm_months)
) as ssm
cross join lateral public.employee_training_due(
  e.id, e.hired_at, e.status, 'su', programme.su_months
) as su;

alter view public.employee_test_status rename column psi_hiring_trained_on to su_hiring_trained_on;
alter view public.employee_test_status rename column psi_last_passed_on to su_last_passed_on;
alter view public.employee_test_status rename column psi_due_on to su_due_on;
alter view public.employee_test_status rename column psi_state to su_state;
alter view public.employee_test_status rename column psi_awaiting_test to su_awaiting_test;

create or replace view public.employee_test_status
with (security_invoker = true)
as
select
  e.id as employee_id,
  e.client_id,
  e.organization_id,
  ssm.hiring_trained_on as ssm_hiring_trained_on,
  ssm.last_passed_on as ssm_last_passed_on,
  ssm.state as ssm_state,
  ssm.awaiting_test as ssm_awaiting_test,
  su.hiring_trained_on as su_hiring_trained_on,
  su.last_passed_on as su_last_passed_on,
  su.due_on as su_due_on,
  su.state as su_state,
  su.awaiting_test as su_awaiting_test
from public.employees e
cross join lateral public.employee_test_due(e.id, e.status, 'ssm') as ssm
cross join lateral public.employee_test_due(e.id, e.status, 'su') as su;

-- No search_path setting, and every name qualified instead: a function with one is never inlined.
create or replace function public.training_status(public.employees)
returns setof public.employee_training_status
rows 1
language sql
stable
as $$
  select
    $1.id,
    $1.client_id,
    $1.organization_id,
    ssm.last_periodic_on,
    ssm.workplace_trained_on,
    ssm.has_hiring_training,
    ssm.due_on,
    ssm.state,
    su.last_periodic_on,
    su.workplace_trained_on,
    su.has_hiring_training,
    su.due_on,
    su.state,
    coalesce(p.training_interval_months, programme.ssm_months),
    case
      when p.training_interval_months is not null then 'position'
      when programme.ssm_months is not null then 'client'
    end,
    programme.su_months,
    case when programme.su_months is not null then 'client' end
  from public.job_positions p
  join public.clients c on c.id = $1.client_id
  left join public.client_fire_safety f on f.client_id = $1.client_id
  cross join lateral (
    select
      case p.staff_category
        when 'execution' then c.worker_training_interval_months
        else c.administrative_training_interval_months
      end as ssm_months,
      case p.staff_category
        when 'execution' then f.worker_training_interval_months
        else f.administrative_training_interval_months
      end as su_months
  ) as programme
  cross join lateral public.employee_training_due(
    $1.id, $1.hired_at, $1.status, 'ssm', coalesce(p.training_interval_months, programme.ssm_months)::integer
  ) as ssm
  cross join lateral public.employee_training_due(
    $1.id, $1.hired_at, $1.status, 'su', programme.su_months::integer
  ) as su
  where p.id = $1.job_position_id;
$$;

create or replace function public.test_status(public.employees)
returns setof public.employee_test_status
rows 1
language sql
stable
as $$
  select
    $1.id,
    $1.client_id,
    $1.organization_id,
    ssm.hiring_trained_on,
    ssm.last_passed_on,
    ssm.state,
    ssm.awaiting_test,
    su.hiring_trained_on,
    su.last_passed_on,
    su.due_on,
    su.state,
    su.awaiting_test
  from public.employee_test_due($1.id, $1.status, 'ssm') as ssm
  cross join public.employee_test_due($1.id, $1.status, 'su') as su;
$$;

-- The output columns change name, which a replaced function cannot do; the dashboard reads them.
drop view public.dashboard_summary;
drop function public.organization_employee_states(uuid);

-- employee_test_due's rule from 20261101100100 (ADR 032), repeated: with no pass recorded, the
-- newest hiring record of the domain decides, and on a day with both the one held in the app.
-- A hiring record is held in the app on its newest day exactly when its newest app day is that day.
create function public.organization_employee_states(p_organization_id uuid)
returns table (
  employee_id uuid,
  ssm_training_state public.training_state,
  ssm_training_due_on date,
  su_training_state public.training_state,
  su_training_due_on date,
  ssm_test_state public.test_state,
  su_test_state public.test_state
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
      max(t.held_on) filter (where t.domain = 'su' and t.phase = 'periodic') as su_last_periodic_on,
      max(t.held_on) filter (where t.domain = 'su' and t.phase = 'workplace') as su_workplace_trained_on,
      max(t.held_on) filter (
        where t.domain = 'su' and t.phase = 'workplace' and t.source = 'app'
      ) as su_workplace_in_app_on,
      max(t.held_on) filter (where t.domain = 'su' and t.phase = 'introductory_general') as su_introduced_on
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
      max(x.taken_on) filter (where x.domain = 'su') as su_last_passed_on
    from public.test_results x
    where x.organization_id = p_organization_id
    group by x.employee_id
  )
  select
    e.id,
    ssm.state,
    ssm.due_on,
    su.state,
    su.due_on,
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
      when passed.su_last_passed_on is null then
        case
          when held.su_workplace_trained_on is null then 'none'
          when held.su_workplace_in_app_on = held.su_workplace_trained_on then 'pending'
          else 'unverified'
        end
      when (passed.su_last_passed_on + pg_catalog.make_interval(months => 12))::date <= today.day
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
      held.su_introduced_on is not null or held.su_workplace_trained_on is not null
        as su_hired
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
      case when hiring.su_hired then (
        coalesce(held.su_last_periodic_on, held.su_workplace_trained_on, e.hired_at)
        + pg_catalog.make_interval(months => case p.staff_category
          when 'execution' then f.worker_training_interval_months
          else f.administrative_training_interval_months
        end)
      )::date end as su_due_on
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
      due.su_due_on as due_on,
      case
        when not hiring.su_hired then 'untrained'
        when due.su_due_on is null then 'current'
        when due.su_due_on < today.day then 'overdue'
        when due.su_due_on <= today.day + 30 then 'due'
        else 'current'
      end::public.training_state as state
  ) as su
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

create or replace function public.organization_employees_in_state(
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
      when p_domain = 'su' then s.su_training_state = p_training_state
      when p_training_state = 'current' then
        s.ssm_training_state = 'current' and s.su_training_state = 'current'
      else p_training_state in (s.ssm_training_state, s.su_training_state)
    end)
    and (p_test_state is null or case
      when p_domain = 'ssm' then s.ssm_test_state = p_test_state
      when p_domain = 'su' then s.su_test_state = p_test_state
      when p_test_state = 'passed' then s.ssm_test_state = 'passed' and s.su_test_state = 'passed'
      else p_test_state in (s.ssm_test_state, s.su_test_state)
    end);
$$;

create view public.dashboard_summary
with (security_invoker = true)
as
select
  o.id as organization_id,
  coalesce(staff.ssm_overdue, 0) as ssm_overdue,
  coalesce(staff.ssm_due, 0) as ssm_due,
  coalesce(staff.ssm_untrained, 0) as ssm_untrained,
  coalesce(staff.ssm_current, 0) as ssm_current,
  coalesce(staff.su_overdue, 0) as su_overdue,
  coalesce(staff.su_due, 0) as su_due,
  coalesce(staff.su_untrained, 0) as su_untrained,
  coalesce(staff.su_current, 0) as su_current,
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
        (st.su_training_state, st.su_training_due_on)
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
    (count(*) filter (where su_training_state = 'overdue'))::integer as su_overdue,
    (count(*) filter (where su_training_state = 'due'))::integer as su_due,
    (count(*) filter (where su_training_state = 'untrained'))::integer as su_untrained,
    (count(*) filter (where su_training_state = 'current'))::integer as su_current,
    count(*)::integer as employees,
    (select due_on from next_due) as next_due_on,
    (select employees from next_due) as next_due_count,
    (count(*) filter (where ssm_test_state = 'pending' or su_test_state = 'pending'))::integer
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

comment on view public.dashboard_summary is
  'One row per organization the caller can read, with the dashboard''s counts (ADR 027). Employees are the current ones of active clients; a count over a table the caller may not read is zero.';
comment on column public.dashboard_summary.next_due_on is
  'The nearest training due date in either domain among employees current or due; null when none has one.';
comment on column public.dashboard_summary.next_due_count is
  'How many employees have a training due on next_due_on, in either domain.';
comment on column public.dashboard_summary.employee_signatures_pending is
  'Pending trainee slots, of training records and test sheets, on active clients.';
comment on column public.dashboard_summary.contracts_received_to_confirm is
  'Signed copies of the issued service contract received through the return link and not yet confirmed, on clients and leads not archived.';
comment on column public.dashboard_summary.contracts_ending_within_60_days is
  'Service contracts of active clients that do not renew by themselves and end between today and 60 days from now, in Bucharest.';

revoke all on table public.dashboard_summary from anon, authenticated;
grant select on table public.dashboard_summary to authenticated, service_role;
