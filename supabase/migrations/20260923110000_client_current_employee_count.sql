-- A computed field: PostgREST selects and sorts by it like a column. Security invoker, so it
-- counts only what the caller's row policies let them see. The parameter is unnamed because
-- that is how the generated types tell a computed field from an RPC.
create function public.current_employee_count(public.clients)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.employees e
  where e.client_id = $1.id
    and e.status = 'active'
    and e.archived_at is null;
$$;

comment on function public.current_employee_count(public.clients) is
  'Employees of the client who have not left: the headcount the documents go by (ADR 010). The declared count is for leads.';

comment on column public.clients.declared_employee_count is
  'Headcount a lead declares before it has an employee list; a client goes by current_employee_count.';
