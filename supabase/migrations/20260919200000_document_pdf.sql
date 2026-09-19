-- The PDF of an issued revision (ADR 005): a static copy made while issuing, stored beside
-- the Word file, locked with it.

alter table public.document_revisions
  -- "<organization>/<client>/<document>/<revision>.pdf": the Word file's path with ".pdf".
  add column pdf_path text,
  -- Of the PDF as issued.
  add column pdf_sha256 text,
  add constraint document_revisions_pdf_path_key unique (pdf_path),
  add constraint document_revisions_pdf_path_matches_docx
    check (pdf_path is null or pdf_path = regexp_replace(docx_path, '\.docx$', '.pdf')),
  add constraint document_revisions_pdf_sha256_format
    check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  -- A draft has no PDF: its Word file still changes. An issued revision may lack one, from
  -- before this migration or from an environment without a converter.
  add constraint document_revisions_pdf_only_when_issued
    check ((pdf_path is null) = (pdf_sha256 is null) and (status <> 'draft' or pdf_path is null));

comment on column public.document_revisions.pdf_path is 'The PDF made when the revision was issued, in the documents bucket; null when none was made.';

-- The PDF is written just before the revision is issued, while it is still a draft, so the
-- same rule that guards the Word file guards it: a file can be written only where a draft
-- revision of the caller's organization says it lives.
create or replace function public.is_draft_document_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_revisions r
    where (r.docx_path = p_path or regexp_replace(r.docx_path, '\.docx$', '.pdf') = p_path)
      and r.status = 'draft'
      and r.organization_id = public.current_organization_id()
  );
$$;

-- Issuing now also records the PDF. The parameters for it are optional, so an API from before
-- this migration, which names only the first two, keeps issuing during the deployment.
drop function public.issue_document_revision(uuid, text);

create function public.issue_document_revision(
  p_revision_id uuid,
  p_docx_sha256 text,
  p_pdf_path text default null,
  p_pdf_sha256 text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.document_revisions;
begin
  select * into v_revision
  from public.document_revisions r
  where r.id = p_revision_id and r.organization_id = public.current_organization_id()
  for update;
  if not found then
    raise exception 'No such document revision.' using errcode = 'DOC01';
  end if;
  if v_revision.status <> 'draft' then
    raise exception 'Only a draft can be issued.' using errcode = 'DOC02';
  end if;

  -- Serializes two people issuing revisions of the same document.
  perform 1 from public.client_documents d where d.id = v_revision.document_id for update;

  update public.document_revisions
  set status = 'superseded', superseded_at = now()
  where document_id = v_revision.document_id and status = 'issued';

  -- During an impersonation this records the platform admin, as `created_by` does.
  update public.document_revisions
  set status = 'issued', issued_at = now(), issued_by = auth.uid(),
      docx_sha256 = p_docx_sha256, pdf_path = p_pdf_path, pdf_sha256 = p_pdf_sha256
  where id = p_revision_id;
end;
$$;

revoke all on function public.issue_document_revision(uuid, text, text, text) from public, anon;
grant execute on function public.issue_document_revision(uuid, text, text, text) to authenticated;
