-- ADR 018, amended 2026-10-11: a client's list of dangerous substances, or its declaration that it
-- uses none, which document 5.3 prints either way.

create type public.fire_substances_state as enum ('undecided', 'none', 'listed');

alter table public.client_fire_safety
  add column substances_state public.fire_substances_state not null default 'undecided';

comment on column public.client_fire_safety.substances_state is
  'Undecided blocks the fire-safety set; none is a declaration, not an empty list; listed generates only with an entry (ADR 018).';

grant update (substances_state) on table public.client_fire_safety to authenticated;

-- The name, the CLP classification and the quantity are what a provider sees on the product; the
-- other texts are copied from the safety data sheet and print as a gap when empty.
create table public.fire_substances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null constraint fire_substances_name_length check (char_length(btrim(name)) between 2 and 160),
  classification text not null
    constraint fire_substances_classification_length check (char_length(btrim(classification)) between 2 and 600),
  -- Free text: a quantity is held in cylinders, cans or litres, often several of them.
  quantity text not null constraint fire_substances_quantity_length check (char_length(btrim(quantity)) between 1 and 160),
  physical_chemical_properties text
    constraint fire_substances_properties_length check (char_length(btrim(physical_chemical_properties)) between 2 and 1000),
  identification_codes text
    constraint fire_substances_codes_length check (char_length(btrim(identification_codes)) between 2 and 600),
  health_environment_risks text
    constraint fire_substances_risks_length check (char_length(btrim(health_environment_risks)) between 2 and 1000),
  protection_means text
    constraint fire_substances_protection_length check (char_length(btrim(protection_means)) between 2 and 1000),
  intervention_measures text
    constraint fire_substances_intervention_length check (char_length(btrim(intervention_measures)) between 2 and 1000),
  extinguishing_agents text
    constraint fire_substances_agents_length check (char_length(btrim(extinguishing_agents)) between 2 and 600),
  storage_place text
    constraint fire_substances_storage_length check (char_length(btrim(storage_place)) between 2 and 600),
  handling text constraint fire_substances_handling_length check (char_length(btrim(handling)) between 2 and 1000),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_substances_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create index fire_substances_client_order_idx on public.fire_substances (client_id, sort_order);
create index fire_substances_organization_id_idx on public.fire_substances (organization_id);

comment on table public.fire_substances is
  'A client''s dangerous substances, one row per substance, printed by the list 5.3 (ADR 018).';

create trigger fire_substances_set_updated_at before update on public.fire_substances
  for each row execute function public.set_updated_at();

create trigger fire_substances_protect_archived_client
  before insert or update or delete on public.fire_substances
  for each row execute function public.protect_rows_of_archived_client();

create trigger fire_substances_protect_lead before insert on public.fire_substances
  for each row execute function public.protect_rows_of_lead();

-- Entries exist only under a client that lists them, so a declared "none" never sits beside
-- entries and the state is never inferred from the rows. Runs as the person making the change,
-- so the policies still decide what each query sees.
create function public.require_listed_fire_substances()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.client_fire_safety
    where client_id = new.client_id and substances_state = 'listed'
  ) then
    raise exception 'The client does not list its dangerous substances.' using errcode = 'SUB02';
  end if;
  return new;
end;
$$;

create trigger fire_substances_require_listed before insert on public.fire_substances
  for each row execute function public.require_listed_fire_substances();

create function public.protect_fire_substances_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.substances_state is not distinct from old.substances_state
    or new.substances_state = 'listed' then
    return new;
  end if;
  if exists (select 1 from public.fire_substances where client_id = new.client_id) then
    raise exception 'The client has dangerous substances listed.' using errcode = 'SUB01';
  end if;
  return new;
end;
$$;

create trigger client_fire_safety_protect_substances_state before update on public.client_fire_safety
  for each row execute function public.protect_fire_substances_state();

revoke all on function public.require_listed_fire_substances() from public, anon;
revoke all on function public.protect_fire_substances_state() from public, anon;

alter table public.fire_substances enable row level security;
revoke all on table public.fire_substances from anon;

create policy "members read their fire substances"
  on public.fire_substances for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create fire substances for their active clients"
  on public.fire_substances for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members update their fire substances"
  on public.fire_substances for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

create policy "members delete their fire substances"
  on public.fire_substances for delete to authenticated
  using (organization_id = public.current_organization_id());

-- The freeze reads the client of the row before the change, so a row never moves to another client.
revoke update on table public.fire_substances from authenticated;
grant update (
  name, classification, quantity, physical_chemical_properties, identification_codes,
  health_environment_risks, protection_means, intervention_measures, extinguishing_agents,
  storage_place, handling, sort_order
) on table public.fire_substances to authenticated;
