create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() is only stable, because its dictionary is looked up by name at run time, and an
-- index needs an immutable expression. Naming the dictionary with its schema is what makes the
-- promise hold.
create function public.unaccent_immutable(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

comment on function public.unaccent_immutable(text) is
  'The text without diacritics, as unaccent() with its default dictionary; immutable, so indexes can use it.';

-- No `set search_path` here: it would stop the planner inlining the function, and only the
-- inlined expression matches the index. The names inside are schema-qualified instead.
create function public.employee_search_name(public.employees)
returns text
language sql
immutable
parallel safe
as $$
  select lower(public.unaccent_immutable($1.last_name || ' ' || $1.first_name));
$$;

comment on function public.employee_search_name(public.employees) is
  'Last and first name, lowercase and without diacritics, as the employee search matches them.';

create function public.employee_client_search_name(public.employees)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(public.unaccent_immutable(c.legal_name))
  from public.clients c
  where c.id = $1.client_id;
$$;

comment on function public.employee_client_search_name(public.employees) is
  'The employee''s client''s legal name, lowercase and without diacritics, for the organization-wide search. Reads the client as the caller.';

-- Trigram indexes, since a substring match (ILIKE '%term%') cannot use a btree.
create index employees_search_name_idx on public.employees
  using gin (lower(public.unaccent_immutable(last_name || ' ' || first_name)) extensions.gin_trgm_ops);

create index employees_employee_number_search_idx on public.employees
  using gin (employee_number extensions.gin_trgm_ops);
