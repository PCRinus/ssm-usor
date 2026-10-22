-- An issued revision is frozen, so a module edited in the library after issuing reached nobody
-- (ADR 014, amendment of 2026-10-22): the documents citing modules are behind like those behind
-- their template, and the same regeneration brings the change in.

drop view public.documents_behind;

create view public.documents_behind
with (security_invoker = true)
as
with newest_revision as (
  select distinct on (r.document_id)
    r.document_id, r.template_version_id, r.status, r.edited_at, r.data_snapshot
  from public.document_revisions r
  order by r.document_id, r.revision desc
),
newest_version as (
  select distinct on (tv.template_id)
    tv.template_id, tv.version, tv.kind, tv.note
  from public.document_template_versions tv
  order by tv.template_id, tv.version desc
),
current_document as (
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
    nr.status = 'draft' and nr.edited_at is not null as edited_draft,
    nr.data_snapshot,
    case d.type_key
      when 'own_instructions' then 'ssm'::public.instruction_domain
      when 'training_themes' then 'ssm'::public.instruction_domain
      when 'fire_own_instructions' then 'psi'::public.instruction_domain
      when 'fire_training_themes' then 'psi'::public.instruction_domain
    end as instruction_domain,
    exists (
      select 1 from public.document_template_versions later
      where later.template_id = rv.template_id
        and later.version > rv.version
        and later.kind in ('legal', 'correction')
    ) as behind_template
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
),
-- The themes keep the versions under the own instructions revision they cite, never printed.
cited_version as (
  select cd.document_id, cited.version_id
  from current_document cd
  cross join lateral jsonb_array_elements_text(
    case cd.type_key
      when 'training_themes'
        then jsonb_path_query_array(cd.data_snapshot, '$.themes.ownInstructionsRevision.versionIds[*]')
      when 'fire_training_themes'
        then jsonb_path_query_array(cd.data_snapshot, '$.fireThemes.ownInstructionsRevision.versionIds[*]')
      else jsonb_path_query_array(cd.data_snapshot, '$.annexes[*].versionId')
    end
  ) as cited(version_id)
  where cd.instruction_domain is not null
),
cited_module as (
  select cv.document_id, mv.module_id, mv.number as cited_number
  from cited_version cv
  join public.instruction_module_versions mv on mv.id::text = cv.version_id
),
applied_module as (
  select distinct cd.document_id, applied.module_id
  from current_document cd
  join public.job_position_instructions applied
    on applied.client_id = cd.client_id and applied.domain = cd.instruction_domain
  join public.job_positions position
    on position.id = applied.job_position_id and position.archived_at is null
  where cd.instruction_domain is not null
),
instruction_change as (
  select cm.document_id, 'module_version' as code, m.title, latest.created_at as newest_version_at
  from cited_module cm
  join public.instruction_modules m on m.id = cm.module_id
  join lateral (
    select v.number, v.created_at
    from public.instruction_module_versions v
    where v.module_id = cm.module_id
    order by v.number desc
    limit 1
  ) latest on true
  where latest.number > cm.cited_number
  union all
  select am.document_id, 'module_added', m.title, null
  from applied_module am
  join public.instruction_modules m on m.id = am.module_id
  where not exists (
    select 1 from cited_module cm
    where cm.document_id = am.document_id and cm.module_id = am.module_id
  )
  union all
  select cm.document_id, 'module_removed', m.title, null
  from cited_module cm
  join public.instruction_modules m on m.id = cm.module_id
  where not exists (
    select 1 from applied_module am
    where am.document_id = cm.document_id and am.module_id = cm.module_id
  )
),
instruction_changes as (
  select
    document_id,
    jsonb_agg(
      jsonb_build_object('code', code, 'title', title, 'newestVersionAt', newest_version_at)
      order by title, code
    ) as changes
  from instruction_change
  group by document_id
)
select
  cd.organization_id,
  cd.type_key,
  cd.template_title,
  cd.newest_version,
  cd.newest_kind,
  cd.newest_note,
  cd.document_id,
  cd.client_id,
  cd.client_name,
  cd.revision_version,
  cd.edited_draft,
  cd.behind_template,
  coalesce(ic.changes, '[]'::jsonb) as instruction_changes
from current_document cd
left join instruction_changes ic on ic.document_id = cd.document_id
where cd.behind_template or ic.document_id is not null;

comment on view public.documents_behind is
  'Documents of active clients whose newest revision was generated from a template version older than a legal or correction version of the same template, or built from instruction module versions the library has since replaced, or citing another set of modules than the client''s positions apply. Counts only what the caller may read.';
comment on column public.documents_behind.revision_version is
  'The template version the newest revision was generated from.';
comment on column public.documents_behind.edited_draft is
  'The newest revision is a draft saved by hand since it was generated; regenerating it discards those edits.';
comment on column public.documents_behind.behind_template is
  'A legal or correction version of the template is newer than the one the newest revision was generated from.';
comment on column public.documents_behind.instruction_changes is
  'Per instruction module, what moved since the newest revision was built: {code: module_version | module_added | module_removed, title, newestVersionAt}. Empty for a document behind its template alone.';

revoke all on table public.documents_behind from anon, authenticated;
grant select on table public.documents_behind to authenticated, service_role;
