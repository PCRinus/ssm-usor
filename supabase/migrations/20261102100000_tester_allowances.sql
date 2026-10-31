-- One tester switch in place of "with SMS" (ADR 029, "Tester trials", amended 2026-10-31): it
-- gives a tester's trial both what an ordinary trial lacks, signing codes by SMS and, once credits
-- exist, the monthly credits, each with a hard stop at its limit. The rename keeps every value
-- and the members' column grant.

alter table public.subscriptions rename column trial_sms to tester_allowances;

comment on column public.subscriptions.tester_allowances is
  'A tester''s trial: SMS with 300 signing codes a month and 1,500 credits a month, both stopping hard at the limit (ADR 029).';

-- The parameter's name changes, which `create or replace` cannot do.
drop function public.extend_trial(text, timestamptz, text, text, boolean);

-- Errors the workflow reports:
--   TRL01  no organization has an owner with that email
--   TRL02  the organization pays for a plan; its trial is over
--   TRL03  the new end is not in the future
--   TRL04  the new end is not later than the trial's current end
--   TRL05  more than one owner has that email
--   22023  a reason, or who runs it, is missing

-- A tester's trial gets a later end: never a discount (ADR 029). Run with the secret key by the
-- "Extinde perioada de probă" workflow until the admin area exists. An organization without a
-- subscription starts a trial here, which puts a free account on a clock, so the result says
-- whether it started one.
create function public.extend_trial(
  p_owner_email text,
  p_until timestamptz,
  p_reason text,
  p_actor text,
  p_tester boolean
)
returns table (
  organization_id uuid,
  organization_name text,
  trial_ends_at timestamptz,
  started boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owners int;
  target uuid;
  target_name text;
  previous public.subscriptions;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'actor_required' using errcode = '22023';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'trial_end_not_in_future' using errcode = 'TRL03';
  end if;

  select count(*), min(o.id::text)::uuid into owners, target
  from auth.users u
  join public.organization_members m on m.user_id = u.id and m.role = 'owner'
  join public.organizations o on o.id = m.organization_id
  where lower(u.email) = lower(btrim(p_owner_email));
  if owners = 0 then
    raise exception 'owner_not_found' using errcode = 'TRL01';
  end if;
  if owners > 1 then
    raise exception 'owner_ambiguous' using errcode = 'TRL05';
  end if;
  select o.name into target_name from public.organizations o where o.id = target;

  select * into previous from public.subscriptions s where s.organization_id = target for update;
  if found and previous.status <> 'trialing' then
    raise exception 'subscription_not_in_trial' using errcode = 'TRL02';
  end if;
  if found and p_until <= previous.trial_ends_at then
    raise exception 'trial_end_not_later' using errcode = 'TRL04';
  end if;

  insert into public.subscriptions as s (
    organization_id, plan, status, trial_ends_at, access_until, tester_allowances
  )
  values (target, 'profesional', 'trialing', p_until, p_until, coalesce(p_tester, false))
  on conflict on constraint subscriptions_pkey do update
    set trial_ends_at = excluded.trial_ends_at,
        access_until = excluded.access_until,
        tester_allowances = excluded.tester_allowances;

  insert into public.subscription_changes (organization_id, source, change, reason, details)
  values (
    target,
    'workflow',
    case when previous is null then 'trial_started' else 'trial_extended' end,
    btrim(p_reason),
    jsonb_build_object(
      'from', previous.trial_ends_at,
      'to', p_until,
      'actor', btrim(p_actor),
      'tester', coalesce(p_tester, false)
    )
  );

  return query select target, target_name, p_until, previous is null;
end;
$$;

revoke all on function public.extend_trial(text, timestamptz, text, text, boolean) from public, anon, authenticated;
grant execute on function public.extend_trial(text, timestamptz, text, text, boolean) to service_role;
