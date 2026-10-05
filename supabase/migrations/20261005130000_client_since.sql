-- A computed field so that the list of clients sorts by it: PostgREST orders by columns and
-- computed fields, not by expressions.
create function public.client_since(public.clients)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce($1.promoted_at, $1.created_at);
$$;

comment on function public.client_since(public.clients) is
  'When the company became a client: its promotion for a former lead, otherwise its creation.';
