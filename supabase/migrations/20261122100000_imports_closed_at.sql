-- A computed field, not a stored generated column: imports_set_updated_at's `when` reads
-- to_jsonb(new), which Postgres refuses on a table with stored generated columns.
-- No `set search_path`, so that the planner inlines it and orders by imports_closed_idx; it names
-- nothing a search path could resolve.
create function public.closed_at(public.imports)
returns timestamptz
language sql
immutable
as $$
  select coalesce($1.confirmed_at, $1.abandoned_at);
$$;

comment on function public.closed_at(public.imports) is
  'When the import was confirmed or abandoned (a failed import abandoned at its failed_at); null while it is open or failed.';

revoke all on function public.closed_at(public.imports) from public, anon;
grant execute on function public.closed_at(public.imports) to authenticated, service_role;

create index imports_closed_idx
  on public.imports (organization_id, kind, (coalesce(confirmed_at, abandoned_at)) desc, id desc)
  where status in ('confirmed', 'abandoned');
