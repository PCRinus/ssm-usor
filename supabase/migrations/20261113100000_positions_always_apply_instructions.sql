-- Every post applies at least one specific instruction of each domain (ADR 012, amendment of
-- 2026-11-13): H.G. 1425/2006 art. 93 (2) b) and OMAI 712/2005 art. 16–17 train each worker on
-- the instructions written for their own post, so each decision is only the shadow of the rows:
-- true while the position applies a module of the domain, null otherwise.

update public.job_positions set needs_instructions = null where needs_instructions = false;
update public.job_positions set needs_fire_instructions = null where needs_fire_instructions = false;

comment on column public.job_positions.needs_instructions is
  'Null until the post applies an occupational safety module, which blocks generating 3.2; true while it applies one (ADR 012).';
comment on column public.job_positions.needs_fire_instructions is
  'Null until the post applies a fire-safety module, which blocks generating the fire-safety set; true while it applies one (ADR 012, amendment of 2026-10-11).';

-- The trigger that follows the rows writes these columns as the member, so the update grant
-- stays; this refuses any value the rows do not imply.
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
    if decided is distinct from (case when has_modules then true end) then
      raise exception 'Apply or remove an instruction module instead.' using errcode = 'INS02';
    end if;
  end loop;
  return new;
end;
$$;

alter table public.job_positions
  add constraint job_positions_instructions_never_none check (needs_instructions is distinct from false),
  add constraint job_positions_fire_instructions_never_none check (needs_fire_instructions is distinct from false);
