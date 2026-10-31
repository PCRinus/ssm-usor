-- SMS usage (ADR 029, "Limits and usage", amended 2026-10-31): a log of every SMS the API sends,
-- the codes granted by hand, the safety cap, and which usage notices went out. Only signing codes
-- count against the allowance; the other kinds are logged for support and cost.
--
-- Every table here is the service role's alone: the API counts and reports, and the members read
-- the counts through it.

create type public.sms_kind as enum (
  'participant_invitation',
  'sign_in_code',
  'signing_code',
  'signature_request'
);

alter table public.subscriptions
  -- When the first invoice with an amount was paid. Until then a chosen plan's signing codes stop
  -- at its allowance: choosing and cancelling before the first charge costs nothing, so extra SMS
  -- in that window could never be billed.
  add column first_paid_at timestamptz,
  -- Stripe's billing_cycle_anchor: the SMS month starts on its day, on an annual plan too.
  add column billing_anchor_at timestamptz,
  -- The safety cap as a multiple of the plan's allowance, so a change of plan moves it along.
  add column sms_cap_factor smallint not null default 3
    constraint subscriptions_sms_cap_factor_range check (sms_cap_factor between 3 and 20);

grant select (first_paid_at, billing_anchor_at, sms_cap_factor)
  on table public.subscriptions to authenticated;

update public.subscriptions s
set first_paid_at = paid.first_at
from (
  select i.organization_id, min(coalesce(i.issued_at, i.created_at)) as first_at
  from public.billing_invoices i
  where i.storno_of is null and i.amount_cents > 0
  group by i.organization_id
) paid
where paid.organization_id = s.organization_id;

create table public.sms_sends (
  -- Also the meter event's identifier, so Stripe counts a code reported twice once.
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.sms_kind not null,
  counted boolean not null,
  -- Past the allowance and below the cap, after the first payment: billed as a metered line.
  overage boolean not null default false,
  -- The subscription month the send fell in, as the API computed it then.
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- The provider's message id; null while the message is on its way, or when it was only logged.
  provider_id text
    constraint sms_sends_provider_id_length check (char_length(provider_id) between 1 and 100),
  created_at timestamptz not null default now(),
  -- Null until the provider took the message; a row that stays null still counts, since it may
  -- have gone out.
  sent_at timestamptz,
  -- When the meter event went to Stripe; set before the call and cleared if it fails.
  reported_at timestamptz,
  constraint sms_sends_only_signing_codes_count check (not counted or kind = 'signing_code'),
  constraint sms_sends_overage_is_counted check (not overage or counted),
  constraint sms_sends_reported_overage check (reported_at is null or overage),
  constraint sms_sends_period_order check (period_start < period_end)
);

comment on table public.sms_sends is
  'Every SMS the API sent, by organization and kind; only signing codes count (ADR 029). No phone number is kept. Service role only.';

create index sms_sends_counted_idx on public.sms_sends (organization_id, created_at)
  where counted;
create index sms_sends_unreported_idx on public.sms_sends (sent_at)
  where overage and reported_at is null;

create table public.sms_code_grants (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  codes int not null constraint sms_code_grants_codes_range check (codes between 1 and 10000),
  reason text not null
    constraint sms_code_grants_reason_length check (char_length(btrim(reason)) between 3 and 500),
  -- The GitHub account that ran the workflow.
  actor text not null
    constraint sms_code_grants_actor_length check (char_length(btrim(actor)) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint sms_code_grants_period_order check (period_start < period_end)
);

comment on table public.sms_code_grants is
  'Signing codes added by hand to one month of an organization, with who and why (ADR 029). Service role only.';

create index sms_code_grants_organization_idx
  on public.sms_code_grants (organization_id, period_start);

create table public.usage_notices (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start timestamptz not null,
  -- sms_80, sms_100, sms_cap; credits_* once credits exist.
  kind text not null
    constraint usage_notices_kind_format check (kind ~ '^(sms|credits)_[a-z0-9]{1,20}$'),
  sent_at timestamptz not null default now(),
  primary key (organization_id, period_start, kind)
);

comment on table public.usage_notices is
  'Which usage warning went to an organization in which month, so each goes once (ADR 029). Service role only.';

alter table public.sms_sends enable row level security;
alter table public.sms_code_grants enable row level security;
alter table public.usage_notices enable row level security;

revoke all on table public.sms_sends from anon, authenticated;
revoke all on table public.sms_code_grants from anon, authenticated;
revoke all on table public.usage_notices from anon, authenticated;

create function public.sms_period_usage(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (used int, overage int, granted int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.sms_sends s
      where s.organization_id = p_organization_id and s.counted
        and s.created_at >= p_period_start and s.created_at < p_period_end),
    (select count(*)::int from public.sms_sends s
      where s.organization_id = p_organization_id and s.overage
        and s.created_at >= p_period_start and s.created_at < p_period_end),
    (select coalesce(sum(g.codes), 0)::int from public.sms_code_grants g
      where g.organization_id = p_organization_id
        and g.period_start < p_period_end and g.period_end > p_period_start);
$$;

revoke all on function public.sms_period_usage(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.sms_period_usage(uuid, timestamptz, timestamptz) to service_role;

-- Decides and records one send before the message leaves, so two codes asked for at once cannot
-- both take the last one. The API computes the month and the limits; this counts and decides.
--   p_allowance  the plan's codes this month; null where nothing limits them
--   p_cap        the safety cap; null for a hard stop at the allowance
-- Grants raise both. A refusal records nothing.
create function public.claim_sms_send(
  p_organization_id uuid,
  p_kind public.sms_kind,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_cap int
)
returns table (id uuid, refusal text, overage boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  counts record;
  is_counted boolean := p_kind = 'signing_code';
  is_overage boolean := false;
  row_id uuid;
begin
  if is_counted and p_allowance is not null then
    perform pg_advisory_xact_lock(hashtextextended('sms_sends:' || p_organization_id::text, 0));
    select * into counts
    from public.sms_period_usage(p_organization_id, p_period_start, p_period_end);
    if counts.used >= p_allowance + counts.granted then
      if p_cap is null then
        return query select null::uuid, 'sms_allowance_reached'::text, false;
        return;
      end if;
      if counts.used >= p_cap + counts.granted then
        return query select null::uuid, 'sms_cap_reached'::text, false;
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

-- Run with the secret key by the "Adaugă coduri de semnare prin SMS" workflow, which finds the
-- organization and its month first.
--   22023  a reason, or who runs it, is missing
create function public.grant_signing_codes(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_codes int,
  p_reason text,
  p_actor text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  total int;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'actor_required' using errcode = '22023';
  end if;

  insert into public.sms_code_grants (organization_id, period_start, period_end, codes, reason, actor)
  values (p_organization_id, p_period_start, p_period_end, p_codes, btrim(p_reason), btrim(p_actor));

  insert into public.subscription_changes (organization_id, source, change, reason, details)
  values (
    p_organization_id,
    'workflow',
    'signing_codes_granted',
    btrim(p_reason),
    jsonb_build_object(
      'codes', p_codes,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'actor', btrim(p_actor)
    )
  );

  select u.granted into total
  from public.sms_period_usage(p_organization_id, p_period_start, p_period_end) u;
  return total;
end;
$$;

revoke all on function public.grant_signing_codes(uuid, timestamptz, timestamptz, int, text, text) from public, anon, authenticated;
grant execute on function public.grant_signing_codes(uuid, timestamptz, timestamptz, int, text, text) to service_role;
