-- Training records (ADR 021): a training held at a client, recorded once with the employees who
-- attended, each attendance a training record. The due date and the training state are computed
-- from the records by the view below, never stored: the employees migration promised no training
-- flag on the employee row.

create type public.training_domain as enum ('ssm', 'psi');

create type public.training_phase as enum ('introductory_general', 'workplace', 'periodic', 'supplementary');

-- The cases of H.G. 1425/2006 art. 98.
create type public.supplementary_training_reason as enum (
  'absence_over_thirty_days',
  'rules_changed',
  'after_accident',
  'special_works',
  'new_equipment',
  'changed_procedure',
  'new_technology'
);

-- A record typed from a sheet filled by hand has its signatures on the paper.
create type public.training_source as enum ('app', 'paper');

create type public.training_state as enum ('untrained', 'current', 'due', 'overdue');

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  domain public.training_domain not null,
  phase public.training_phase not null,
  held_on date not null,
  duration_minutes smallint not null
    constraint trainings_duration_range check (duration_minutes between 1 and 600),
  -- Stored as taught: the themes it was proposed from may change afterwards (ADR 021).
  material text not null
    constraint trainings_material_length check (char_length(btrim(material)) between 1 and 4000),
  trainer_name text not null
    constraint trainings_trainer_name_length check (char_length(btrim(trainer_name)) between 1 and 160),
  trainer_job_title text not null
    constraint trainings_trainer_job_title_length check (char_length(btrim(trainer_job_title)) between 1 and 160),
  -- Null where the form has no verifier's signature, as the fire-safety sheet has none.
  verifier_name text
    constraint trainings_verifier_name_length check (char_length(btrim(verifier_name)) between 1 and 160),
  verifier_job_title text
    constraint trainings_verifier_job_title_length check (char_length(btrim(verifier_job_title)) between 1 and 160),
  supplementary_reason public.supplementary_training_reason,
  source public.training_source not null default 'app',
  -- The training themes revision the material and duration were proposed from, if any.
  themes_revision_id uuid references public.document_revisions (id) on delete set null,
  notes text constraint trainings_notes_length check (char_length(btrim(notes)) between 1 and 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainings_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint trainings_verifier_whole check ((verifier_name is null) = (verifier_job_title is null)),
  constraint trainings_supplementary_reason_matches_phase
    check ((phase = 'supplementary') = (supplementary_reason is not null))
);

-- Lets a record reference its training together with the client and the phase.
create unique index trainings_id_client_phase_key on public.trainings (id, client_id, phase);
create index trainings_client_domain_phase_held_on_idx
  on public.trainings (client_id, domain, phase, held_on);
create index trainings_organization_id_idx on public.trainings (organization_id);

comment on table public.trainings is
  'A training held at a client: one domain and phase, a day, what was taught and by whom (ADR 021).';

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  training_id uuid not null,
  -- The training's phase, kept here so that a check can allow "admis la lucru" only on a
  -- workplace training; the foreign key below carries a change of phase along.
  phase public.training_phase not null,
  -- Any status: a record typed from paper may belong to someone who has left.
  employee_id uuid not null,
  -- The position's name at the time: a person who changes post keeps the rows of the old one.
  occupation text not null
    constraint training_records_occupation_length check (char_length(btrim(occupation)) between 1 and 160),
  admitted_on date,
  admitted_by_name text
    constraint training_records_admitted_by_name_length check (char_length(btrim(admitted_by_name)) between 1 and 160),
  admitted_by_job_title text
    constraint training_records_admitted_by_job_title_length
    check (char_length(btrim(admitted_by_job_title)) between 1 and 160),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_records_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  -- Editable and deletable until signatures exist (ADR 021): a training takes its records along.
  constraint training_records_training_of_client
    foreign key (training_id, client_id, phase) references public.trainings (id, client_id, phase)
    on delete cascade on update cascade,
  constraint training_records_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint training_records_training_employee_key unique (training_id, employee_id),
  constraint training_records_admission_whole
    check (num_nulls(admitted_on, admitted_by_name, admitted_by_job_title) in (0, 3)),
  -- The sheets print "admis la lucru" under the workplace training only.
  constraint training_records_admission_on_workplace_training
    check (phase = 'workplace' or admitted_on is null)
);

create index training_records_employee_id_idx on public.training_records (employee_id);
create index training_records_organization_id_idx on public.training_records (organization_id);

comment on table public.training_records is
  'One employee''s attendance at a training held: what the individual training sheets print (ADR 021).';

create trigger trainings_set_updated_at before update on public.trainings
  for each row execute function public.set_updated_at();
create trigger training_records_set_updated_at before update on public.training_records
  for each row execute function public.set_updated_at();

create trigger trainings_protect_archived_client
  before insert or update or delete on public.trainings
  for each row execute function public.protect_rows_of_archived_client();
create trigger training_records_protect_archived_client
  before insert or update or delete on public.training_records
  for each row execute function public.protect_rows_of_archived_client();

create trigger trainings_protect_lead before insert on public.trainings
  for each row execute function public.protect_rows_of_lead();
create trigger training_records_protect_lead before insert on public.training_records
  for each row execute function public.protect_rows_of_lead();

alter table public.trainings enable row level security;
alter table public.training_records enable row level security;
revoke all on table public.trainings from anon;
revoke all on table public.training_records from anon;

create policy "members read their trainings"
  on public.trainings for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members record trainings for their active clients"
  on public.trainings for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
    )
  );

create policy "members update their trainings"
  on public.trainings for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

create policy "members delete their trainings"
  on public.trainings for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members read their training records"
  on public.training_records for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members create training records for their active clients"
  on public.training_records for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
    )
  );

create policy "members update their training records"
  on public.training_records for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

create policy "members delete their training records"
  on public.training_records for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

-- A training never moves to another client, and a record never to another training or person.
revoke update on table public.trainings from authenticated;
grant update (
  domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title,
  verifier_name, verifier_job_title, supplementary_reason, source, themes_revision_id, notes
) on table public.trainings to authenticated;

revoke update on table public.training_records from authenticated;
grant update (admitted_on, admitted_by_name, admitted_by_job_title)
  on table public.training_records to authenticated;

-- A training and its attendees in one transaction. Without p_training_id it records a new one;
-- with it, it replaces the training's facts and attendees, keeping the record, and so the
-- occupation printed, of every attendee who stays. "Admis la lucru" is the same for every
-- attendee. Returns null when the client, or the training under it, is not the caller's to see.
create function public.save_training(
  p_client_id uuid,
  p_domain public.training_domain,
  p_phase public.training_phase,
  p_held_on date,
  p_duration_minutes smallint,
  p_material text,
  p_trainer_name text,
  p_trainer_job_title text,
  p_source public.training_source,
  p_attendees jsonb,
  p_training_id uuid default null,
  p_verifier_name text default null,
  p_verifier_job_title text default null,
  p_supplementary_reason public.supplementary_training_reason default null,
  p_themes_revision_id uuid default null,
  p_notes text default null,
  p_admitted_on date default null,
  p_admitted_by_name text default null,
  p_admitted_by_job_title text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  client_organization_id uuid;
  saved_id uuid;
begin
  select c.organization_id into client_organization_id from public.clients c where c.id = p_client_id;
  if not found then
    return null;
  end if;
  if p_training_id is null then
    insert into public.trainings (
      organization_id, client_id, domain, phase, held_on, duration_minutes, material,
      trainer_name, trainer_job_title, verifier_name, verifier_job_title, supplementary_reason,
      source, themes_revision_id, notes, created_by
    )
    values (
      client_organization_id, p_client_id, p_domain, p_phase, p_held_on, p_duration_minutes,
      p_material, p_trainer_name, p_trainer_job_title, p_verifier_name, p_verifier_job_title,
      p_supplementary_reason, p_source, p_themes_revision_id, p_notes, (select auth.uid())
    )
    returning id into saved_id;
  else
    if not exists (
      select 1 from public.trainings t where t.id = p_training_id and t.client_id = p_client_id
    ) then
      return null;
    end if;
    delete from public.training_records r
    where r.training_id = p_training_id
      and r.employee_id not in (
        select (a.value ->> 'employee_id')::uuid from jsonb_array_elements(p_attendees) as a (value)
      );
    -- The new phase reaches the records through the foreign key, and an admission left on them
    -- would fail its check when the training stops being a workplace one.
    update public.training_records r
    set admitted_on = null, admitted_by_name = null, admitted_by_job_title = null
    where r.training_id = p_training_id and r.admitted_on is not null;
    update public.trainings t set
      domain = p_domain,
      phase = p_phase,
      held_on = p_held_on,
      duration_minutes = p_duration_minutes,
      material = p_material,
      trainer_name = p_trainer_name,
      trainer_job_title = p_trainer_job_title,
      verifier_name = p_verifier_name,
      verifier_job_title = p_verifier_job_title,
      supplementary_reason = p_supplementary_reason,
      source = p_source,
      themes_revision_id = p_themes_revision_id,
      notes = p_notes
    where t.id = p_training_id
    returning t.id into saved_id;
  end if;
  insert into public.training_records (
    organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on,
    admitted_by_name, admitted_by_job_title, created_by
  )
  select
    client_organization_id, p_client_id, saved_id, p_phase, (a.value ->> 'employee_id')::uuid,
    a.value ->> 'occupation', p_admitted_on, p_admitted_by_name, p_admitted_by_job_title,
    (select auth.uid())
  from jsonb_array_elements(p_attendees) as a (value)
  on conflict (training_id, employee_id) do update set
    admitted_on = excluded.admitted_on,
    admitted_by_name = excluded.admitted_by_name,
    admitted_by_job_title = excluded.admitted_by_job_title;
  return saved_id;
end;
$$;

revoke all on function public.save_training(
  uuid, public.training_domain, public.training_phase, date, smallint, text, text, text,
  public.training_source, jsonb, uuid, text, text, public.supplementary_training_reason, uuid,
  text, date, text, text
) from public, anon;
grant execute on function public.save_training(
  uuid, public.training_domain, public.training_phase, date, smallint, text, text, text,
  public.training_source, jsonb, uuid, text, text, public.supplementary_training_reason, uuid,
  text, date, text, text
) to authenticated;

-- One employee's standing in one domain (ADR 021): the interval runs from the last periodic
-- record, else the workplace training record, else the hire date; a supplementary training never
-- moves it. A null interval, undecided or not applicable, leaves no due date and the state
-- current. Days are Romanian days, as the documents date them.
--
-- No search_path setting, and every name qualified instead: a function with one is never
-- inlined, and the employee lists read this once per row.
create function public.employee_training_due(
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
    select (
      coalesce(held.last_periodic_on, held.workplace_trained_on, p_hired_at)
      + pg_catalog.make_interval(months => p_interval_months)
    )::date as due_on
  ) as due
  cross join (select (pg_catalog.now() at time zone 'Europe/Bucharest')::date as day) as today;
$$;

revoke all on function public.employee_training_due(
  uuid, date, public.employee_status, public.training_domain, integer
) from public, anon;
grant execute on function public.employee_training_due(
  uuid, date, public.employee_status, public.training_domain, integer
) to authenticated, service_role;

-- One row per employee with both domains, so that a list filters by either in one embed.
-- Security invoker: each table inside answers to the caller's own policies.
create view public.employee_training_status
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
  psi.state as psi_state
from public.employees e
join public.job_positions p on p.id = e.job_position_id
join public.clients c on c.id = e.client_id
left join public.client_fire_safety f on f.client_id = e.client_id
cross join lateral public.employee_training_due(
  e.id, e.hired_at, e.status, 'ssm',
  coalesce(
    p.training_interval_months,
    case p.staff_category
      when 'execution' then c.worker_training_interval_months
      else c.administrative_training_interval_months
    end
  )
) as ssm
-- A position cannot override the fire-safety interval (#371).
cross join lateral public.employee_training_due(
  e.id, e.hired_at, e.status, 'psi',
  case p.staff_category
    when 'execution' then f.worker_training_interval_months
    else f.administrative_training_interval_months
  end
) as psi;

comment on view public.employee_training_status is
  'Per employee and domain: the last periodic training, the workplace training, the next training due and the training state (ADR 021). Null states for a leaver.';

revoke all on table public.employee_training_status from anon, authenticated;
grant select on table public.employee_training_status to authenticated, service_role;

-- What the employee lists embed as `training_status`: a computed relationship of PostgREST.
-- Rows 1 makes it a to-one embed.
create function public.training_status(public.employees)
returns setof public.employee_training_status
rows 1
language sql
stable
as $$
  select * from public.employee_training_status s where s.employee_id = $1.id;
$$;

revoke all on function public.training_status(public.employees) from public, anon;
grant execute on function public.training_status(public.employees) to authenticated, service_role;
