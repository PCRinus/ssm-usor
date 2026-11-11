-- ADR 042: a safety data sheet's reading belongs to no import, so its charge and its refund carry
-- no import and are matched by their key.

alter table public.credit_entries
  drop constraint credit_entries_sign,
  add constraint credit_entries_sign check (
    case kind
      when 'import_start' then credits <= 0
      when 'scanned_page' then credits <= 0
      when 'library_part' then credits <= 0
      when 'safety_sheet' then credits <= 0
      when 'import_pages' then credits <> 0
      else credits > 0
    end
  ),
  add constraint credit_entries_safety_sheet check (
    kind not in ('safety_sheet', 'safety_sheet_refund') or import_id is null
  );

create or replace function public.credit_period_counts(
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
    coalesce(-sum(e.credits - e.gift_credits) filter (where e.kind in (
      'import_start', 'import_pages', 'scanned_page', 'refund', 'library_part', 'library_part_refund',
      'safety_sheet', 'safety_sheet_refund'
    )), 0)::int
  from public.credit_entries e
  where e.organization_id = p_organization_id
    and e.created_at >= p_period_start
    and e.created_at < p_period_end;
$$;

create or replace function public.charge_credits(
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
  p_import_part public.import_library_part default null
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
    insert into public.credit_entries (
      organization_id, kind, credits, import_id, import_file_id, page, key, import_part
    )
    values (
      p_organization_id, p_kind, -p_credits, p_import_id, p_import_file_id, p_page, p_key, p_import_part
    );
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
    organization_id, kind, credits, gift_credits, import_id, import_file_id, page, key, import_part
  )
  values (
    p_organization_id, p_kind, -(from_month + from_gift + below), -from_gift,
    p_import_id, p_import_file_id, p_page, p_key, p_import_part
  );

  return query select
    from_month + from_gift + below, false,
    current.balance - from_month - below, current.gift_left - from_gift;
end;
$$;

-- A reading that failed, or a file refused after its charge, gives back what it was charged, the
-- gift's part to the gift, once. Answers what it gave back.
create function public.refund_safety_sheet_credits(p_key text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.credit_entries;
  refund_key text := 'refund:' || p_key;
begin
  select * into charge from public.credit_entries e
  where e.key = p_key and e.kind = 'safety_sheet';
  if not found or charge.credits = 0 then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || charge.organization_id::text, 0));
  if exists (select 1 from public.credit_entries e where e.key = refund_key) then
    return 0;
  end if;
  insert into public.credit_entries (organization_id, kind, credits, gift_credits, key)
  values (
    charge.organization_id, 'safety_sheet_refund', -charge.credits, -charge.gift_credits, refund_key
  );
  return -charge.credits;
end;
$$;

revoke all on function public.refund_safety_sheet_credits(text) from public, anon, authenticated;
grant execute on function public.refund_safety_sheet_credits(text) to service_role;
