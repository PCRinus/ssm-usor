-- No `set search_path` here: it would stop the planner inlining the function, and the
-- organization-wide employee search runs it for the client of every employee it looks at. The
-- names inside are schema-qualified instead.
create function public.client_search_name(public.clients)
returns text
language sql
immutable
parallel safe
as $$
  select lower(public.unaccent_immutable($1.legal_name));
$$;

comment on function public.client_search_name(public.clients) is
  'The legal name, lowercase and without diacritics, as the organization-wide employee search matches it.';
