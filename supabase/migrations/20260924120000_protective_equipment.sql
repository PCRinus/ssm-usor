-- Protective equipment (ADR 011): what the holders of a job position wear or use against the
-- risks of the post, recorded as entries on the position. The internal list (document 6) is
-- generated from them.

-- How an item reaches the worker: issued and replaced when its duration runs out, kept at the
-- workplace and shared, or used up and restocked (Ordinul 225/1995 pct. 2.3 and 2.5 name the
-- first two; consumables are what a duration column cannot say).
create type public.equipment_allocation as enum (
  'personal_inventory',
  'section_inventory',
  'consumable'
);

-- Null: undecided, which blocks generating the documentation. False: the post needs none.
-- True: it has entries; the triggers below keep the value in step with the entries, so it is
-- never set to true by hand.
alter table public.job_positions add column needs_protective_equipment boolean;

comment on column public.job_positions.needs_protective_equipment is
  'Null until decided; false when the post needs none; true while it has equipment entries (ADR 011).';

grant update (needs_protective_equipment) on table public.job_positions to authenticated;

create table public.job_position_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  job_position_id uuid not null,
  risk text not null constraint job_position_equipment_risk_length check (char_length(btrim(risk)) between 1 and 240),
  item text not null constraint job_position_equipment_item_length check (char_length(btrim(item)) between 1 and 240),
  -- Granted at once: two pairs of gloves per period, one helmet.
  quantity smallint not null default 1 constraint job_position_equipment_quantity_range check (quantity between 1 and 999),
  duration_months smallint constraint job_position_equipment_duration_range check (duration_months between 1 and 120),
  allocation public.equipment_allocation not null default 'personal_inventory',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The entries go with a position deleted as a mistake; one anyone held is archived, not
  -- deleted, and keeps them.
  constraint job_position_equipment_position_in_client
    foreign key (job_position_id, client_id) references public.job_positions (id, client_id) on delete cascade,
  constraint job_position_equipment_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  -- A duration means nothing for a consumable and everything for inventory.
  constraint job_position_equipment_duration_by_allocation
    check ((allocation = 'consumable') = (duration_months is null))
);

create index job_position_equipment_job_position_id_idx on public.job_position_equipment (job_position_id);
create index job_position_equipment_organization_id_idx on public.job_position_equipment (organization_id);

comment on table public.job_position_equipment is
  'The protective equipment the holders of a job position receive (ADR 011).';

create trigger job_position_equipment_set_updated_at before update on public.job_position_equipment
  for each row execute function public.set_updated_at();

create trigger job_position_equipment_protect_archived_client
  before insert or update or delete on public.job_position_equipment
  for each row execute function public.protect_rows_of_archived_client();

-- The position's decision follows its entries: the first entry decides "needs equipment",
-- deleting the last one leaves the question open again. Runs as the person changing the
-- entries, so the policies on the position still decide.
create function public.follow_job_position_equipment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.job_positions set needs_protective_equipment = true
    where id = new.job_position_id and needs_protective_equipment is distinct from true;
    return new;
  end if;
  if not exists (
    select 1 from public.job_position_equipment where job_position_id = old.job_position_id
  ) then
    update public.job_positions set needs_protective_equipment = null
    where id = old.job_position_id and needs_protective_equipment is not null;
  end if;
  return old;
end;
$$;

create trigger job_position_equipment_follow after insert or delete on public.job_position_equipment
  for each row execute function public.follow_job_position_equipment();

-- "Needs none" and entries contradict each other; "needs equipment" without entries is not a
-- state either. The triggers above are the only path to true.
create function public.protect_job_position_equipment_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  has_entries boolean;
begin
  if new.needs_protective_equipment is not distinct from old.needs_protective_equipment then
    return new;
  end if;
  select exists (
    select 1 from public.job_position_equipment where job_position_id = new.id
  ) into has_entries;
  if new.needs_protective_equipment = false and has_entries then
    raise exception 'The position has equipment entries.' using errcode = 'EQP01';
  end if;
  if new.needs_protective_equipment = true and not has_entries then
    raise exception 'Add an equipment entry instead.' using errcode = 'EQP02';
  end if;
  return new;
end;
$$;

create trigger job_positions_protect_equipment_decision before update on public.job_positions
  for each row execute function public.protect_job_position_equipment_decision();

revoke all on function public.follow_job_position_equipment() from public, anon;
revoke all on function public.protect_job_position_equipment_decision() from public, anon;

-- Row-level security ------------------------------------------------------------------------

alter table public.job_position_equipment enable row level security;
revoke all on table public.job_position_equipment from anon;

create policy "members read their equipment entries"
  on public.job_position_equipment for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create equipment entries for their active clients"
  on public.job_position_equipment for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their equipment entries"
  on public.job_position_equipment for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their equipment entries"
  on public.job_position_equipment for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.job_position_equipment from authenticated;
grant update (risk, item, quantity, duration_months, allocation)
  on table public.job_position_equipment to authenticated;
