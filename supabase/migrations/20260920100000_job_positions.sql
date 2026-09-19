-- Job positions (ADR 006): the posts a client employs people in, as occupational safety
-- sees them. A position belongs to the client and exists whether or not anyone holds it; an
-- employee is assigned to one. `employees.job_title` stays, and from here on means the title
-- in the employment contract, a fact of its own that usually reads the same.

-- The two kinds of staff the training decision gives an interval each.
create type public.staff_category as enum ('technical_administrative', 'execution');

create table public.job_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null constraint job_positions_name_length check (char_length(btrim(name)) between 2 and 160),
  -- The shorter interval by default, so a mistake errs towards training too often.
  staff_category public.staff_category not null default 'execution',
  -- The kind of place the work happens in ("Birou", "Atelier, teren"). Not a workplace, which
  -- is an address.
  work_zone text constraint job_positions_work_zone_length check (char_length(btrim(work_zone)) between 1 and 120),
  -- What the person in it actually does; tells apart two positions close in name.
  activities text constraint job_positions_activities_length check (char_length(btrim(activities)) between 1 and 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A position someone was assigned to is archived, never deleted: history refers to it.
  archived_at timestamptz,
  constraint job_positions_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  -- Lets an employee reference the position together with its client.
  constraint job_positions_id_client_key unique (id, client_id)
);

-- One name per client, whatever its case or the spaces around it. An archived position
-- releases its name.
create unique index job_positions_client_name_key
  on public.job_positions (client_id, lower(btrim(name))) where archived_at is null;
create index job_positions_organization_id_idx on public.job_positions (organization_id);

comment on table public.job_positions is 'The posts a client employs people in, as occupational safety sees them (ADR 006).';

create trigger job_positions_set_updated_at before update on public.job_positions
  for each row execute function public.set_updated_at();

-- Employees ---------------------------------------------------------------------------------

alter table public.employees add column job_position_id uuid;

-- One position per distinct title per client, merging titles that differ only in case or in
-- the spaces around them. The spelling kept is the one entered first.
insert into public.job_positions (organization_id, client_id, name, created_by, created_at)
select distinct on (e.client_id, lower(btrim(e.job_title)))
  e.organization_id, e.client_id, btrim(e.job_title), e.created_by, e.created_at
from public.employees e
order by e.client_id, lower(btrim(e.job_title)), e.created_at, e.id;

update public.employees e
set job_position_id = p.id
from public.job_positions p
where p.client_id = e.client_id and lower(btrim(p.name)) = lower(btrim(e.job_title));

alter table public.employees
  alter column job_position_id set not null,
  add constraint employees_job_position_in_client
    foreign key (job_position_id, client_id) references public.job_positions (id, client_id) on delete restrict;

create index employees_job_position_id_idx on public.employees (job_position_id);

comment on column public.employees.job_title is 'The title in the employment contract (funcția din contract). Not the job position, which it usually matches.';
comment on column public.employees.job_position_id is 'The post the person fills (ADR 006). One per employee.';

-- An employee entered without a position gets the one named like their contract title,
-- created if the client does not have it yet: the rule of the backfill above, kept for every
-- later insert. It runs as the person inserting, so the policies below still decide.
create function public.default_employee_job_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_position_id is not null then
    return new;
  end if;
  select p.id into new.job_position_id
  from public.job_positions p
  where p.client_id = new.client_id
    and lower(btrim(p.name)) = lower(btrim(new.job_title))
    and p.archived_at is null;
  if new.job_position_id is null then
    insert into public.job_positions (organization_id, client_id, name, created_by)
    values (new.organization_id, new.client_id, btrim(new.job_title), new.created_by)
    returning id into new.job_position_id;
  end if;
  return new;
end;
$$;

create trigger employees_default_job_position before insert on public.employees
  for each row execute function public.default_employee_job_position();

-- A position cannot be archived from under the people who work in it. People who have left,
-- and rows archived as mistakes, do not count.
create function public.protect_held_job_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null and exists (
    select 1 from public.employees e
    where e.job_position_id = old.id and e.status <> 'terminated' and e.archived_at is null
  ) then
    raise exception 'Employees still hold this job position.' using errcode = 'JOB01';
  end if;
  return new;
end;
$$;

create trigger job_positions_protect_held before update on public.job_positions
  for each row execute function public.protect_held_job_position();

revoke all on function public.default_employee_job_position() from public, anon;
revoke all on function public.protect_held_job_position() from public, anon;

-- Row-level security ------------------------------------------------------------------------

alter table public.job_positions enable row level security;
revoke all on table public.job_positions from anon;

create policy "members read their job positions"
  on public.job_positions for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create job positions for their active clients"
  on public.job_positions for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their job positions"
  on public.job_positions for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

-- Deleting is for a position entered by mistake; one that an employee points at is
-- kept by the foreign key above, whoever asks.
create policy "members delete their job positions"
  on public.job_positions for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.job_positions from authenticated;
grant update (name, staff_category, work_zone, activities, archived_at)
  on table public.job_positions to authenticated;
