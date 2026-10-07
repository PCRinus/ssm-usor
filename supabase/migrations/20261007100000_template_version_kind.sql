-- A template version says why it exists (ADR 017): a note members read, and a kind that
-- decides whether the documents generated from an older version are prompted to regenerate.

-- Every version registered so far fixed the templates' content, the audit's among them.
alter table public.document_template_versions
  add column kind text not null default 'correction'
    constraint document_template_versions_kind_check check (kind in ('legal', 'correction', 'layout')),
  add column note text
    constraint document_template_versions_note_length check (char_length(btrim(note)) between 2 and 500);

alter table public.document_template_versions alter column kind drop default;

comment on column public.document_template_versions.kind is
  'legal: a quoted or referred legal text changed; correction: the template''s own content was fixed; layout: no words changed. Legal and correction versions prompt regeneration.';
comment on column public.document_template_versions.note is
  'What changed, in Romanian, for members. Null for the versions registered before ADR 017.';

drop function public.register_built_in_template_version(text, text, text, text);

-- Idempotent: the same hash returns the version it already is, a new hash becomes the next
-- version. Reached only with the secret key.
create function public.register_built_in_template_version(
  p_type_key text,
  p_title text,
  p_storage_path text,
  p_sha256 text,
  p_kind text,
  p_note text
)
returns table (template_version_id uuid, version integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_version_id uuid;
  v_version integer;
begin
  insert into public.document_templates (organization_id, type_key, title)
  values (null, p_type_key, p_title)
  on conflict (type_key) where organization_id is null do update set title = excluded.title
  returning id into v_template_id;

  -- A file already registered keeps the kind and note it came with: they describe what
  -- changed in that file, and a later manifest describes a later one.
  select tv.id, tv.version into v_version_id, v_version
  from public.document_template_versions tv
  where tv.template_id = v_template_id and tv.sha256 = p_sha256;
  if found then
    return query select v_version_id, v_version, false;
    return;
  end if;

  select coalesce(max(tv.version), 0) + 1 into v_version
  from public.document_template_versions tv
  where tv.template_id = v_template_id;

  insert into public.document_template_versions (template_id, version, storage_path, sha256, kind, note)
  values (v_template_id, v_version, p_storage_path, p_sha256, p_kind, p_note)
  returning id into v_version_id;

  return query select v_version_id, v_version, true;
end;
$$;

revoke all on function public.register_built_in_template_version(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_built_in_template_version(text, text, text, text, text, text) to service_role;
