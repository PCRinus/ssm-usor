-- Computed fields for the list of clients, which shows what each client still needs. Like
-- current_employee_count they are security invoker, so they count only what the caller's row
-- policies let them see, and their parameter is unnamed so that the generated types read them
-- as computed fields.

create function public.job_position_count(public.clients)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.job_positions p
  where p.client_id = $1.id
    and p.archived_at is null;
$$;

comment on function public.job_position_count(public.clients) is
  'Job positions of the client that are not archived.';

-- Only whether an evaluation exists: whether it is complete depends on the risk levels, which
-- the API computes.
create function public.job_positions_needing_work_count(public.clients)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.job_positions p
  where p.client_id = $1.id
    and p.archived_at is null
    and (
      p.needs_protective_equipment is null
      or p.needs_instructions is null
      or not exists (select 1 from public.risk_evaluations e where e.job_position_id = p.id)
    );
$$;

comment on function public.job_positions_needing_work_count(public.clients) is
  'Current job positions with the equipment or the instructions undecided, or without a risk evaluation.';

-- A document without a revision is what a failed generation leaves behind, not a document.
create function public.documentation_generated_type_keys(public.clients)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(d.type_key order by d.type_key), '{}')
  from public.client_documents d
  where d.client_id = $1.id
    and d.document_group = 'documentation_set'
    and exists (select 1 from public.document_revisions r where r.document_id = d.id);
$$;

comment on function public.documentation_generated_type_keys(public.clients) is
  'Type keys of the documents of the documentation set that have a revision.';

create function public.documentation_issued_count(public.clients)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.client_documents d
  where d.client_id = $1.id
    and d.document_group = 'documentation_set'
    and exists (
      select 1 from public.document_revisions r where r.document_id = d.id and r.status = 'issued'
    );
$$;

comment on function public.documentation_issued_count(public.clients) is
  'Documents of the documentation set that have an issued revision.';

create function public.documentation_last_generated_at(public.clients)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(g.created_at)
  from public.document_generations g
  where g.client_id = $1.id;
$$;

comment on function public.documentation_last_generated_at(public.clients) is
  'When documents of the set were last generated, all of them or one again; null before the first time.';
