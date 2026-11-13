-- The merge is the sign-off, and registration resolves (ADR 017, amended 2026-11-12): a template
-- version whose manifest entry names the legal changes it answers, by act and consolidation date,
-- resolves them in each environment, since a change's id differs between environments.

-- A version answers several changes when they reach one template before a release: the manifest
-- joins them into one entry (nextTemplateChange in the document engine), and one change is
-- answered by a version of every template that quotes it. The column on the version names one;
-- this table names them all.
create table public.template_version_legal_changes (
  template_version_id uuid not null references public.document_template_versions (id) on delete cascade,
  legal_change_id uuid not null references public.legal_changes (id) on delete restrict,
  primary key (template_version_id, legal_change_id)
);

create index template_version_legal_changes_change_idx
  on public.template_version_legal_changes (legal_change_id);

comment on table public.template_version_legal_changes is
  'Every legal change a built-in template version answers; resolves_legal_change_id names the first.';
comment on column public.document_template_versions.resolves_legal_change_id is
  'The first legal change the version answers; template_version_legal_changes lists every one.';

alter table public.template_version_legal_changes enable row level security;

revoke all on table public.template_version_legal_changes from anon;
revoke insert, update, delete, truncate on table public.template_version_legal_changes from authenticated;

create policy "members read which versions answer the legal changes"
  on public.template_version_legal_changes for select to authenticated
  using ((select public.current_organization_id()) is not null);

insert into public.template_version_legal_changes (template_version_id, legal_change_id)
select id, resolves_legal_change_id
from public.document_template_versions
where resolves_legal_change_id is not null
on conflict do nothing;

-- Whoever sets the column, this function or the admin area's link, the table follows.
create function public.link_template_version_legal_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.template_version_legal_changes (template_version_id, legal_change_id)
  values (new.id, new.resolves_legal_change_id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.link_template_version_legal_change() from public, anon, authenticated;

create trigger document_template_versions_link_legal_change
  after insert or update of resolves_legal_change_id on public.document_template_versions
  for each row
  when (new.resolves_legal_change_id is not null)
  execute function public.link_template_version_legal_change();

drop function public.register_built_in_template_version(text, text, text, text, text, text);

-- p_resolves is the manifest's change.resolves: null, one { "act", "consolidatedOn" } or a list.
create function public.register_built_in_template_version(
  p_type_key text,
  p_title text,
  p_storage_path text,
  p_sha256 text,
  p_kind text,
  p_note text,
  p_resolves jsonb default null
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
  v_note text;
  v_created boolean;
  v_resolves jsonb;
  v_each jsonb;
  v_act_id text;
  v_on date;
  v_change_id uuid;
begin
  v_resolves := case coalesce(jsonb_typeof(p_resolves), 'null')
    when 'array' then p_resolves
    when 'object' then jsonb_build_array(p_resolves)
    when 'null' then '[]'::jsonb
  end;
  if v_resolves is null then
    raise exception 'resolves is an object or a list of objects.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_resolves) > 0 and p_kind is distinct from 'legal' then
    raise exception 'Only a legal version resolves a change of an act.' using errcode = '22023';
  end if;

  insert into public.document_templates (organization_id, type_key, title)
  values (null, p_type_key, p_title)
  on conflict (type_key) where organization_id is null do update set title = excluded.title
  returning id into v_template_id;

  -- A file already registered keeps the kind and note it came with: they describe what changed
  -- in that file, and a later manifest describes a later one. The changes a manifest names are
  -- still resolved by it: a file can already quote a form whose change was recorded after it
  -- was registered, or a manifest can name an older form along with the one the file answers.
  select tv.id, tv.version, tv.note into v_version_id, v_version, v_note
  from public.document_template_versions tv
  where tv.template_id = v_template_id and tv.sha256 = p_sha256;
  v_created := not found;

  if v_created then
    select coalesce(max(tv.version), 0) + 1 into v_version
    from public.document_template_versions tv
    where tv.template_id = v_template_id;

    insert into public.document_template_versions (template_id, version, storage_path, sha256, kind, note)
    values (v_template_id, v_version, p_storage_path, p_sha256, p_kind, p_note)
    returning id into v_version_id;
  end if;
  v_note := coalesce(v_note, p_note);

  for v_each in select value from jsonb_array_elements(v_resolves) loop
    v_act_id := v_each ->> 'act';
    begin
      v_on := (v_each ->> 'consolidatedOn')::date;
    exception when others then
      v_on := null;
    end;
    if v_act_id is null or v_on is null then
      raise exception 'Each resolved change names an act and a consolidatedOn date.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.legal_acts where id = v_act_id) then
      raise exception 'No watched act %.', v_act_id using errcode = 'P0002';
    end if;

    -- An environment that never saw the form records it as answered.
    insert into public.legal_changes (act_id, consolidated_on, resolution, resolved_at, resolved_by_note)
    values (v_act_id, v_on, 'template_version', now(), v_note)
    on conflict (act_id, consolidated_on) do nothing;

    update public.legal_changes
    set resolution = 'template_version', resolved_at = now(), resolved_by_note = v_note
    where act_id = v_act_id and consolidated_on = v_on and resolution = 'open';

    select id into v_change_id
    from public.legal_changes
    where act_id = v_act_id and consolidated_on = v_on;

    update public.document_template_versions
    set resolves_legal_change_id = v_change_id
    where id = v_version_id and resolves_legal_change_id is null;

    insert into public.template_version_legal_changes (template_version_id, legal_change_id)
    values (v_version_id, v_change_id)
    on conflict do nothing;

    -- The version quotes this form, which the next one is compared with.
    update public.legal_acts
    set verified_consolidated_on = v_on
    where id = v_act_id
      and (verified_consolidated_on is null or verified_consolidated_on < v_on);
  end loop;

  return query select v_version_id, v_version, v_created;
end;
$$;

comment on function public.register_built_in_template_version(text, text, text, text, text, text, jsonb) is
  'Registers a built-in template file as its template''s next version, or returns the version its hash already is, with its kind and note. A legal version, new or already registered, resolves the changes p_resolves names, links them to it, recording any this environment never saw, and advances each act''s verified form. 22023 for a resolves that is not an object or list of { act, consolidatedOn }, or that a version not legal names; P0002 for an act not watched.';

revoke all on function public.register_built_in_template_version(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.register_built_in_template_version(text, text, text, text, text, text, jsonb) to service_role;
