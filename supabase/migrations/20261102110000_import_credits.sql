-- Import credits (ADR 030, "Usage is counted in credits"; ADR 029, "Limits and usage"): a ledger
-- of what imports use and what is given back or added, and each month's opening, from which an
-- organization's balance is computed. The plan's monthly allowance is not stored: the API computes
-- it from the plan, so moving up to Profesional raises the month's credits at once. The API also
-- computes the months (the subscription's, as for SMS) and passes them in; these functions count
-- and decide.
--
-- Every table here is the service role's alone: members read their balance through the API.

create type public.credit_entry_kind as enum (
  -- What an import needs before its reading: 25 for a client's documents, one per photograph,
  -- and every page of an employee import.
  'import_start',
  -- An employee import's pages as the extractor counted them, against those the browser counted.
  'import_pages',
  -- One scanned page of a client's PDF, charged as the reading finds it.
  'scanned_page',
  -- Everything an import was charged, given back when it fails on our side.
  'refund',
  -- Added by hand by the "Adaugă credite" workflow.
  'grant',
  -- The welcome gift of the first payment, and its difference on moving up to Profesional.
  'gift'
);

alter table public.import_files
  -- The pages the browser counted in an employee import's PDF before the upload; an estimate,
  -- which the extractor's count replaces once the file is prepared.
  add column declared_pages integer
    constraint import_files_declared_pages_range check (declared_pages between 1 and 1000);

create table public.credit_entries (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.credit_entry_kind not null,
  -- Negative for what an import used, positive for what is given back or added.
  credits integer not null,
  -- The part of `credits` taken from (negative) or added to (positive) the welcome gift; the rest
  -- is the month's. Kept at the time of the entry, since the month's credits are used first.
  gift_credits integer not null default 0,
  -- Kept when an abandoned import is deleted with its files: the credits stay used.
  import_id uuid references public.imports (id) on delete set null,
  import_file_id uuid references public.import_files (id) on delete set null,
  page integer constraint credit_entries_page_range check (page between 1 and 1000),
  -- One per import step, scanned page, refund or gift, so a step the queue delivers again, or a
  -- webhook Stripe sends twice, is counted once.
  key text constraint credit_entries_key_unique unique
    constraint credit_entries_key_length check (char_length(key) between 1 and 200),
  reason text
    constraint credit_entries_reason_length check (char_length(btrim(reason)) between 3 and 500),
  -- The GitHub account that ran the workflow.
  actor text
    constraint credit_entries_actor_length check (char_length(btrim(actor)) between 1 and 100),
  created_at timestamptz not null default now(),
  -- A scanned page found past the floor of 150 below zero is recorded at nothing.
  constraint credit_entries_sign check (
    case kind
      when 'import_start' then credits <= 0
      when 'scanned_page' then credits <= 0
      when 'import_pages' then credits <> 0
      else credits > 0
    end
  ),
  constraint credit_entries_gift_part check (
    case when credits <= 0 then gift_credits between credits and 0
         else gift_credits between 0 and credits end
  ),
  constraint credit_entries_gift_whole check (kind <> 'gift' or gift_credits = credits),
  constraint credit_entries_grant_month check (kind <> 'grant' or gift_credits = 0),
  constraint credit_entries_grant_why check (
    kind <> 'grant' or (reason is not null and actor is not null)
  ),
  constraint credit_entries_scanned_page check (kind <> 'scanned_page' or page is not null)
);

comment on table public.credit_entries is
  'What imports used and what was given back, granted by hand or gifted, in credits (ADR 030). Service role only.';

create index credit_entries_organization_idx on public.credit_entries (organization_id, created_at);
create index credit_entries_import_idx on public.credit_entries (import_id) where import_id is not null;
create index credit_entries_import_file_idx on public.credit_entries (import_file_id)
  where import_file_id is not null;

-- A month's opening, written by its first charge or grant. It keeps what a later month needs to
-- know about it: the shortfall carried in, fixed once the month began, and the largest allowance
-- the month had, which a downgrade at the renewal would otherwise hide.
create table public.credit_periods (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  allowance integer not null constraint credit_periods_allowance_range check (allowance >= 0),
  -- How far below zero the month before ended; at most 150, the scanned pages one import reads.
  shortfall integer not null default 0
    constraint credit_periods_shortfall_range check (shortfall between 0 and 150),
  created_at timestamptz not null default now(),
  primary key (organization_id, period_start),
  constraint credit_periods_order check (period_start < period_end)
);

comment on table public.credit_periods is
  'Each month of an organization''s credits that saw a charge or a grant, with the shortfall carried in (ADR 030). Service role only.';

alter table public.credit_entries enable row level security;
alter table public.credit_periods enable row level security;

revoke all on table public.credit_entries from anon, authenticated;
revoke all on table public.credit_periods from anon, authenticated;

-- Charges count net of their refunds in the month they fall in; only the month's part counts,
-- since the gift is a balance of its own.
create function public.credit_period_counts(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (granted int, used int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(e.credits) filter (where e.kind = 'grant'), 0)::int,
    coalesce(-sum(e.credits - e.gift_credits)
      filter (where e.kind in ('import_start', 'import_pages', 'scanned_page', 'refund')), 0)::int
  from public.credit_entries e
  where e.organization_id = p_organization_id
    and e.created_at >= p_period_start
    and e.created_at < p_period_end;
$$;

revoke all on function public.credit_period_counts(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.credit_period_counts(uuid, timestamptz, timestamptz) to service_role;

-- The month's balance and the gift's.
--   p_allowance           the month's credits from the plan; null where nothing limits them
--   p_previous_*          the month before, whose shortfall comes off this one; null for none
-- `balance` is null where nothing limits the credits.
create function public.credit_balance(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_previous_allowance int
)
returns table (granted int, used int, shortfall int, balance int, gift_left int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  counts record;
  before record;
  opening public.credit_periods;
  previous public.credit_periods;
  carried int := 0;
  gift int;
begin
  select * into counts
  from public.credit_period_counts(p_organization_id, p_period_start, p_period_end);
  select coalesce(sum(e.gift_credits), 0)::int into gift
  from public.credit_entries e
  where e.organization_id = p_organization_id;

  if p_allowance is null then
    return query select counts.granted, counts.used, 0, null::int, gift;
    return;
  end if;

  select * into opening from public.credit_periods c
  where c.organization_id = p_organization_id and c.period_start = p_period_start;
  if found then
    carried := opening.shortfall;
  elsif p_previous_start is not null and p_previous_allowance is not null then
    select * into previous from public.credit_periods c
    where c.organization_id = p_organization_id and c.period_start = p_previous_start;
    select * into before
    from public.credit_period_counts(p_organization_id, p_previous_start, p_previous_end);
    carried := least(150, greatest(0, -(
      greatest(p_previous_allowance, previous.allowance)
      + before.granted - before.used - coalesce(previous.shortfall, 0)
    )));
  end if;

  return query select
    counts.granted, counts.used, carried, p_allowance + counts.granted - counts.used - carried, gift;
end;
$$;

revoke all on function public.credit_balance(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int) to service_role;

create function public.open_credit_period(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_shortfall int
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.credit_periods as c (organization_id, period_start, period_end, allowance, shortfall)
  values (p_organization_id, p_period_start, p_period_end, p_allowance, p_shortfall)
  on conflict (organization_id, period_start) do update
    set period_end = greatest(c.period_end, excluded.period_end),
        allowance = greatest(c.allowance, excluded.allowance);
$$;

revoke all on function public.open_credit_period(uuid, timestamptz, timestamptz, int, int) from public, anon, authenticated;

-- Charges what an import uses, under a lock per organization so two imports started at once
-- cannot both take the last credits. The month's credits go first, then the gift, then the month
-- goes below zero, never more than 150.
--   p_require  refuse, recording nothing, unless the balance covers it all: an import's start, and
--              an employee import's pages; a scanned page found during a reading is never refused
-- A key already recorded answers what it charged then. An import already refunded is charged
-- nothing more: a page read after its failure was recorded is ours.
create function public.charge_credits(
  p_organization_id uuid,
  p_kind public.credit_entry_kind,
  p_credits int,
  p_import_id uuid,
  p_import_file_id uuid,
  p_page int,
  p_key text,
  p_require boolean,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_previous_allowance int
)
returns table (charged int, refused boolean, balance int, gift_left int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current record;
  existing public.credit_entries;
  from_month int;
  from_gift int;
  below int;
begin
  if p_kind not in ('import_start', 'import_pages', 'scanned_page') or p_credits is null
    or p_credits < 0 or p_key is null then
    raise exception 'not_a_charge' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_organization_id::text, 0));

  select * into current from public.credit_balance(
    p_organization_id, p_period_start, p_period_end, p_allowance,
    p_previous_start, p_previous_end, p_previous_allowance
  );

  select * into existing from public.credit_entries e where e.key = p_key;
  if found then
    return query select -existing.credits, false, current.balance, current.gift_left;
    return;
  end if;
  if p_import_id is not null and exists (
    select 1 from public.credit_entries e where e.import_id = p_import_id and e.kind = 'refund'
  ) then
    return query select 0, false, current.balance, current.gift_left;
    return;
  end if;

  if current.balance is null then
    insert into public.credit_entries (organization_id, kind, credits, import_id, import_file_id, page, key)
    values (p_organization_id, p_kind, -p_credits, p_import_id, p_import_file_id, p_page, p_key);
    return query select p_credits, false, null::int, current.gift_left;
    return;
  end if;

  if p_require and current.balance + current.gift_left < p_credits then
    return query select 0, true, current.balance, current.gift_left;
    return;
  end if;

  from_month := least(p_credits, greatest(current.balance, 0));
  from_gift := least(p_credits - from_month, current.gift_left);
  below := least(p_credits - from_month - from_gift, greatest(0, current.balance - from_month + 150));

  perform public.open_credit_period(
    p_organization_id, p_period_start, p_period_end, p_allowance, current.shortfall
  );
  insert into public.credit_entries (
    organization_id, kind, credits, gift_credits, import_id, import_file_id, page, key
  )
  values (
    p_organization_id, p_kind, -(from_month + from_gift + below), -from_gift,
    p_import_id, p_import_file_id, p_page, p_key
  );

  return query select
    from_month + from_gift + below, false,
    current.balance - from_month - below, current.gift_left - from_gift;
end;
$$;

revoke all on function public.charge_credits(uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int, timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.charge_credits(uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int, timestamptz, timestamptz, int) to service_role;

-- An employee import whose PDFs have fewer pages than the browser counted gets the rest back,
-- to the gift first as far as the import took from it, since the month's credits run out.
create function public.give_back_import_credits(p_import_id uuid, p_credits int, p_key text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  from_gift int;
begin
  if p_credits is null or p_credits < 1 or p_key is null then
    raise exception 'not_a_give_back' using errcode = '22023';
  end if;
  select i.organization_id into org from public.imports i where i.id = p_import_id;
  if org is null then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || org::text, 0));
  if exists (select 1 from public.credit_entries e where e.key = p_key) then
    return 0;
  end if;
  select greatest(0, -coalesce(sum(e.gift_credits), 0))::int into from_gift
  from public.credit_entries e
  where e.import_id = p_import_id;
  insert into public.credit_entries (organization_id, kind, credits, gift_credits, import_id, key)
  values (org, 'import_pages', p_credits, least(p_credits, from_gift), p_import_id, p_key);
  return p_credits;
end;
$$;

revoke all on function public.give_back_import_credits(uuid, int, text) from public, anon, authenticated;
grant execute on function public.give_back_import_credits(uuid, int, text) to service_role;

-- Everything an import was charged, given back once, the gift's part to the gift. The refund
-- counts in the month it is made.
create function public.refund_import_credits(p_import_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  total int;
  gift int;
begin
  select i.organization_id into org from public.imports i where i.id = p_import_id;
  if org is null then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || org::text, 0));
  if exists (select 1 from public.credit_entries e where e.key = 'refund:' || p_import_id::text) then
    return 0;
  end if;
  select -coalesce(sum(e.credits), 0)::int, -coalesce(sum(e.gift_credits), 0)::int
  into total, gift
  from public.credit_entries e
  where e.import_id = p_import_id;
  if total <= 0 then
    return 0;
  end if;
  insert into public.credit_entries (organization_id, kind, credits, gift_credits, import_id, key)
  values (org, 'refund', total, greatest(0, least(gift, total)), p_import_id, 'refund:' || p_import_id::text);
  return total;
end;
$$;

revoke all on function public.refund_import_credits(uuid) from public, anon, authenticated;
grant execute on function public.refund_import_credits(uuid) to service_role;

-- Every way an import fails runs through this: the pipeline, the queue's dead letters and the
-- daily clean-up. An import that fails while running failed on our side or before its reading
-- was done (ADR 030), so it gets everything back; one failed from `ready` was left after its
-- reading, which is not refunded. An import that fails or is abandoned while still uploading has
-- a charge only if its start broke off between the charge and the move to `preparing`.
create function public.refund_credits_of_failed_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refund_import_credits(new.id);
  return null;
end;
$$;

revoke all on function public.refund_credits_of_failed_import() from public, anon, authenticated;

create trigger imports_refund_credits
  after update of status on public.imports
  for each row
  when (
    (new.status = 'failed' and old.status not in ('ready', 'failed'))
    or (new.status = 'abandoned' and old.status = 'uploading')
  )
  execute function public.refund_credits_of_failed_import();

-- Run with the secret key by the "Adaugă credite" workflow, which finds the organization and its
-- month first. Answers the month's balance after the grant.
--   22023  a reason, or who runs it, is missing, or the credits are out of range
create function public.grant_credits(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_previous_allowance int,
  p_credits int,
  p_reason text,
  p_actor text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  current record;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_credits is null or p_credits not between 1 and 100000 then
    raise exception 'credits_out_of_range' using errcode = '22023';
  end if;
  if p_allowance is null then
    raise exception 'credits_unlimited' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_organization_id::text, 0));

  select * into current from public.credit_balance(
    p_organization_id, p_period_start, p_period_end, p_allowance,
    p_previous_start, p_previous_end, p_previous_allowance
  );
  perform public.open_credit_period(
    p_organization_id, p_period_start, p_period_end, p_allowance, current.shortfall
  );
  insert into public.credit_entries (organization_id, kind, credits, reason, actor)
  values (p_organization_id, 'grant', p_credits, btrim(p_reason), btrim(p_actor));

  insert into public.subscription_changes (organization_id, source, change, reason, details)
  values (
    p_organization_id,
    'workflow',
    'credits_granted',
    btrim(p_reason),
    jsonb_build_object(
      'credits', p_credits,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'actor', btrim(p_actor)
    )
  );

  return current.balance + p_credits;
end;
$$;

revoke all on function public.grant_credits(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int, int, text, text) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int, int, text, text) to service_role;

-- Brings the welcome gift up to the plan's: the whole gift at the first payment, and the
-- difference once on moving up from Start to Profesional. A lower plan's gift adds nothing.
-- Answers what it added.
create function public.grant_welcome_gift(p_organization_id uuid, p_credits int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  given int;
begin
  if p_credits is null or p_credits < 1 then
    raise exception 'credits_out_of_range' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_organization_id::text, 0));
  select coalesce(sum(e.credits), 0)::int into given
  from public.credit_entries e
  where e.organization_id = p_organization_id and e.kind = 'gift';
  if given >= p_credits then
    return 0;
  end if;
  insert into public.credit_entries (organization_id, kind, credits, gift_credits, key)
  values (
    p_organization_id, 'gift', p_credits - given, p_credits - given,
    'gift:' || p_organization_id::text || ':' || p_credits::text
  );
  insert into public.subscription_changes (organization_id, source, change, details)
  values (
    p_organization_id,
    'stripe',
    'welcome_gift',
    jsonb_build_object('credits', p_credits - given, 'gift', p_credits)
  );
  return p_credits - given;
end;
$$;

revoke all on function public.grant_welcome_gift(uuid, int) from public, anon, authenticated;
grant execute on function public.grant_welcome_gift(uuid, int) to service_role;

-- Organizations that paid before credits existed get their plan's gift now: 2,500 on Start,
-- 10,000 on Profesional (`welcomeCredits` in packages/contracts/src/billing.ts).
select public.grant_welcome_gift(
  s.organization_id,
  case s.plan when 'start' then 2500 else 10000 end
)
from public.subscriptions s
where s.first_paid_at is not null and s.plan in ('start', 'profesional');
