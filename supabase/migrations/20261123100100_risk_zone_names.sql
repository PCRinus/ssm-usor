-- The zones the organization named before stand in for a library of zones, which was not wanted.
-- Runs as the caller, so the policies keep it to the caller's organization.
create function public.risk_zone_names(p_except_client_id uuid default null)
returns table (name text, measures text)
language sql
stable
set search_path = ''
as $$
  select n.name, n.measures
  from (
    select distinct on (lower(btrim(z.name))) btrim(z.name) as name, z.measures
    from public.risk_zones z
    join public.clients c on c.id = z.client_id
    where c.archived_at is null
      and z.client_id is distinct from p_except_client_id
    order by lower(btrim(z.name)), z.updated_at desc, z.id
  ) as n
  order by n.name collate "ro-x-icu", n.name
  limit 200;
$$;

revoke all on function public.risk_zone_names(uuid) from public, anon;
grant execute on function public.risk_zone_names(uuid) to authenticated;
