-- A month over the step of employees (ADR 029, amendment of 2026-11-14): once the calendar month
-- after the count passed the step has ended and it is still over, nothing that raises the count is
-- accepted from a member until the step covers it or the count drops. Triggers, so that a member
-- writing through the data API is refused too, and the reason has a name.
--
--   STP01  the organization has been over its step for a month

alter table public.subscriptions
  -- When the employees last went over the step, kept while they stay over; null within it, and
  -- on a plan without a step. Written only by the functions below.
  add column employees_over_step_since timestamptz;

grant select (employees_over_step_since) on table public.subscriptions to authenticated;

-- The same count as the Abonament tab (apps/api billing `countUsage`).
create function public.organization_employee_count(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.employees e
  join public.clients c on c.id = e.client_id
  where e.organization_id = p_organization_id
    and e.status = 'active'
    and e.archived_at is null
    and c.stage = 'client'
    and c.archived_at is null;
$$;

revoke all on function public.organization_employee_count(uuid) from public, anon, authenticated;

create index employees_organization_counted_idx on public.employees (organization_id, client_id)
  where status = 'active' and archived_at is null;

-- The employees a subscription covers, as `usageLimits` in apps/api billing rules computes it; a
-- test there holds the numbers equal to the plan catalogue. Null for Enterprise, which has no
-- step. A trial counts against its own limit until it ends, as does a row that chose a plan in
-- its trial before choosing began to charge at once.
create function public.employee_limit_of(
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_trial_ends_at timestamptz,
  p_employee_step integer
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_plan = 'enterprise' then null
    when p_status = 'trialing' and p_trial_ends_at > now() then 5000
    else coalesce(p_employee_step, case p_plan when 'start' then 250 else 500 end)
  end;
$$;

revoke all on function public.employee_limit_of(public.subscription_plan, public.subscription_status, timestamptz, integer) from public, anon, authenticated;

-- No clock runs while the organization cannot add employees anyway, canceled or read-only, so
-- subscribing again starts a fresh month rather than an old one already past.
create function public.employees_over_step_limit(s public.subscriptions)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when s.status = 'canceled' or public.access_at(s.access_until) = 'read_only' then null
    else public.employee_limit_of(s.plan, s.status, s.trial_ends_at, s.employee_step)
  end;
$$;

revoke all on function public.employees_over_step_limit(public.subscriptions) from public, anon, authenticated;

-- The last day employees can still be added: one calendar month after the day the clock started,
-- in Romanian time, clamped to the month's last day as Stripe's months are. The block starts when
-- that day ends, so the date shown is a whole day.
create function public.employees_over_step_last_day(p_since timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((p_since at time zone 'Europe/Bucharest')::date + interval '1 month')::date;
$$;

create function public.employees_over_step_blocks_at(p_since timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select ((public.employees_over_step_last_day(p_since) + 1)::timestamp at time zone 'Europe/Bucharest');
$$;

revoke all on function public.employees_over_step_last_day(timestamptz) from public, anon, authenticated;
revoke all on function public.employees_over_step_blocks_at(timestamptz) from public, anon, authenticated;

-- Starts the clock at the moment the count passes the limit and clears it when it is back within,
-- never backdating it. Before it moves the clock the row is locked and counted again, so two
-- changes to one organization's employees count one after the other and neither undoes the
-- other's start. The limit also moves with time alone, when a trial or access ends, so every
-- read below and the daily job call it too.
create function public.refresh_employees_over_step(p_organization_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.subscriptions;
  v_limit integer;
  v_used integer;
  v_since timestamptz;
begin
  select * into v_row from public.subscriptions where organization_id = p_organization_id;
  if not found then
    return null;
  end if;
  -- Every page load reads this, so the lock waits until the clock would move.
  v_limit := public.employees_over_step_limit(v_row);
  if v_limit is null then
    v_since := null;
  elsif public.organization_employee_count(p_organization_id) > v_limit then
    v_since := coalesce(v_row.employees_over_step_since, now());
  end if;
  if v_since is not distinct from v_row.employees_over_step_since then
    return v_since;
  end if;
  v_since := null;
  select * into v_row
  from public.subscriptions
  where organization_id = p_organization_id
  for update;
  v_limit := public.employees_over_step_limit(v_row);
  if v_limit is not null then
    v_used := public.organization_employee_count(p_organization_id);
    if v_used > v_limit then
      v_since := coalesce(v_row.employees_over_step_since, now());
    end if;
  end if;
  if v_since is distinct from v_row.employees_over_step_since then
    update public.subscriptions
    set employees_over_step_since = v_since
    where organization_id = p_organization_id;
    insert into public.subscription_changes (organization_id, source, change, details)
    values (
      p_organization_id,
      'database',
      case when v_since is null then 'employees within step' else 'employees over step' end,
      jsonb_build_object('employees', v_used, 'limit', v_limit)
    );
  end if;
  return v_since;
end;
$$;

revoke all on function public.refresh_employees_over_step(uuid) from public, anon, authenticated;

create function public.organization_employees_blocked(p_organization_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  select employees_over_step_since into v_since
  from public.subscriptions
  where organization_id = p_organization_id;
  -- Within the month nothing is refused, so the count is needed only once it has passed.
  if v_since is null or now() < public.employees_over_step_blocks_at(v_since) then
    return false;
  end if;
  v_since := public.refresh_employees_over_step(p_organization_id);
  return v_since is not null and now() >= public.employees_over_step_blocks_at(v_since);
end;
$$;

revoke all on function public.organization_employees_blocked(uuid) from public, anon, authenticated;

create function public.employees_over_step(p_organization_id uuid)
returns table (
  over_since timestamptz,
  last_day date,
  blocked boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  v_since := public.refresh_employees_over_step(p_organization_id);
  if not exists (select 1 from public.subscriptions where organization_id = p_organization_id) then
    return;
  end if;
  over_since := v_since;
  last_day := case when v_since is not null then public.employees_over_step_last_day(v_since) end;
  blocked := v_since is not null and now() >= public.employees_over_step_blocks_at(v_since);
  return next;
end;
$$;

revoke all on function public.employees_over_step(uuid) from public, anon, authenticated;
grant execute on function public.employees_over_step(uuid) to service_role;

create function public.refresh_all_employees_over_step()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_count integer := 0;
begin
  for v_organization_id in select organization_id from public.subscriptions where plan <> 'enterprise' loop
    perform public.refresh_employees_over_step(v_organization_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.refresh_all_employees_over_step() from public, anon, authenticated;
grant execute on function public.refresh_all_employees_over_step() to service_role;

-- Deferred to the end of the transaction and run once per organization there: an import writes
-- its people one statement at a time, and counting after each would read the whole organization
-- once per person. Statement-level triggers would not help for the same reason. The mark is the
-- statement's, so with the triggers set immediate a later statement refreshes again.
create function public.employees_over_step_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  v_setting text := 'ssm_over_step.o' || replace(v_organization_id::text, '-', '');
begin
  if current_setting(v_setting, true) is not distinct from statement_timestamp()::text then
    return null;
  end if;
  perform set_config(v_setting, statement_timestamp()::text, true);
  perform public.refresh_employees_over_step(v_organization_id);
  return null;
end;
$$;

revoke all on function public.employees_over_step_after_change() from public, anon;

create constraint trigger employees_over_step_after_insert after insert on public.employees
  deferrable initially deferred
  for each row when (new.status = 'active' and new.archived_at is null)
  execute function public.employees_over_step_after_change();

create constraint trigger employees_over_step_after_update
  after update of status, archived_at, client_id on public.employees
  deferrable initially deferred
  for each row when (
    old.status is distinct from new.status
    or old.archived_at is distinct from new.archived_at
    or old.client_id is distinct from new.client_id
  )
  execute function public.employees_over_step_after_change();

create constraint trigger employees_over_step_after_delete after delete on public.employees
  deferrable initially deferred
  for each row when (old.status = 'active' and old.archived_at is null)
  execute function public.employees_over_step_after_change();

create constraint trigger clients_over_step_after_update after update of stage, archived_at on public.clients
  deferrable initially deferred
  for each row when (old.stage is distinct from new.stage or old.archived_at is distinct from new.archived_at)
  execute function public.employees_over_step_after_change();

-- A change of plan, step, trial or access moves the limit, so the clock starts or clears in the
-- same write. Coming back from canceled or read-only starts a fresh month.
create function public.employees_over_step_on_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_since timestamptz;
begin
  v_limit := public.employees_over_step_limit(new);
  if v_limit is not null then
    v_used := public.organization_employee_count(new.organization_id);
    if v_used > v_limit then
      v_since := case
        when tg_op = 'UPDATE' and public.employees_over_step_limit(old) is not null
          then coalesce(old.employees_over_step_since, now())
        else now()
      end;
    end if;
  end if;
  if v_since is distinct from (case when tg_op = 'UPDATE' then old.employees_over_step_since end) then
    insert into public.subscription_changes (organization_id, source, change, details)
    values (
      new.organization_id,
      'database',
      case when v_since is null then 'employees within step' else 'employees over step' end,
      jsonb_build_object('employees', v_used, 'limit', v_limit)
    );
  end if;
  new.employees_over_step_since := v_since;
  return new;
end;
$$;

revoke all on function public.employees_over_step_on_subscription() from public, anon;

create trigger subscriptions_employees_over_step_insert before insert on public.subscriptions
  for each row execute function public.employees_over_step_on_subscription();

create trigger subscriptions_employees_over_step_update
  before update of plan, status, trial_ends_at, access_until, employee_step, stripe_subscription_id
  on public.subscriptions
  for each row execute function public.employees_over_step_on_subscription();

-- Without a user the caller holds the secret key: seeds and maintenance.
create function public.refuse_employees_over_step(p_organization_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and public.organization_employees_blocked(p_organization_id) then
    raise exception 'The organization has been over its step of employees for a month.'
      using errcode = 'STP01';
  end if;
end;
$$;

revoke all on function public.refuse_employees_over_step(uuid) from public, anon, authenticated;

create function public.employee_counts(p_status public.employee_status, p_archived_at timestamptz, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_status = 'active'
    and p_archived_at is null
    and exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.stage = 'client' and c.archived_at is null
    );
$$;

revoke all on function public.employee_counts(public.employee_status, timestamptz, uuid) from public, anon, authenticated;

create function public.protect_employees_over_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.employee_counts(new.status, new.archived_at, new.client_id)
    and (tg_op = 'INSERT' or not public.employee_counts(old.status, old.archived_at, old.client_id))
  then
    perform public.refuse_employees_over_step(new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function public.protect_employees_over_step() from public, anon;

create trigger employees_protect_over_step_insert before insert on public.employees
  for each row when (new.status = 'active' and new.archived_at is null)
  execute function public.protect_employees_over_step();

create trigger employees_protect_over_step_update before update of status, archived_at, client_id on public.employees
  for each row when (
    new.status = 'active'
    and new.archived_at is null
    and (
      old.status is distinct from new.status
      or old.archived_at is distinct from new.archived_at
      or old.client_id is distinct from new.client_id
    )
  )
  execute function public.protect_employees_over_step();

-- Restoring a client brings its employees back into the count; a client without any comes back.
create function public.protect_client_restore_over_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'client'
    and new.archived_at is null
    and (old.stage <> 'client' or old.archived_at is not null)
    and exists (
      select 1 from public.employees e
      where e.client_id = new.id and e.status = 'active' and e.archived_at is null
    )
  then
    perform public.refuse_employees_over_step(new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function public.protect_client_restore_over_step() from public, anon;

create trigger clients_protect_restore_over_step before update of stage, archived_at on public.clients
  for each row when (new.stage = 'client' and new.archived_at is null)
  execute function public.protect_client_restore_over_step();

-- The owner hears of it twice per clock: when it starts, and three days before the last day.
-- `usage_notices.period_start` holds the clock's start, so a new clock is told again.
alter table public.usage_notices
  drop constraint usage_notices_kind_format,
  add constraint usage_notices_kind_format check (kind ~ '^(sms|credits|employees)_[a-z0-9]{1,20}$');

create function public.employees_over_step_notices_due()
returns table (
  organization_id uuid,
  over_since timestamptz,
  kind text,
  employees integer,
  employee_limit integer,
  last_day date
)
language sql
volatile
security definer
set search_path = ''
as $$
  with clocks as (
    select
      s.organization_id,
      s.employees_over_step_since as over_since,
      public.employees_over_step_last_day(s.employees_over_step_since) as last_day,
      case
        when public.employees_over_step_last_day(s.employees_over_step_since)
          - (now() at time zone 'Europe/Bucharest')::date <= 3
        then 'employees_soon'
        else 'employees_over'
      end as kind,
      public.employees_over_step_limit(s) as employee_limit
    from public.subscriptions s
    where s.employees_over_step_since is not null
      and now() < public.employees_over_step_blocks_at(s.employees_over_step_since)
      and public.employees_over_step_limit(s) is not null
  )
  select
    c.organization_id,
    c.over_since,
    c.kind,
    public.organization_employee_count(c.organization_id),
    c.employee_limit,
    c.last_day
  from clocks c
  where not exists (
    select 1 from public.usage_notices n
    where n.organization_id = c.organization_id
      and n.period_start = c.over_since
      and (n.kind = c.kind or n.kind = 'employees_soon')
  );
$$;

revoke all on function public.employees_over_step_notices_due() from public, anon, authenticated;
grant execute on function public.employees_over_step_notices_due() to service_role;

-- Organizations already over their step start their month now.
select public.refresh_all_employees_over_step();
