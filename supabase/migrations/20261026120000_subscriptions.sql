-- Subscriptions and the trial (ADR 029, phase 1).
--
-- Access is derived from `access_until`, never set by a job: full until then, read-only after.
-- An organization without a row has full access indefinitely: the seeded ones, the end-to-end
-- accounts and every organization created before billing existed.

create type public.subscription_plan as enum ('start', 'profesional', 'enterprise');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type public.access_level as enum ('full', 'read_only');

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  trial_ends_at timestamptz,
  -- When full access ends; null while nothing is due to end.
  access_until timestamptz,
  -- A trial sends no SMS (ADR 029); a tester's may, at the full allowance of its plan.
  trial_sms boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_trial_has_end
    check (status <> 'trialing' or trial_ends_at is not null),
  -- Only a renewing paid plan may run without an end; anything else without one would be free
  -- access forever.
  constraint subscriptions_access_ends
    check (status = 'active' or access_until is not null)
);

comment on table public.subscriptions is 'An organization''s plan, status and dates (ADR 029). Written only by security-definer functions and the secret key.';

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.subscription_changes (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  changed_at timestamptz not null default now(),
  -- onboarding, workflow; later stripe and admin.
  source text not null
    constraint subscription_changes_source_length check (char_length(source) between 1 and 40),
  change text not null
    constraint subscription_changes_change_length check (char_length(change) between 1 and 60),
  reason text
    constraint subscription_changes_reason_length check (char_length(reason) <= 500),
  details jsonb not null default '{}'
    constraint subscription_changes_details_object check (jsonb_typeof(details) = 'object')
);

comment on table public.subscription_changes is 'Every change to a subscription, with who made it and why (ADR 029). Read by nobody through the data API.';

create index subscription_changes_organization_idx
  on public.subscription_changes (organization_id, changed_at desc);

alter table public.subscriptions enable row level security;
alter table public.subscription_changes enable row level security;

revoke all on table public.subscriptions from anon;
revoke insert, update, delete, truncate on table public.subscriptions from authenticated;
revoke all on table public.subscription_changes from anon, authenticated;

create policy "members read their organization's subscription"
  on public.subscriptions for select to authenticated
  using (organization_id = public.current_organization_id());

create function public.access_at(access_until timestamptz)
returns public.access_level
language sql
stable
set search_path = ''
as $$
  select case
    when access_until is null or now() < access_until then 'full'
    else 'read_only'
  end::public.access_level;
$$;

revoke all on function public.access_at(timestamptz) from public, anon;
grant execute on function public.access_at(timestamptz) to authenticated, service_role;

-- Both lookups carry the access, so the API checks it on every request without another call.
-- The return types change, so the functions are dropped and made again with their grants.
drop function public.current_membership();

create function public.current_membership()
returns table (
  user_id uuid,
  organization_id uuid,
  role public.organization_role,
  access public.access_level
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.organization_id, m.role, public.access_at(s.access_until)
  from public.organization_members m
  left join public.subscriptions s on s.organization_id = m.organization_id
  where m.user_id = public.effective_user_id();
$$;

revoke all on function public.current_membership() from public, anon;
grant execute on function public.current_membership() to authenticated, service_role;

drop function public.current_participations();

create function public.current_participations()
returns table (
  participant_id uuid,
  organization_id uuid,
  organization_name text,
  client_id uuid,
  client_name text,
  kind public.participant_kind,
  employee_id uuid,
  full_name text,
  notice_version text,
  language text,
  access public.access_level
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.organization_id,
    o.name,
    p.client_id,
    c.legal_name,
    p.kind,
    p.employee_id,
    coalesce(e.last_name || ' ' || e.first_name, p.full_name),
    p.notice_version,
    p.language,
    public.access_at(s.access_until)
  from public.client_participants p
  join public.organizations o on o.id = p.organization_id
  join public.clients c on c.id = p.client_id
  left join public.employees e on e.id = p.employee_id
  left join public.subscriptions s on s.organization_id = p.organization_id
  where p.user_id = auth.uid() and p.revoked_at is null
  order by c.legal_name, p.created_at;
$$;

revoke all on function public.current_participations() from public, anon;
grant execute on function public.current_participations() to authenticated, service_role;

create or replace function public.create_organization(
  organization_name text,
  owner_full_name text,
  accepted_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  organization uuid;
  trial_end timestamptz := now() + interval '30 days';
begin
  if caller is null or not exists (
    select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null
  ) then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  if exists (select 1 from public.organization_members m where m.user_id = caller) then
    raise exception 'already_in_organization' using errcode = 'ORG01';
  end if;

  insert into public.organizations (name, terms_version, terms_accepted_at, terms_accepted_by)
  values (btrim(organization_name), accepted_terms_version, now(), caller)
  returning id into organization;

  -- One organization per user is the primary key's rule. Two submissions at once both pass
  -- the check above; the second fails here and takes its organization row down with it.
  begin
    insert into public.organization_members (user_id, organization_id, role)
    values (caller, organization, 'owner');
  exception when unique_violation then
    raise exception 'already_in_organization' using errcode = 'ORG01';
  end;

  insert into public.profiles (user_id, full_name, terms_version, terms_accepted_at)
  values (caller, btrim(owner_full_name), accepted_terms_version, now())
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        terms_version = excluded.terms_version,
        terms_accepted_at = excluded.terms_accepted_at;

  insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
  values (organization, 'profesional', 'trialing', trial_end, trial_end);

  insert into public.subscription_changes (organization_id, source, change, details)
  values (organization, 'onboarding', 'trial_started', jsonb_build_object('trial_ends_at', trial_end));

  return organization;
end;
$$;

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
  p_with_sms boolean
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
    organization_id, plan, status, trial_ends_at, access_until, trial_sms
  )
  values (target, 'profesional', 'trialing', p_until, p_until, coalesce(p_with_sms, false))
  on conflict on constraint subscriptions_pkey do update
    set trial_ends_at = excluded.trial_ends_at,
        access_until = excluded.access_until,
        trial_sms = excluded.trial_sms;

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
      'sms', coalesce(p_with_sms, false)
    )
  );

  return query select target, target_name, p_until, previous is null;
end;
$$;

revoke all on function public.extend_trial(text, timestamptz, text, text, boolean) from public, anon, authenticated;
grant execute on function public.extend_trial(text, timestamptz, text, text, boolean) to service_role;
