-- ADR 020: a document type may be dated. A dated document carries the year it reports on and a
-- client holds one per year, each with its own revisions; every other type still appears once
-- per client (ADR 005).

-- A year rather than text: the API and the app count with it (the current year, the one before,
-- the one a report proposes measures for) and it sorts as a number. The half-yearly report ADR
-- 020 defers can add its half beside it.
alter table public.client_documents
  add column period smallint
    constraint client_documents_period_range check (period between 2000 and 2100);

-- The list mirrors `datedDocumentTypeKeys` in the contracts.
alter table public.client_documents
  add constraint client_documents_period_only_dated
    check ((period is not null) = (type_key = any (array['fire_annual_report'])));

-- Nulls not distinct, so an undated type still appears once per client.
alter table public.client_documents drop constraint client_documents_type_key;
alter table public.client_documents
  add constraint client_documents_type_key unique nulls not distinct (client_id, type_key, period);

comment on column public.client_documents.period is
  'The year a dated document reports on (ADR 020); null for every other type, which appears once per client.';

-- The clients list counts a dated type as present for the current calendar year only: a report
-- of an earlier year does not stand for this year's.
create or replace view public.client_list
with (security_invoker = true)
as
select
  c.id,
  c.legal_name,
  c.cui,
  c.vat_payer,
  c.caen_code,
  c.trade_register_number,
  c.county_code,
  c.locality,
  c.address_line,
  c.legal_representative_name,
  c.declared_employee_count,
  c.stage,
  c.contact_name,
  c.contact_email,
  c.contact_phone,
  c.promoted_at,
  c.created_at,
  c.updated_at,
  c.archived_at,
  coalesce(c.promoted_at, c.created_at) as client_since,
  coalesce(e.employee_count, 0) as current_employee_count,
  coalesce(d.generated_type_keys, '{}') as documentation_generated_type_keys,
  coalesce(d.issued_count, 0) as documentation_issued_count,
  g.last_generated_at as documentation_last_generated_at,
  coalesce(d.fire_safety_generated_type_keys, '{}') as fire_safety_generated_type_keys,
  coalesce(d.fire_safety_issued_count, 0) as fire_safety_issued_count,
  g.fire_safety_last_generated_at
from public.clients c
left join (
  select client_id, count(*)::integer as employee_count
  from public.employees
  where status = 'active' and archived_at is null
  group by client_id
) e on e.client_id = c.id
-- A document without a revision is what a failed generation leaves behind, not a document.
left join (
  select
    cd.client_id,
    array_agg(cd.type_key order by cd.type_key)
      filter (where cd.document_group = 'documentation_set') as generated_type_keys,
    (count(*) filter (where cd.document_group = 'documentation_set' and r.any_issued))::integer
      as issued_count,
    array_agg(cd.type_key order by cd.type_key)
      filter (where cd.document_group = 'fire_safety_set') as fire_safety_generated_type_keys,
    (count(*) filter (where cd.document_group = 'fire_safety_set' and r.any_issued))::integer
      as fire_safety_issued_count
  from public.client_documents cd
  join (
    select document_id, bool_or(status = 'issued') as any_issued
    from public.document_revisions
    group by document_id
  ) r on r.document_id = cd.id
  where cd.document_group in ('documentation_set', 'fire_safety_set')
    and (cd.period is null
      or cd.period = extract(year from now() at time zone 'Europe/Bucharest')::smallint)
  group by cd.client_id
) d on d.client_id = c.id
left join (
  select
    client_id,
    max(created_at) filter (where document_group = 'documentation_set') as last_generated_at,
    max(created_at) filter (where document_group = 'fire_safety_set')
      as fire_safety_last_generated_at
  from public.document_generations
  group by client_id
) g on g.client_id = c.id;

comment on column public.client_list.fire_safety_generated_type_keys is
  'Type keys of the documents of the fire-safety set that have a revision; a dated type only for the current calendar year.';

-- Only the newest period of a dated type is regenerated in bulk: an earlier year's report is
-- what was written for that year, and a client holds one document per type in each job.
create or replace view public.documents_behind
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
  and (d.period is null or d.period = (
    select max(same_type.period)
    from public.client_documents same_type
    where same_type.client_id = d.client_id and same_type.type_key = d.type_key
  ))
  and exists (
    select 1 from public.document_template_versions later
    where later.template_id = rv.template_id
      and later.version > rv.version
      and later.kind in ('legal', 'correction')
  );
