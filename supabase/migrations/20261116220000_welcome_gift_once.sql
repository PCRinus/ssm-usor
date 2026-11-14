-- The welcome gift is fixed at the first payment: a later step or plan adds nothing, and a lower
-- one takes nothing back (ADR 029, amendment of 2026-11-14). Moving up for a day used to bring the
-- difference for good. Organizations that already got a gift keep what they have.
create or replace function public.grant_welcome_gift(p_organization_id uuid, p_credits int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_credits is null or p_credits < 1 then
    raise exception 'credits_out_of_range' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_organization_id::text, 0));
  if exists (
    select 1 from public.credit_entries e
    where e.organization_id = p_organization_id and e.kind = 'gift'
  ) then
    return 0;
  end if;
  insert into public.credit_entries (organization_id, kind, credits, gift_credits, key)
  values (
    p_organization_id, 'gift', p_credits, p_credits,
    'gift:' || p_organization_id::text || ':' || p_credits::text
  );
  insert into public.subscription_changes (organization_id, source, change, details)
  values (
    p_organization_id,
    'stripe',
    'welcome_gift',
    jsonb_build_object('credits', p_credits, 'gift', p_credits)
  );
  return p_credits;
end;
$$;

revoke all on function public.grant_welcome_gift(uuid, int) from public, anon, authenticated;
grant execute on function public.grant_welcome_gift(uuid, int) to service_role;
