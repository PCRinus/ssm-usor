-- A column, not an ordering expression, because PostgREST orders by columns only; updated_at
-- is no substitute, as it moves after confirming.
alter table public.imports
  add column closed_at timestamptz generated always as (coalesce(confirmed_at, abandoned_at)) stored;

create index imports_closed_idx on public.imports (organization_id, kind, closed_at desc, id desc)
  where closed_at is not null;

comment on column public.imports.closed_at is
  'When the import was confirmed or abandoned; null while it is open or once it failed.';
