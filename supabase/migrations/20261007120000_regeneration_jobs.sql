-- Bulk regeneration (ADR 017): which documents are behind their template, and the jobs that
-- regenerate one document type for every client behind it, one queue message per client.

-- Security invoker, so each table inside answers to the caller's own policies; the API's
-- queue consumer reads it with the secret key and filters by organization itself. The service
-- contract is left out: its data comes from its own page, so it is never regenerated in bulk.
create view public.documents_behind
with (security_invoker = true)
as
with newest_revision as (
  select distinct on (r.document_id)
    r.document_id, r.template_version_id, r.status, r.edited_at
  from public.document_revisions r
  order by r.document_id, r.revision desc
),
newest_version as (
  select distinct on (tv.template_id)
    tv.template_id, tv.version, tv.kind, tv.note
  from public.document_template_versions tv
  order by tv.template_id, tv.version desc
)
select
  d.organization_id,
  d.type_key,
  t.title as template_title,
  nv.version as newest_version,
  nv.kind as newest_kind,
  nv.note as newest_note,
  d.id as document_id,
  d.client_id,
  c.legal_name as client_name,
  rv.version as revision_version,
  nr.status = 'draft' and nr.edited_at is not null as edited_draft
from public.client_documents d
join public.clients c on c.id = d.client_id
join newest_revision nr on nr.document_id = d.id
join public.document_template_versions rv on rv.id = nr.template_version_id
join public.document_templates t on t.id = rv.template_id
join newest_version nv on nv.template_id = rv.template_id
where c.archived_at is null
  and c.stage = 'client'
  and d.document_group <> 'other'
  and exists (
    select 1 from public.document_template_versions later
    where later.template_id = rv.template_id
      and later.version > rv.version
      and later.kind in ('legal', 'correction')
  );

comment on view public.documents_behind is
  'Documents of active clients whose newest revision was generated from a template version older than a legal or correction version of the same template. Counts only what the caller may read.';
comment on column public.documents_behind.revision_version is
  'The template version the newest revision was generated from.';
comment on column public.documents_behind.edited_draft is
  'The newest revision is a draft saved by hand since it was generated; regenerating it discards those edits.';

revoke all on table public.documents_behind from anon, authenticated;
grant select on table public.documents_behind to authenticated, service_role;

create table public.regeneration_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  type_key text not null constraint regeneration_jobs_type_key_format check (type_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  -- The member the regenerated documents name as their specialist, as if they had regenerated
  -- each one: during an impersonation, the impersonated member.
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  total_count integer not null constraint regeneration_jobs_total_count_positive check (total_count >= 1),
  done_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  finished_at timestamptz,
  constraint regeneration_jobs_counts_range check (
    done_count >= 0 and skipped_count >= 0 and failed_count >= 0
    and done_count + skipped_count + failed_count <= total_count
  ),
  constraint regeneration_jobs_finished_when_counted check (
    (finished_at is not null) = (done_count + skipped_count + failed_count = total_count)
  )
);

create unique index regeneration_jobs_one_running_key
  on public.regeneration_jobs (organization_id, type_key) where finished_at is null;
create index regeneration_jobs_organization_idx on public.regeneration_jobs (organization_id, requested_at desc);

create table public.regeneration_job_items (
  job_id uuid not null references public.regeneration_jobs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  status text not null default 'queued'
    constraint regeneration_job_items_status_check check (status in ('queued', 'done', 'skipped', 'failed')),
  -- Why it was skipped or failed, in Romanian, for members.
  detail text constraint regeneration_job_items_detail_length check (char_length(detail) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (job_id, client_id)
);

create index regeneration_job_items_client_idx on public.regeneration_job_items (client_id);

comment on table public.regeneration_jobs is
  'One document type regenerated for every client behind it, through a queue (ADR 017).';
comment on table public.regeneration_job_items is
  'One client of a regeneration job, and what became of its document.';

-- An unfinished job of the same type older than an hour is closed first, its waiting clients
-- failed: a message the queue gave up on leaves its item waiting, and the type would otherwise
-- stay locked. One still running raises unique_violation (23505).
create function public.start_regeneration_job(
  p_organization_id uuid,
  p_type_key text,
  p_requested_by uuid,
  p_client_ids uuid[]
)
returns public.regeneration_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_stale uuid;
  v_clients uuid[];
  v_job public.regeneration_jobs;
begin
  v_clients := array(
    select c.id from public.clients c
    where c.id = any (p_client_ids) and c.organization_id = p_organization_id
  );

  select j.id into v_stale
  from public.regeneration_jobs j
  where j.organization_id = p_organization_id
    and j.type_key = p_type_key
    and j.finished_at is null
    and j.requested_at < now() - interval '1 hour'
  for update;
  if found then
    with failed as (
      update public.regeneration_job_items
      set status = 'failed', detail = 'Regenerarea nu s-a încheiat într-o oră.', updated_at = now()
      where job_id = v_stale and status = 'queued'
      returning 1
    )
    update public.regeneration_jobs
    set failed_count = failed_count + (select count(*) from failed), finished_at = now()
    where id = v_stale;
  end if;

  insert into public.regeneration_jobs (organization_id, type_key, requested_by, total_count)
  values (p_organization_id, p_type_key, p_requested_by, cardinality(v_clients))
  returning * into v_job;

  insert into public.regeneration_job_items (job_id, client_id)
  select v_job.id, client_id from unnest(v_clients) as client_id;

  return v_job;
end;
$$;

-- An item that is no longer waiting is left as it is and false comes back, so a message the
-- queue delivers twice is counted once.
create function public.record_regeneration_item(
  p_job_id uuid,
  p_client_id uuid,
  p_status text,
  p_detail text
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_status not in ('done', 'skipped', 'failed') then
    raise exception 'An item ends done, skipped or failed.' using errcode = '22023';
  end if;

  update public.regeneration_job_items
  set status = p_status, detail = p_detail, updated_at = now()
  where job_id = p_job_id and client_id = p_client_id and status = 'queued';
  if not found then
    return false;
  end if;

  update public.regeneration_jobs
  set done_count = done_count + (p_status = 'done')::integer,
      skipped_count = skipped_count + (p_status = 'skipped')::integer,
      failed_count = failed_count + (p_status = 'failed')::integer,
      finished_at = case
        when done_count + skipped_count + failed_count + 1 = total_count then now()
      end
  where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.start_regeneration_job(uuid, text, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.record_regeneration_item(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.start_regeneration_job(uuid, text, uuid, uuid[]) to service_role;
grant execute on function public.record_regeneration_item(uuid, uuid, text, text) to service_role;

alter table public.regeneration_jobs enable row level security;
alter table public.regeneration_job_items enable row level security;

revoke all on table public.regeneration_jobs from anon;
revoke all on table public.regeneration_job_items from anon;

-- Members read; jobs are written with the secret key, by the API and its queue consumer.
revoke insert, update, delete, truncate on table public.regeneration_jobs from authenticated;
revoke insert, update, delete, truncate on table public.regeneration_job_items from authenticated;

create policy "members read their regeneration jobs"
  on public.regeneration_jobs for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members read the items of their regeneration jobs"
  on public.regeneration_job_items for select to authenticated
  using (exists (select 1 from public.regeneration_jobs j where j.id = regeneration_job_items.job_id));
