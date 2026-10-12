-- ADR 012, amendment of 2026-10-11: an instruction module belongs to one of the two sets, and a
-- job position decides about the modules of each apart. One library: the domain is a column,
-- not a second table.

create type public.instruction_domain as enum ('ssm', 'psi');

alter table public.instruction_modules
  add column domain public.instruction_domain not null default 'ssm';

comment on column public.instruction_modules.domain is
  'The set whose own instructions annex the module: ssm for the occupational safety one (3.2), psi for the fire-safety one (2.1).';

grant update (domain) on table public.instruction_modules to authenticated;

-- The row says which of the position's two decisions it belongs to, so the decision triggers and
-- the reads by domain need no join. The default keeps every row applied before this an
-- occupational safety one.
alter table public.job_position_instructions
  add column domain public.instruction_domain not null default 'ssm';

create index job_position_instructions_position_domain_idx
  on public.job_position_instructions (job_position_id, domain);

comment on column public.job_position_instructions.domain is
  'The module''s domain when it was applied, which decides which of the position''s two decisions the row belongs to.';

alter table public.job_positions add column needs_fire_instructions boolean;

comment on column public.job_positions.needs_fire_instructions is
  'Null until decided; false when the post needs no fire-safety module; true while it applies one (ADR 012, amendment of 2026-10-11).';

grant update (needs_fire_instructions) on table public.job_positions to authenticated;

-- A module is applied only in its own domain, and keeps its domain while a current position
-- applies it. An archived position is never restored, so its rows stay as they were applied
-- rather than locking the module's domain for good; a foreign key on the domain would do that.
create function public.protect_instruction_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'instruction_modules' then
    if new.domain is distinct from old.domain and exists (
      select 1 from public.job_position_instructions i
      join public.job_positions p on p.id = i.job_position_id
      where i.module_id = new.id and p.archived_at is null
    ) then
      raise exception 'The module is applied by a job position.' using errcode = 'INS07';
    end if;
    return new;
  end if;
  -- Another organization's module is not looked at here: the foreign key refuses it.
  if exists (
    select 1 from public.instruction_modules m
    where m.id = new.module_id
      and m.organization_id = new.organization_id
      and m.domain is distinct from new.domain
  ) then
    raise exception 'The module belongs to the other domain.' using errcode = 'INS06';
  end if;
  return new;
end;
$$;

create trigger instruction_modules_protect_domain before update of domain on public.instruction_modules
  for each row execute function public.protect_instruction_domain();

create trigger job_position_instructions_protect_domain before insert on public.job_position_instructions
  for each row execute function public.protect_instruction_domain();

revoke all on function public.protect_instruction_domain() from public, anon;

create or replace function public.follow_job_position_instructions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.domain = 'psi' then
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
    if old.domain = 'psi' then
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
  foreach checked in array array['ssm', 'psi']::public.instruction_domain[] loop
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
