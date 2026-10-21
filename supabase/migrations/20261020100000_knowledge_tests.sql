-- Knowledge tests (ADR 024): the question bank, its built-in rows without an organization and
-- the organization's own beside them, hidden per organization; the test attempts a participant
-- takes in the portal; the test results, from a passing attempt or from paper; and the test
-- state, computed from the training records and the results, never stored.
--
-- A participant never reads `test_questions`, whose options carry the key: the portal's routes
-- query as the participant, and PostgREST answers that token too. The draw, the answers and the
-- finish are security definer functions instead of policies a participant would insert under.
--
-- Errors the API translates, raised with these SQLSTATEs:
--   P0002  the participant, the attempt or the material revision is not the caller's:
--          participant_not_found, attempt_not_found, material_not_found
--   CLA01  the client is archived
--   TST01  the test would keep fewer than ten active questions: test_below_minimum
--   TST02  only a built-in question of the same test is hidden or replaced: question_not_built_in
--   TST03  a finished attempt is frozen: attempt_finished
--   TST04  the answer does not fit the attempt: question_out_of_range, option_out_of_range
--   TST05  the test does not await the employee: test_not_awaiting
--   TST06  a result from an attempt changes only in its examiner and is not deleted:
--          result_from_attempt

create type public.knowledge_test as enum ('hiring', 'annual');

create type public.test_result_source as enum ('portal', 'paper');

create type public.test_state as enum ('none', 'pending', 'passed', 'annual_due');

create function public.test_options_are_valid(p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  option_value jsonb;
  correct_count integer := 0;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array'
    or jsonb_array_length(p_options) not between 2 and 4 then
    return false;
  end if;
  for option_value in select o.value from jsonb_array_elements(p_options) as o (value) loop
    if jsonb_typeof(option_value) <> 'object'
      or (select count(*) from jsonb_object_keys(option_value)) <> 2
      or jsonb_typeof(option_value -> 'text') is distinct from 'string'
      or jsonb_typeof(option_value -> 'correct') is distinct from 'boolean' then
      return false;
    end if;
    if option_value ->> 'text' <> btrim(option_value ->> 'text')
      or char_length(option_value ->> 'text') not between 1 and 500 then
      return false;
    end if;
    if (option_value ->> 'correct')::boolean then
      correct_count := correct_count + 1;
    end if;
  end loop;
  return correct_count >= 1;
end;
$$;

create table public.test_questions (
  id uuid primary key default gen_random_uuid(),
  -- Null for a built-in question: the app's, read by every organization and edited by none.
  -- A migration corrects one in place, under its fixed id.
  organization_id uuid references public.organizations (id) on delete restrict,
  domain public.training_domain not null,
  test public.knowledge_test not null,
  -- The order the printed test lists the questions in; an own question with a built-in's
  -- position comes after it.
  position integer not null constraint test_questions_position_positive check (position >= 1),
  text text not null
    constraint test_questions_text_trimmed check (text = btrim(text))
    constraint test_questions_text_length check (char_length(text) between 5 and 1000),
  -- Two to four {"text", "correct"} in the bank's order, at least one correct; a sitting shuffles them.
  options jsonb not null constraint test_questions_options_valid check (public.test_options_are_valid(options)),
  explanation text
    constraint test_questions_explanation_trimmed check (explanation = btrim(explanation))
    constraint test_questions_explanation_length check (char_length(explanation) between 1 and 1000),
  citation text
    constraint test_questions_citation_trimmed check (citation = btrim(citation))
    constraint test_questions_citation_length check (char_length(citation) between 1 and 300),
  -- Provenance only (ADR 024): the built-in an own question departs from, shown to the provider.
  replaces_question_id uuid references public.test_questions (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_questions_annual_is_fire_safety check (test <> 'annual' or domain = 'psi'),
  constraint test_questions_replaces_only_as_own check (replaces_question_id is null or organization_id is not null)
);

create unique index test_questions_built_in_position_key
  on public.test_questions (domain, test, position) where organization_id is null;
create index test_questions_organization_test_idx
  on public.test_questions (organization_id, domain, test, position);
create index test_questions_replaces_question_id_idx on public.test_questions (replaces_question_id);

comment on table public.test_questions is
  'The question bank (ADR 024): built-in questions without an organization, and each organization''s own questions. Members only: the options carry the key.';

create trigger test_questions_set_updated_at before update on public.test_questions
  for each row execute function public.set_updated_at();

create table public.test_question_hides (
  organization_id uuid not null references public.organizations (id) on delete restrict,
  question_id uuid not null references public.test_questions (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, question_id)
);

create index test_question_hides_question_id_idx on public.test_question_hides (question_id);

comment on table public.test_question_hides is
  'The built-in questions an organization hides from its tests (ADR 024). Deleting the row restores the question.';

-- Active: a built-in the organization has not hidden, or one of its own. Runs as the caller, so
-- the policies decide; the functions below call it as its owner.
create function public.active_test_questions(
  p_organization_id uuid,
  p_domain public.training_domain,
  p_test public.knowledge_test
)
returns setof public.test_questions
language sql
stable
set search_path = ''
as $$
  select q.*
  from public.test_questions q
  where q.domain = p_domain
    and q.test = p_test
    and (
      q.organization_id = p_organization_id
      or (
        q.organization_id is null
        and not exists (
          select 1 from public.test_question_hides h
          where h.organization_id = p_organization_id and h.question_id = q.id
        )
      )
    )
  order by q.position, q.organization_id nulls first, q.created_at, q.id;
$$;

create function public.check_test_question_replaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.replaces_question_id is not null and not exists (
    select 1 from public.test_questions q
    where q.id = new.replaces_question_id
      and q.organization_id is null
      and q.domain = new.domain
      and q.test = new.test
  ) then
    raise exception 'question_not_built_in' using errcode = 'TST02';
  end if;
  return new;
end;
$$;

create trigger test_questions_check_replaces
  before insert or update of replaces_question_id on public.test_questions
  for each row execute function public.check_test_question_replaces();

-- Hiding a built-in or deleting an own question is refused when the test would keep fewer than
-- the ten a sitting draws (ADR 024), so the provider adds before it hides.
create function public.protect_test_minimum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid;
  question public.test_questions;
  remaining integer;
begin
  if tg_table_name = 'test_question_hides' then
    organization := new.organization_id;
    select * into question from public.test_questions q where q.id = new.question_id;
    if not found or question.organization_id is not null then
      raise exception 'question_not_built_in' using errcode = 'TST02';
    end if;
  else
    organization := old.organization_id;
    question := old;
  end if;
  -- Two hides at once would each still count the other's question.
  perform pg_advisory_xact_lock(
    hashtextextended(organization::text || ':' || question.domain::text || ':' || question.test::text, 24)
  );
  select count(*) into remaining
  from public.active_test_questions(organization, question.domain, question.test) a
  where a.id <> question.id;
  if remaining < 10 then
    raise exception 'test_below_minimum' using errcode = 'TST01';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger test_question_hides_protect_minimum
  before insert on public.test_question_hides
  for each row execute function public.protect_test_minimum();

create trigger test_questions_protect_minimum
  before delete on public.test_questions
  for each row when (old.organization_id is not null)
  execute function public.protect_test_minimum();

-- Lets an attempt name its participant together with the client.
create unique index client_participants_id_client_key on public.client_participants (id, client_id);

create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  employee_id uuid not null,
  participant_id uuid not null,
  domain public.training_domain not null,
  test public.knowledge_test not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Served in Romanian only (ADR 024); a translation widens this (#532).
  language text not null default 'ro' constraint test_attempts_language_valid check (language = 'ro'),
  -- As shown, in the shown order: [{"question_id", "text", "options": [{"text"}], "chosen": [i]}].
  -- The finish adds the question's "correct" and its "explanation", never an option's: the
  -- participant reads this row.
  questions jsonb not null,
  total smallint not null constraint test_attempts_total_range check (total between 1 and 100),
  score smallint,
  passed boolean,
  -- The issued revision of the material the portal showed with the test, if any.
  material_revision_id uuid references public.document_revisions (id) on delete set null,
  client_address inet,
  user_agent text constraint test_attempts_user_agent_length check (char_length(user_agent) <= 1000),
  created_at timestamptz not null default now(),
  constraint test_attempts_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint test_attempts_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint test_attempts_participant_of_client
    foreign key (participant_id, client_id) references public.client_participants (id, client_id) on delete restrict,
  constraint test_attempts_annual_is_fire_safety check (test <> 'annual' or domain = 'psi'),
  constraint test_attempts_questions_shown check (
    case when jsonb_typeof(questions) = 'array' then jsonb_array_length(questions) = total else false end
  ),
  constraint test_attempts_finished_whole
    check ((finished_at is null) = (score is null) and (score is null) = (passed is null)),
  constraint test_attempts_score_range check (score between 0 and total)
);

create unique index test_attempts_in_progress_key
  on public.test_attempts (participant_id, domain, test) where finished_at is null;
-- Lets a result name its attempt together with the employee and the test.
create unique index test_attempts_id_employee_test_key
  on public.test_attempts (id, employee_id, domain, test);
create index test_attempts_employee_idx on public.test_attempts (employee_id, domain, test, started_at desc);
create index test_attempts_client_id_idx on public.test_attempts (client_id);
create index test_attempts_organization_id_idx on public.test_attempts (organization_id);
create index test_attempts_material_revision_id_idx on public.test_attempts (material_revision_id);

comment on table public.test_attempts is
  'One sitting of a knowledge test by a participant in the portal: the questions and options as shown, the answers, the score (ADR 024). Frozen once finished.';

-- The key of an attempt, apart from the row the participant reads: the correct options in the
-- shown order and the explanations. It stays after the finish, frozen with the attempt, because
-- a bank of ten shows the same questions at every retake. Definer functions only.
create table public.test_attempt_keys (
  attempt_id uuid primary key references public.test_attempts (id) on delete cascade,
  key jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.test_attempt_keys is
  'The answer key of a test attempt, kept and frozen once it is finished (ADR 024). No policy: definer functions only.';

-- Truncate included: what the employee saw and answered is the traceability art. 81(3^3) of
-- H.G. 1425/2006 asks for (ADR 024).
create function public.protect_finished_test_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'attempt_finished' using errcode = 'TST03';
  end if;
  if old.finished_at is not null then
    raise exception 'attempt_finished' using errcode = 'TST03';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger test_attempts_frozen
  before update or delete on public.test_attempts
  for each row execute function public.protect_finished_test_attempt();
create trigger test_attempts_never_truncated
  before truncate on public.test_attempts
  for each statement execute function public.protect_finished_test_attempt();

create function public.protect_finished_test_attempt_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.test_attempts a where a.id = old.attempt_id and a.finished_at is not null
  ) then
    raise exception 'attempt_finished' using errcode = 'TST03';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger test_attempt_keys_frozen
  before update or delete on public.test_attempt_keys
  for each row execute function public.protect_finished_test_attempt_key();
create trigger test_attempt_keys_never_truncated
  before truncate on public.test_attempt_keys
  for each statement execute function public.protect_finished_test_attempt();

create trigger test_attempts_protect_archived_client
  before insert or update on public.test_attempts
  for each row execute function public.protect_rows_of_archived_client();
create trigger test_attempts_protect_lead before insert on public.test_attempts
  for each row execute function public.protect_rows_of_lead();

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  -- Any status: a paper result may belong to someone who has left.
  employee_id uuid not null,
  domain public.training_domain not null,
  test public.knowledge_test not null,
  taken_on date not null,
  -- What the sheet prints under "Materialul examinat": the test's name and code.
  material text not null
    constraint test_results_material_trimmed check (material = btrim(material))
    constraint test_results_material_length check (char_length(material) between 1 and 300),
  -- A failed paper test is not recorded: the sheet prints passes (ADR 024).
  grade text not null default 'admis' constraint test_results_grade_valid check (grade = 'admis'),
  -- Null on a portal pass when the organization had nobody to propose, until a member names them.
  examiner_name text
    constraint test_results_examiner_name_length check (char_length(btrim(examiner_name)) between 1 and 160),
  examiner_job_title text
    constraint test_results_examiner_job_title_length check (char_length(btrim(examiner_job_title)) between 1 and 160),
  source public.test_result_source not null,
  attempt_id uuid unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_results_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint test_results_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint test_results_attempt_of_employee
    foreign key (attempt_id, employee_id, domain, test)
    references public.test_attempts (id, employee_id, domain, test) on delete restrict,
  constraint test_results_annual_is_fire_safety check (test <> 'annual' or domain = 'psi'),
  constraint test_results_examiner_whole check ((examiner_name is null) = (examiner_job_title is null)),
  constraint test_results_source_matches_attempt check ((source = 'portal') = (attempt_id is not null)),
  constraint test_results_paper_has_examiner check (source = 'portal' or examiner_name is not null)
);

create index test_results_employee_domain_taken_on_idx on public.test_results (employee_id, domain, taken_on desc);
create index test_results_client_id_idx on public.test_results (client_id);
create index test_results_organization_id_idx on public.test_results (organization_id);

comment on table public.test_results is
  'A pass of a knowledge test (ADR 024): from a passing attempt in the portal or recorded from paper. What the individual training sheets print.';

create trigger test_results_set_updated_at before update on public.test_results
  for each row execute function public.set_updated_at();

create trigger test_results_protect_archived_client
  before insert or update or delete on public.test_results
  for each row execute function public.protect_rows_of_archived_client();
create trigger test_results_protect_lead before insert on public.test_results
  for each row execute function public.protect_rows_of_lead();

-- The attempt behind a portal result is frozen; the day and the material it gives stay with it.
create function public.protect_test_result_from_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source = 'portal' and (
    tg_op = 'DELETE'
    or (new.taken_on, new.material, new.grade) is distinct from (old.taken_on, old.material, old.grade)
  ) then
    raise exception 'result_from_attempt' using errcode = 'TST06';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger test_results_protect_from_attempt
  before update or delete on public.test_results
  for each row execute function public.protect_test_result_from_attempt();

-- One employee's test standing in one domain (ADR 024). The hiring test awaits from the
-- introductory general record for occupational safety and from the workplace record for fire
-- safety, whose one test closes both hiring trainings. Any pass in the domain answers the
-- hiring test, an annual pass included; the fire-safety annual test is due twelve months after
-- the last one. Days are Romanian days, as the documents date them.
--
-- No search_path setting, and every name qualified instead: a function with one is never
-- inlined, and the employee lists read this once per row.
create function public.employee_test_due(
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
  from (
    select max(t.held_on) as hiring_trained_on
    from public.training_records r
    join public.trainings t on t.id = r.training_id
    where r.employee_id = p_employee_id
      and t.domain = p_domain
      and t.phase = case p_domain
        when 'ssm' then 'introductory_general'
        else 'workplace'
      end::public.training_phase
  ) as held
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
        case when held.hiring_trained_on is null then 'none' else 'pending' end
      when due.due_on <= today.day then 'annual_due'
      else 'passed'
    end::public.test_state as state
  ) as standing;
$$;

-- One row per employee with both domains, beside `employee_training_status`. Security invoker:
-- each table inside answers to the caller's own policies.
create view public.employee_test_status
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
  psi.hiring_trained_on as psi_hiring_trained_on,
  psi.last_passed_on as psi_last_passed_on,
  psi.due_on as psi_due_on,
  psi.state as psi_state,
  psi.awaiting_test as psi_awaiting_test
from public.employees e
cross join lateral public.employee_test_due(e.id, e.status, 'ssm') as ssm
cross join lateral public.employee_test_due(e.id, e.status, 'psi') as psi;

comment on view public.employee_test_status is
  'Per employee and domain: the hiring training the test closes, the last pass, the annual test due and the test state (ADR 024). Null states for a leaver.';

-- What the employee lists embed as `test_status`: a computed relationship of PostgREST.
-- Rows 1 makes it a to-one embed.
create function public.test_status(public.employees)
returns setof public.employee_test_status
rows 1
language sql
stable
as $$
  select * from public.employee_test_status s where s.employee_id = $1.id;
$$;

-- The real signed-in user, as in the other participant functions: impersonation is for members.
create function public.test_participant(p_participant_id uuid)
returns public.client_participants
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  participant public.client_participants;
begin
  select * into participant
  from public.client_participants p
  where p.id = p_participant_id
    and p.user_id = auth.uid()
    and p.revoked_at is null
    and p.employee_id is not null;
  if not found then
    raise exception 'participant_not_found' using errcode = 'P0002';
  end if;
  return participant;
end;
$$;

create function public.test_study_card(
  p_participant_id uuid,
  p_domain public.training_domain,
  p_test public.knowledge_test
)
returns table (explanation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  participant public.client_participants := public.test_participant(p_participant_id);
begin
  return query
  select q.explanation
  from public.active_test_questions(participant.organization_id, p_domain, p_test) as q
  where q.explanation is not null;
end;
$$;

create function public.start_test_attempt(
  p_participant_id uuid,
  p_domain public.training_domain,
  p_test public.knowledge_test,
  p_material_revision_id uuid default null,
  p_client_address inet default null,
  p_user_agent text default null
)
returns public.test_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant public.client_participants := public.test_participant(p_participant_id);
  employee public.employees;
  standing public.test_state;
  attempt public.test_attempts;
  shown jsonb;
  answer_key jsonb;
begin
  select * into employee from public.employees e where e.id = participant.employee_id;
  select d.state into standing from public.employee_test_due(employee.id, employee.status, p_domain) as d;
  if standing is distinct from (
    case p_test when 'hiring' then 'pending' else 'annual_due' end
  )::public.test_state then
    raise exception 'test_not_awaiting' using errcode = 'TST05';
  end if;

  select * into attempt from public.test_attempts a
  where a.participant_id = participant.id and a.domain = p_domain and a.test = p_test
    and a.finished_at is null;
  if found then
    return attempt;
  end if;

  if p_material_revision_id is not null and not exists (
    select 1
    from public.document_revisions r
    join public.client_documents d on d.id = r.document_id
    where r.id = p_material_revision_id
      and d.client_id = participant.client_id
      and r.issued_at is not null
  ) then
    raise exception 'material_not_found' using errcode = 'P0002';
  end if;

  select
    jsonb_agg(
      jsonb_build_object('question_id', drawn.id, 'text', drawn.text, 'options', shuffled.options, 'chosen', '[]'::jsonb)
      order by drawn.draw
    ),
    jsonb_agg(
      jsonb_build_object('correct', shuffled.correct, 'explanation', drawn.explanation)
      order by drawn.draw
    )
  into shown, answer_key
  from (
    select q.id, q.text, q.options, q.explanation, row_number() over (order by random()) as draw
    from public.active_test_questions(participant.organization_id, p_domain, p_test) as q
  ) as drawn
  cross join lateral (
    select
      jsonb_agg(jsonb_build_object('text', o.value ->> 'text') order by o.place) as options,
      coalesce(
        jsonb_agg(o.place order by o.place) filter (where (o.value ->> 'correct')::boolean),
        '[]'::jsonb
      ) as correct
    from (
      select a.value, row_number() over (order by random()) - 1 as place
      from jsonb_array_elements(drawn.options) as a (value)
    ) as o
  ) as shuffled
  where drawn.draw <= 10;

  if coalesce(jsonb_array_length(shown), 0) < 10 then
    raise exception 'test_below_minimum' using errcode = 'TST01';
  end if;

  insert into public.test_attempts (
    organization_id, client_id, employee_id, participant_id, domain, test, questions, total,
    material_revision_id, client_address, user_agent
  )
  values (
    participant.organization_id, participant.client_id, participant.employee_id, participant.id,
    p_domain, p_test, shown, jsonb_array_length(shown), p_material_revision_id, p_client_address,
    p_user_agent
  )
  on conflict (participant_id, domain, test) where finished_at is null do nothing
  returning * into attempt;

  if attempt.id is null then
    select * into attempt from public.test_attempts a
    where a.participant_id = participant.id and a.domain = p_domain and a.test = p_test
      and a.finished_at is null;
    return attempt;
  end if;

  insert into public.test_attempt_keys (attempt_id, key) values (attempt.id, answer_key);
  return attempt;
end;
$$;

create function public.own_test_attempt_for_update(p_attempt_id uuid)
returns public.test_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts;
begin
  select a.* into attempt
  from public.test_attempts a
  join public.client_participants p on p.id = a.participant_id
  where a.id = p_attempt_id and p.user_id = auth.uid() and p.revoked_at is null
  for update of a;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if attempt.finished_at is not null then
    raise exception 'attempt_finished' using errcode = 'TST03';
  end if;
  return attempt;
end;
$$;

-- Stores the options chosen for one question, by their index in the shown order; an empty array
-- leaves the question unanswered. Saved as given, so a dropped connection resumes the attempt.
create function public.answer_test_attempt(
  p_attempt_id uuid,
  p_question_index integer,
  p_chosen integer[]
)
returns public.test_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts := public.own_test_attempt_for_update(p_attempt_id);
  option_count integer;
  chosen jsonb;
begin
  if p_question_index is null or p_question_index < 0 or p_question_index >= attempt.total then
    raise exception 'question_out_of_range' using errcode = 'TST04';
  end if;
  option_count := jsonb_array_length(attempt.questions -> p_question_index -> 'options');
  if p_chosen is null or exists (
    select 1 from unnest(p_chosen) as c (value)
    where c.value is null or c.value < 0 or c.value >= option_count
  ) then
    raise exception 'option_out_of_range' using errcode = 'TST04';
  end if;
  select coalesce(jsonb_agg(distinct c.value order by c.value), '[]'::jsonb) into chosen
  from unnest(p_chosen) as c (value);
  update public.test_attempts a
  set questions = jsonb_set(a.questions, array[p_question_index::text, 'chosen'], chosen)
  where a.id = attempt.id
  returning * into attempt;
  return attempt;
end;
$$;

-- A question counts only when the options chosen are exactly the correct ones; the pass mark is
-- seven of ten, 70% (ADR 024). The examiner proposed is who gives the introductory trainings:
-- the fire-safety technician, else the trainer on the record, the specialist for occupational
-- safety; a member replaces them on the result.
create function public.finish_test_attempt(
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
    if attempt.domain = 'psi' then
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

revoke all on function public.test_options_are_valid(jsonb) from public, anon;
revoke all on function public.active_test_questions(uuid, public.training_domain, public.knowledge_test) from public, anon;
revoke all on function public.check_test_question_replaces() from public, anon, authenticated;
revoke all on function public.protect_test_minimum() from public, anon, authenticated;
revoke all on function public.protect_finished_test_attempt() from public, anon, authenticated;
revoke all on function public.protect_finished_test_attempt_key() from public, anon, authenticated;
revoke all on function public.protect_test_result_from_attempt() from public, anon, authenticated;
revoke all on function public.employee_test_due(uuid, public.employee_status, public.training_domain) from public, anon;
revoke all on function public.test_status(public.employees) from public, anon;
revoke all on function public.test_participant(uuid) from public, anon, authenticated;
revoke all on function public.own_test_attempt_for_update(uuid) from public, anon, authenticated;
revoke all on function public.test_study_card(uuid, public.training_domain, public.knowledge_test) from public, anon;
revoke all on function public.start_test_attempt(uuid, public.training_domain, public.knowledge_test, uuid, inet, text) from public, anon;
revoke all on function public.answer_test_attempt(uuid, integer, integer[]) from public, anon;
revoke all on function public.finish_test_attempt(uuid, inet, text) from public, anon;
grant execute on function public.test_options_are_valid(jsonb) to authenticated, service_role;
grant execute on function public.active_test_questions(uuid, public.training_domain, public.knowledge_test) to authenticated, service_role;
grant execute on function public.employee_test_due(uuid, public.employee_status, public.training_domain) to authenticated, service_role;
grant execute on function public.test_status(public.employees) to authenticated, service_role;
grant execute on function public.test_study_card(uuid, public.training_domain, public.knowledge_test) to authenticated, service_role;
grant execute on function public.start_test_attempt(uuid, public.training_domain, public.knowledge_test, uuid, inet, text) to authenticated, service_role;
grant execute on function public.answer_test_attempt(uuid, integer, integer[]) to authenticated, service_role;
grant execute on function public.finish_test_attempt(uuid, inet, text) to authenticated, service_role;

alter table public.test_questions enable row level security;
alter table public.test_question_hides enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_attempt_keys enable row level security;
alter table public.test_results enable row level security;
revoke all on table public.test_questions from anon;
revoke all on table public.test_question_hides from anon;
revoke all on table public.test_attempts from anon;
revoke all on table public.test_attempt_keys from anon, authenticated;
revoke all on table public.test_results from anon;

-- A participant has no membership, so neither policy lets them read a question.
create policy "members read the built-in questions"
  on public.test_questions for select to authenticated
  using (organization_id is null and (select public.current_organization_id()) is not null);

create policy "members read their questions"
  on public.test_questions for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members write their questions"
  on public.test_questions for insert to authenticated
  with check (organization_id = (select public.current_organization_id()));

create policy "members update their questions"
  on public.test_questions for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

create policy "members delete their questions"
  on public.test_questions for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

-- A question never moves to another organization, domain or test.
revoke update on table public.test_questions from authenticated;
grant update (position, text, options, explanation, citation, replaces_question_id)
  on table public.test_questions to authenticated;

create policy "members read their hidden questions"
  on public.test_question_hides for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members hide built-in questions"
  on public.test_question_hides for insert to authenticated
  with check (organization_id = (select public.current_organization_id()));

create policy "members restore hidden questions"
  on public.test_question_hides for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

revoke update on table public.test_question_hides from authenticated;

create policy "members read their clients' test attempts"
  on public.test_attempts for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their own test attempts"
  on public.test_attempts for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

revoke insert, update, delete, truncate on table public.test_attempts from authenticated;

create policy "members read their test results"
  on public.test_results for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- A portal result is the finish's alone.
create policy "members record paper test results for their active clients"
  on public.test_results for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and source = 'paper'
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
    )
  );

create policy "members update their test results"
  on public.test_results for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

create policy "members delete their test results"
  on public.test_results for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their own test results"
  on public.test_results for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's test results"
  on public.test_results for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

revoke update on table public.test_results from authenticated;
grant update (taken_on, material, examiner_name, examiner_job_title) on table public.test_results to authenticated;

revoke all on table public.employee_test_status from anon, authenticated;
grant select on table public.employee_test_status to authenticated, service_role;
