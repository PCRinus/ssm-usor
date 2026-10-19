-- ADR 015, amended 2026-10-19: a client that employs nobody from the sensitive groups declares
-- it, so that a missing evaluation of them is a gap and never a silence.

create type public.sensitive_groups_state as enum ('undecided', 'none', 'evaluated');

alter table public.clients
  add column sensitive_groups_state public.sensitive_groups_state not null default 'undecided';

comment on column public.clients.sensitive_groups_state is
  'Undecided blocks the occupational safety set; none is the client''s declaration that it has no workers from the sensitive groups; evaluated follows their evaluation (ADR 015).';

update public.clients c
set sensitive_groups_state = 'evaluated'
where exists (
  select 1 from public.risk_evaluations e
  where e.client_id = c.id and e.kind = 'sensitive_groups'
);

-- The state agrees with the rows: `evaluated` exactly while the evaluation exists, so a
-- declaration never sits beside an evaluation and nobody writes `evaluated` by hand.
--   SGR01  the sensitive groups state follows their evaluation
create function public.protect_sensitive_groups_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sensitive_groups_state is not distinct from old.sensitive_groups_state then
    return new;
  end if;
  if (new.sensitive_groups_state = 'evaluated') <> exists (
    select 1 from public.risk_evaluations e
    where e.client_id = new.id and e.kind = 'sensitive_groups'
  ) then
    raise exception 'The sensitive groups state follows their evaluation.' using errcode = 'SGR01';
  end if;
  return new;
end;
$$;

create trigger clients_protect_sensitive_groups_state before update on public.clients
  for each row execute function public.protect_sensitive_groups_state();

-- Runs as its owner: the member who starts or deletes the evaluation need not hold the right to
-- change the client's row.
create function public.sync_sensitive_groups_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.kind, old.kind) <> 'sensitive_groups' then
    return coalesce(new, old);
  end if;
  update public.clients
  set sensitive_groups_state = case when tg_op = 'INSERT' then 'evaluated' else 'undecided' end::public.sensitive_groups_state
  where id = coalesce(new.client_id, old.client_id);
  return coalesce(new, old);
end;
$$;

create trigger risk_evaluations_sync_sensitive_groups_state
  after insert or delete on public.risk_evaluations
  for each row execute function public.sync_sensitive_groups_state();

revoke all on function public.protect_sensitive_groups_state() from public, anon;
revoke all on function public.sync_sensitive_groups_state() from public, anon;
