-- Extras (ADR 029 and ADR 030, amendments of 2026-11-14): past what the plan's step includes, the
-- owner may let signing codes go on by SMS and AI credits be bought in blocks of 100, each kind up
-- to a monthly ceiling in euro. Off by default; an organization with no row for a kind has it off.
--
-- The ceilings are read inside the locked claim and charge, so a claim that runs while the owner
-- lowers or turns off a ceiling sees the new one, and parallel claims cannot pass it together.
-- Each extra code (`sms_sends.overage`) and each block (`credit_extra_blocks`) is one meter event
-- reported to Stripe, its row id the event's identifier.

create type public.usage_extra_kind as enum ('sms', 'credits');

create table public.usage_extras (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.usage_extra_kind not null,
  -- Whole euro, from 1 € to 500 € a month, without VAT.
  ceiling_cents integer not null
    constraint usage_extras_ceiling_range check (
      ceiling_cents between 100 and 50000 and ceiling_cents % 100 = 0
    ),
  updated_at timestamptz not null default now(),
  primary key (organization_id, kind)
);

comment on table public.usage_extras is
  'The kinds of extras an organization''s owner turned on, with their monthly ceiling (ADR 029). No row: off. Service role only.';

create table public.credit_extra_blocks (
  -- Also the meter event's identifier, so Stripe counts a block reported twice once.
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- The subscription month the block was bought in, as the API computed it then.
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- 1 for the month's first block, so two charges racing for the same block collide.
  number integer not null constraint credit_extra_blocks_number_range check (number >= 1),
  created_at timestamptz not null default now(),
  -- When the meter event went to Stripe; set before the call and cleared if it fails.
  reported_at timestamptz,
  constraint credit_extra_blocks_number_unique unique (organization_id, period_start, number),
  constraint credit_extra_blocks_period_order check (period_start < period_end)
);

comment on table public.credit_extra_blocks is
  'Each block of 100 AI credits bought past the month''s and the welcome credits, billed at the next invoice (ADR 030). Service role only.';

create index credit_extra_blocks_organization_idx
  on public.credit_extra_blocks (organization_id, created_at);
create index credit_extra_blocks_unreported_idx on public.credit_extra_blocks (created_at)
  where reported_at is null;

alter table public.usage_extras enable row level security;
alter table public.credit_extra_blocks enable row level security;
revoke all on table public.usage_extras from anon, authenticated;
revoke all on table public.credit_extra_blocks from anon, authenticated;

-- The safety cap the ceiling replaces (ADR 029, amendment of 2026-11-14).
revoke select (sms_cap_factor) on table public.subscriptions from authenticated;
alter table public.subscriptions drop column sms_cap_factor;

-- The same counts, plus the codes billed past the allowance.
drop function public.claim_sms_send(uuid, public.sms_kind, timestamptz, timestamptz, int, int);

-- Decides and records one send before the message leaves.
--   p_allowance   the plan's codes this month; null where nothing limits them
--   p_extra_cents what one extra code costs, when extras may apply at all (a paid subscription in
--                 good standing); null for a hard stop at the allowance
-- Past the allowance a code goes out as overage only while the owner's ceiling covers one more.
-- The ceiling counts the month's extra codes, not all codes, so an allowance raised mid-month by
-- a higher step or a grant never lets the extras pass it.
create function public.claim_sms_send(
  p_organization_id uuid,
  p_kind public.sms_kind,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_extra_cents int
)
returns table (id uuid, refusal text, overage boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  counts record;
  ceiling int;
  is_counted boolean := p_kind = 'signing_code';
  is_overage boolean := false;
  row_id uuid;
begin
  if is_counted and p_allowance is not null then
    perform pg_advisory_xact_lock(hashtextextended('sms_sends:' || p_organization_id::text, 0));
    select * into counts
    from public.sms_period_usage(p_organization_id, p_period_start, p_period_end);
    if counts.used >= p_allowance + counts.granted then
      if p_extra_cents is not null and p_extra_cents > 0 then
        select e.ceiling_cents into ceiling from public.usage_extras e
        where e.organization_id = p_organization_id and e.kind = 'sms';
      end if;
      if ceiling is null then
        return query select null::uuid, 'sms_allowance_reached'::text, false;
        return;
      end if;
      if (counts.overage + 1) * p_extra_cents > ceiling then
        return query select null::uuid, 'sms_ceiling_reached'::text, false;
        return;
      end if;
      is_overage := true;
    end if;
  end if;

  insert into public.sms_sends (organization_id, kind, counted, overage, period_start, period_end)
  values (p_organization_id, p_kind, is_counted, is_overage, p_period_start, p_period_end)
  returning sms_sends.id into row_id;

  return query select row_id, null::text, is_overage;
end;
$$;

revoke all on function public.claim_sms_send(uuid, public.sms_kind, timestamptz, timestamptz, int, int) from public, anon, authenticated;
grant execute on function public.claim_sms_send(uuid, public.sms_kind, timestamptz, timestamptz, int, int) to service_role;

-- An entry's part drawn from blocks of extra credits, as `gift_credits` is its part from the
-- welcome credits, so the month's balance never holds a block's credits: a balance below zero (the
-- 150 a reading may overrun) stays a shortfall for the next month and is never paid off with blocks.
alter table public.credit_entries
  add column extra_credits integer not null default 0,
  add constraint credit_entries_extra_part check (
    case when credits <= 0 then extra_credits between credits - gift_credits and 0
         else extra_credits = 0 end
  );

drop function public.credit_balance(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int);
drop function public.credit_period_counts(uuid, timestamptz, timestamptz);

-- `extra` is the credits bought in blocks in the month, `extra_used` what entries drew from them.
create function public.credit_period_counts(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (granted int, used int, extra int, extra_used int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(e.credits) filter (where e.kind = 'grant'), 0)::int,
    coalesce(-sum(e.credits - e.gift_credits - e.extra_credits) filter (where e.kind in (
      'import_start', 'import_pages', 'scanned_page', 'refund', 'library_part', 'library_part_refund',
      'safety_sheet', 'safety_sheet_refund'
    )), 0)::int,
    (select 100 * count(*)::int from public.credit_extra_blocks b
      where b.organization_id = p_organization_id
        and b.created_at >= p_period_start and b.created_at < p_period_end),
    coalesce(-sum(e.extra_credits), 0)::int
  from public.credit_entries e
  where e.organization_id = p_organization_id
    and e.created_at >= p_period_start
    and e.created_at < p_period_end;
$$;

revoke all on function public.credit_period_counts(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.credit_period_counts(uuid, timestamptz, timestamptz) to service_role;

-- `extra_left` is what the month's blocks still hold; it ends with the month.
create function public.credit_balance(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_previous_allowance int
)
returns table (
  granted int, used int, shortfall int, balance int, gift_left int, extra int, extra_left int
)
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
    return query select counts.granted, counts.used, 0, null::int, gift, counts.extra,
      greatest(0, counts.extra - counts.extra_used);
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
    counts.granted, counts.used, carried, p_allowance + counts.granted - counts.used - carried,
    gift, counts.extra, greatest(0, counts.extra - counts.extra_used);
end;
$$;

revoke all on function public.credit_balance(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid, timestamptz, timestamptz, int, timestamptz, timestamptz, int) to service_role;

drop function public.charge_credits(
  uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int,
  timestamptz, timestamptz, int, public.import_library_part
);

-- Charges under the lock per organization. The order is the month's credits, then the welcome
-- credits, then what the month's blocks still hold, then new blocks of 100 while the owner's
-- ceiling covers them, then, for a charge that is never refused, below zero by at most 150.
-- Blocks are bought only for what this charge still needs: a balance already below zero is not
-- paid off with them. While a ceiling is set, a charge that must be covered is judged on what it
-- can use, the month's credits counting from zero.
--   p_block_cents what a block costs, when extras may apply at all; null buys none
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
  p_previous_allowance int,
  p_import_part public.import_library_part default null,
  p_block_cents int default null
)
returns table (charged int, refused boolean, balance int, gift_left int, extra_blocks int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current record;
  existing public.credit_entries;
  ceiling int;
  bought int := 0;
  blocks_left int := 0;
  blocks int := 0;
  from_month int;
  from_gift int;
  from_extra int;
  rest int;
  below int;
begin
  if p_kind not in ('import_start', 'import_pages', 'scanned_page', 'library_part', 'safety_sheet')
    or p_credits is null or p_credits < 0 or p_key is null
    or (p_kind = 'library_part') <> (p_import_part is not null)
    or (p_kind = 'safety_sheet' and p_import_id is not null) then
    raise exception 'not_a_charge' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_organization_id::text, 0));

  select * into current from public.credit_balance(
    p_organization_id, p_period_start, p_period_end, p_allowance,
    p_previous_start, p_previous_end, p_previous_allowance
  );

  select * into existing from public.credit_entries e where e.key = p_key;
  if found then
    return query select -existing.credits, false, current.balance, current.gift_left, 0;
    return;
  end if;
  if p_import_id is not null and exists (
    select 1 from public.credit_entries e where e.import_id = p_import_id and e.kind = 'refund'
  ) then
    return query select 0, false, current.balance, current.gift_left, 0;
    return;
  end if;

  if current.balance is null then
    insert into public.credit_entries (
      organization_id, kind, credits, import_id, import_file_id, page, key, import_part
    )
    values (
      p_organization_id, p_kind, -p_credits, p_import_id, p_import_file_id, p_page, p_key, p_import_part
    );
    return query select p_credits, false, null::int, current.gift_left, 0;
    return;
  end if;

  if p_block_cents is not null and p_block_cents > 0 then
    select e.ceiling_cents into ceiling from public.usage_extras e
    where e.organization_id = p_organization_id and e.kind = 'credits';
    if ceiling is not null then
      bought := current.extra / 100;
      blocks_left := greatest(0, ceiling / p_block_cents - bought);
    end if;
  end if;

  if p_require and (
    case when ceiling is null then current.balance else greatest(current.balance, 0) end
    + current.gift_left + current.extra_left + 100 * blocks_left
  ) < p_credits then
    return query select 0, true, current.balance, current.gift_left, 0;
    return;
  end if;

  from_month := least(p_credits, greatest(current.balance, 0));
  from_gift := least(p_credits - from_month, current.gift_left);
  rest := p_credits - from_month - from_gift;
  from_extra := least(rest, current.extra_left);
  rest := rest - from_extra;
  if rest > 0 and blocks_left > 0 then
    blocks := least(blocks_left, ceil(rest / 100.0)::int);
    insert into public.credit_extra_blocks (organization_id, period_start, period_end, number)
    select p_organization_id, p_period_start, p_period_end, bought + n
    from generate_series(1, blocks) n;
    from_extra := from_extra + least(rest, 100 * blocks);
    rest := rest - least(rest, 100 * blocks);
  end if;
  below := least(rest, greatest(0, current.balance - from_month + 150));

  perform public.open_credit_period(
    p_organization_id, p_period_start, p_period_end, p_allowance, current.shortfall
  );
  insert into public.credit_entries (
    organization_id, kind, credits, gift_credits, extra_credits, import_id, import_file_id, page,
    key, import_part
  )
  values (
    p_organization_id, p_kind, -(from_month + from_gift + from_extra + below), -from_gift,
    -from_extra, p_import_id, p_import_file_id, p_page, p_key, p_import_part
  );

  return query select
    from_month + from_gift + from_extra + below, false,
    current.balance - from_month - below, current.gift_left - from_gift, blocks;
end;
$$;

revoke all on function public.charge_credits(uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int, timestamptz, timestamptz, int, public.import_library_part, int) from public, anon, authenticated;
grant execute on function public.charge_credits(uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int, timestamptz, timestamptz, int, public.import_library_part, int) to service_role;
