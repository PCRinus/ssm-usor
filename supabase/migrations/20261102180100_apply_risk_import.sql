-- The risk evaluations' library part (ADR 036): read from the pack's risk assessment and plan,
-- confirmed after the client by apply_risk_import. It has no domain: the documents it reads are
-- SSM only, and fire risk lives in the SU data.

comment on table public.import_library_parts is
  'A library proposal of a client import (ADR 034, ADR 036): the own instructions of one domain, or the risk evaluations, read from the pack, for a member to confirm after the client.';
comment on column public.import_library_parts.proposal is
  'What the reading proposed: InstructionsProposal, or RisksProposal for risk_evaluations (packages/import). Null before read, and once the import''s proposal is dropped.';
comment on column public.import_library_parts.changes is
  'What the member changed: for instructions their titles, categories, choices, posts, bodies and unticked ones; for risk evaluations each sheet''s library choice, posts, texts and factors. Dropped with the proposal.';

create or replace function public.import_library_part_domain(p_part public.import_library_part)
returns public.instruction_domain
language sql
immutable
set search_path = ''
as $$
  select case p_part
    when 'instructions_su' then 'su'
    when 'instructions_ssm' then 'ssm'
  end::public.instruction_domain;
$$;

comment on function public.import_library_part_domain(public.import_library_part) is
  'The instruction domain an instructions part reads; null for risk_evaluations, which has none.';

create or replace function public.record_library_part_usage(
  p_import_id uuid,
  p_part public.import_library_part,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_step text := case when p_part = 'risk_evaluations' then 'risks' else 'instructions' end;
begin
  update public.import_library_parts
  set input_tokens = input_tokens + p_input_tokens,
      cached_input_tokens = cached_input_tokens + p_cached_input_tokens,
      output_tokens = output_tokens + p_output_tokens,
      cost_usd = cost_usd + p_cost_usd
  where import_id = p_import_id and part = p_part;
  if not found then
    raise exception 'No such library part of the import.' using errcode = 'P0002';
  end if;
  update public.imports
  set input_tokens = input_tokens + p_input_tokens,
      cached_input_tokens = cached_input_tokens + p_cached_input_tokens,
      output_tokens = output_tokens + p_output_tokens,
      cost_usd = cost_usd + p_cost_usd,
      usage_by_step = usage_by_step || jsonb_build_object(v_step, jsonb_build_object(
        'input_tokens', coalesce((usage_by_step -> v_step ->> 'input_tokens')::bigint, 0) + p_input_tokens,
        'cached_input_tokens',
          coalesce((usage_by_step -> v_step ->> 'cached_input_tokens')::bigint, 0) + p_cached_input_tokens,
        'output_tokens', coalesce((usage_by_step -> v_step ->> 'output_tokens')::bigint, 0) + p_output_tokens,
        'cost_usd', coalesce((usage_by_step -> v_step ->> 'cost_usd')::numeric, 0) + p_cost_usd
      ))
  where id = p_import_id;
end;
$$;

revoke all on function public.record_library_part_usage(uuid, public.import_library_part, bigint, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.record_library_part_usage(uuid, public.import_library_part, bigint, bigint, bigint, numeric)
  to service_role;

--   P0002  no such import for the caller, or no such part
--   ILP01  the part is not ready to confirm
--   ILP02  the part was saved since the caller read it
--   ILP03  the client is not confirmed yet
--   ILP04  the part expired, 14 days after the client was confirmed
--   ILP05  a new module's title is taken by another active module
--   22023  a payload that breaks its contract, or a part that is not of instructions
create or replace function public.apply_instruction_import(
  p_import_id uuid,
  p_part public.import_library_part,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
  v_domain public.instruction_domain := public.import_library_part_domain(p_part);
  v_user uuid := auth.uid();
  v_item jsonb;
  v_module_id uuid;
  v_created uuid[] := '{}';
  v_used uuid[] := '{}';
  v_links integer := 0;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if v_domain is null then
    raise exception 'The part % holds no instructions.', p_part using errcode = '22023';
  end if;
  if v_import.kind <> 'client' then
    raise exception 'Only a client import proposes for the library.' using errcode = '22023';
  end if;
  if v_import.status <> 'confirmed' then
    raise exception 'Confirm the client first.' using errcode = 'ILP03';
  end if;
  if v_part.status not in ('to_review', 'nothing_new') then
    raise exception 'The library part is not ready to confirm.' using errcode = 'ILP01';
  end if;
  if v_part.version <> p_expected_version then
    raise exception 'The library part was saved since it was read.' using errcode = 'ILP02';
  end if;
  if v_import.confirmed_at < now() - interval '14 days' then
    raise exception 'The library part expired 14 days after the client was confirmed.' using errcode = 'ILP04';
  end if;

  perform public.import_payload_keys(p_payload, array['create', 'use'], 'library part');
  if jsonb_typeof(coalesce(p_payload -> 'create', '[]')) <> 'array'
    or jsonb_typeof(coalesce(p_payload -> 'use', '[]')) <> 'array' then
    raise exception 'The create and use of a library part payload are lists.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'create', '[]')) loop
    perform public.import_payload_keys(
      v_item, array['title', 'category', 'body', 'text_hash', 'job_position_ids'], 'new module'
    );
    if exists (
      select 1 from public.instruction_modules m
      where m.organization_id = v_import.organization_id
        and m.archived_at is null
        and lower(btrim(m.title)) = lower(btrim(v_item ->> 'title'))
    ) then
      raise exception 'The library already has a module titled %.', btrim(v_item ->> 'title')
        using errcode = 'ILP05';
    end if;
    insert into public.instruction_modules (organization_id, title, module_group, domain, created_by)
    values (
      v_import.organization_id,
      btrim(v_item ->> 'title'),
      (v_item ->> 'category')::public.instruction_module_group,
      v_domain,
      v_user
    )
    returning id into v_module_id;
    insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash, created_by)
    values (v_import.organization_id, v_module_id, 1, v_item -> 'body', v_item ->> 'text_hash', v_user);
    v_created := v_created || v_module_id;
    v_item := v_item || jsonb_build_object('module_id', v_module_id);
    v_links := v_links + public.link_imported_instruction(v_import, v_domain, v_item, v_user);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'use', '[]')) loop
    perform public.import_payload_keys(v_item, array['module_id', 'job_position_ids'], 'library module');
    if not exists (
      select 1 from public.instruction_modules m
      where m.id = (v_item ->> 'module_id')::uuid
        and m.organization_id = v_import.organization_id
        and m.domain = v_domain
        and m.archived_at is null
    ) then
      raise exception 'The library has no active module % of the domain.', v_item ->> 'module_id'
        using errcode = '22023';
    end if;
    v_used := v_used || (v_item ->> 'module_id')::uuid;
    v_links := v_links + public.link_imported_instruction(v_import, v_domain, v_item, v_user);
  end loop;

  update public.import_library_parts
  set status = 'confirmed', confirmed_at = now(), confirmed_by = v_user
  where import_id = p_import_id and part = p_part;

  return jsonb_build_object('created', to_jsonb(v_created), 'used', to_jsonb(v_used), 'links', v_links);
end;
$$;

revoke all on function public.apply_instruction_import(uuid, public.import_library_part, integer, jsonb) from public, anon;
grant execute on function public.apply_instruction_import(uuid, public.import_library_part, integer, jsonb) to authenticated;

create function public.import_risk_text(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_value #>> '{}'), '');
$$;

revoke all on function public.import_risk_text(jsonb) from public, anon, authenticated;

create function public.add_imported_profile_factor(
  p_organization_id uuid,
  p_profile_id uuid,
  p_factor jsonb,
  p_sort_order integer,
  p_user uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_factor_id uuid;
begin
  perform public.import_payload_keys(p_factor, array[
    'key', 'component', 'group', 'description', 'gravity_class', 'probability_class', 'measures',
    'actions', 'deadline', 'responsible_person', 'observations'
  ], 'library factor');
  insert into public.evaluation_profile_factors (
    organization_id, profile_id, component, factor_group, description, gravity_class,
    probability_class, actions, deadline, responsible_person, observations, sort_order, created_by
  )
  values (
    p_organization_id, p_profile_id, (p_factor ->> 'component')::public.work_system_component,
    btrim(p_factor ->> 'group'), btrim(p_factor ->> 'description'),
    (p_factor ->> 'gravity_class')::smallint, (p_factor ->> 'probability_class')::smallint,
    public.import_risk_text(p_factor -> 'actions'), public.import_risk_text(p_factor -> 'deadline'),
    public.import_risk_text(p_factor -> 'responsible_person'),
    public.import_risk_text(p_factor -> 'observations'), p_sort_order, p_user
  )
  returning id into v_factor_id;
  insert into public.evaluation_profile_measures (
    organization_id, factor_id, kind, description, sort_order, created_by
  )
  select p_organization_id, v_factor_id, (m.value ->> 'kind')::public.prevention_measure_kind,
    btrim(m.value ->> 'description'), m.ordinality - 1, p_user
  from jsonb_array_elements(coalesce(p_factor -> 'measures', '[]')) with ordinality as m (value, ordinality);
  return v_factor_id;
end;
$$;

revoke all on function public.add_imported_profile_factor(uuid, uuid, jsonb, integer, uuid) from public, anon, authenticated;

-- The client's evaluation a sheet is written to, created when it is missing. Only its empty texts
-- are filled, the exposure while it is still the default, as applying a library entry does.
create function public.imported_risk_evaluation(p_import public.imports, p_item jsonb, p_user uuid)
returns public.risk_evaluations
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.risk_evaluation_kind := (p_item ->> 'kind')::public.risk_evaluation_kind;
  v_position_id uuid := (p_item ->> 'job_position_id')::uuid;
  v_name text := public.import_risk_text(p_item -> 'name');
  v_evaluation public.risk_evaluations;
begin
  if v_kind = 'job_position' then
    if not exists (
      select 1 from public.job_positions jp
      where jp.id = v_position_id and jp.client_id = p_import.client_id and jp.archived_at is null
    ) then
      raise exception 'The client has no active job position %.', v_position_id using errcode = '22023';
    end if;
    select * into v_evaluation from public.risk_evaluations e
    where e.job_position_id = v_position_id for update;
  elsif v_kind = 'sensitive_groups' then
    select * into v_evaluation from public.risk_evaluations e
    where e.client_id = p_import.client_id and e.kind = 'sensitive_groups' for update;
  else
    if v_name is null then
      raise exception 'Another evaluation of a client is named.' using errcode = '22023';
    end if;
    select * into v_evaluation from public.risk_evaluations e
    where e.client_id = p_import.client_id and e.kind = 'other'
      and lower(btrim(e.name)) = lower(v_name)
    for update;
  end if;

  if v_evaluation.id is null then
    insert into public.risk_evaluations (
      organization_id, client_id, kind, job_position_id, name, created_by
    )
    values (
      p_import.organization_id, p_import.client_id, v_kind,
      case when v_kind = 'job_position' then v_position_id end,
      case when v_kind = 'other' then v_name end,
      p_user
    )
    returning * into v_evaluation;
  end if;

  update public.risk_evaluations
  set
    means_of_production = coalesce(means_of_production, public.import_risk_text(p_item -> 'means_of_production')),
    work_environment = coalesce(work_environment, public.import_risk_text(p_item -> 'work_environment')),
    exposure = case
      when exposure = '8 h / schimb' then coalesce(public.import_risk_text(p_item -> 'exposure'), exposure)
      else exposure
    end
  where id = v_evaluation.id
    and (
      (means_of_production is null and public.import_risk_text(p_item -> 'means_of_production') is not null)
      or (work_environment is null and public.import_risk_text(p_item -> 'work_environment') is not null)
      or (exposure = '8 h / schimb' and public.import_risk_text(p_item -> 'exposure') is not null)
    );
  select * into v_evaluation from public.risk_evaluations e where e.id = v_evaluation.id;
  return v_evaluation;
end;
$$;

revoke all on function public.imported_risk_evaluation(public.imports, jsonb, uuid) from public, anon, authenticated;

-- Runs as its owner so that the part, which members do not write, is confirmed in the same
-- transaction as the library and the client's sheets, and so that the factors carry their
-- library pointer. The import's organization stands in for the policies' check. The API builds
-- the payload from the proposal and the member's changes; every row passes its constraints and
-- triggers: the classes on the scale, an archived client refused, and the sensitive groups'
-- state following its evaluation.
--   P0002  no such import for the caller, or no such part
--   ILP01  the part is not ready to confirm
--   ILP02  the part was saved since the caller read it
--   ILP03  the client is not confirmed yet
--   ILP04  the part expired, 14 days after the client was confirmed
--   ILP05  a new entry's name is taken by another entry, archived ones included
--   22023  a payload that breaks its contract, or a part that is not the risk evaluations
create function public.apply_risk_import(
  p_import_id uuid,
  p_part public.import_library_part,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
  v_user uuid := auth.uid();
  v_item jsonb;
  v_factor jsonb;
  v_source jsonb;
  v_profile_id uuid;
  v_profile_factor_id uuid;
  v_entry_factors jsonb;
  v_factors_of jsonb := '{}';
  v_created uuid[] := '{}';
  v_evaluation public.risk_evaluations;
  v_evaluations uuid[] := '{}';
  v_factor_id uuid;
  v_order integer;
  v_written integer := 0;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if p_part <> 'risk_evaluations' then
    raise exception 'The part % holds no risk evaluations.', p_part using errcode = '22023';
  end if;
  if v_import.kind <> 'client' then
    raise exception 'Only a client import proposes for the library.' using errcode = '22023';
  end if;
  if v_import.status <> 'confirmed' then
    raise exception 'Confirm the client first.' using errcode = 'ILP03';
  end if;
  if v_part.status not in ('to_review', 'nothing_new') then
    raise exception 'The library part is not ready to confirm.' using errcode = 'ILP01';
  end if;
  if v_part.version <> p_expected_version then
    raise exception 'The library part was saved since it was read.' using errcode = 'ILP02';
  end if;
  if v_import.confirmed_at < now() - interval '14 days' then
    raise exception 'The library part expired 14 days after the client was confirmed.' using errcode = 'ILP04';
  end if;

  perform public.import_payload_keys(p_payload, array['entries', 'evaluations'], 'risk part');
  if jsonb_typeof(coalesce(p_payload -> 'entries', '[]')) <> 'array'
    or jsonb_typeof(coalesce(p_payload -> 'evaluations', '[]')) <> 'array' then
    raise exception 'The entries and evaluations of a risk part payload are lists.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'entries', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'key', 'name', 'means_of_production', 'work_environment', 'exposure', 'factors'
    ], 'library entry');
    if jsonb_typeof(v_item -> 'key') <> 'string' or v_factors_of ? (v_item ->> 'key')
      or jsonb_typeof(coalesce(v_item -> 'factors', '[]')) <> 'array' then
      raise exception 'Each library entry has a key of its own and a list of factors.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.evaluation_profiles p
      where p.organization_id = v_import.organization_id
        and lower(btrim(p.name)) = lower(btrim(v_item ->> 'name'))
    ) then
      raise exception 'The library already has an evaluation named %.', btrim(v_item ->> 'name')
        using errcode = 'ILP05';
    end if;
    insert into public.evaluation_profiles (
      organization_id, name, means_of_production, work_environment, exposure, created_by
    )
    values (
      v_import.organization_id, btrim(v_item ->> 'name'),
      public.import_risk_text(v_item -> 'means_of_production'),
      public.import_risk_text(v_item -> 'work_environment'),
      public.import_risk_text(v_item -> 'exposure'),
      v_user
    )
    returning id into v_profile_id;
    v_created := v_created || v_profile_id;
    v_entry_factors := '{}';
    v_order := 0;
    for v_factor in select value from jsonb_array_elements(coalesce(v_item -> 'factors', '[]')) loop
      if jsonb_typeof(v_factor -> 'key') is distinct from 'string' or v_entry_factors ? (v_factor ->> 'key') then
        raise exception 'Each factor of a library entry has a key of its own.' using errcode = '22023';
      end if;
      v_profile_factor_id := public.add_imported_profile_factor(
        v_import.organization_id, v_profile_id, v_factor, v_order, v_user
      );
      v_entry_factors := v_entry_factors || jsonb_build_object(v_factor ->> 'key', v_profile_factor_id);
      v_order := v_order + 1;
    end loop;
    v_factors_of := v_factors_of || jsonb_build_object(v_item ->> 'key', v_entry_factors);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'evaluations', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'sheet', 'kind', 'job_position_id', 'name', 'mode', 'means_of_production', 'work_environment',
      'exposure', 'factors'
    ], 'evaluation');
    if coalesce(v_item ->> 'mode', '') not in ('append', 'replace')
      or coalesce(v_item ->> 'kind', '') not in ('job_position', 'sensitive_groups', 'other')
      or jsonb_typeof(coalesce(v_item -> 'factors', '[]')) <> 'array' then
      raise exception 'An evaluation of a risk part payload has a kind, a mode and a list of factors.'
        using errcode = '22023';
    end if;
    v_evaluation := public.imported_risk_evaluation(v_import, v_item, v_user);
    if v_item ->> 'mode' = 'replace' then
      delete from public.risk_factors where evaluation_id = v_evaluation.id;
    end if;
    select coalesce(max(f.sort_order) + 1, 0) into v_order
    from public.risk_factors f where f.evaluation_id = v_evaluation.id;

    for v_factor in select value from jsonb_array_elements(coalesce(v_item -> 'factors', '[]')) loop
      perform public.import_payload_keys(v_factor, array[
        'key', 'component', 'group', 'description', 'gravity_class', 'probability_class', 'measures',
        'actions', 'deadline', 'responsible_person', 'observations', 'source'
      ], 'factor');
      v_source := v_factor -> 'source';
      v_profile_factor_id := null;
      if v_source is not null and jsonb_typeof(v_source) <> 'null' then
        if v_source ? 'profile_factor_id' then
          select pf.id into v_profile_factor_id
          from public.evaluation_profile_factors pf
          join public.evaluation_profiles p on p.id = pf.profile_id
          where pf.id = (v_source ->> 'profile_factor_id')::uuid
            and p.organization_id = v_import.organization_id
            and p.archived_at is null;
        else
          v_profile_factor_id := (v_factors_of #>> array[v_source ->> 'entry', v_source ->> 'factor'])::uuid;
        end if;
        if v_profile_factor_id is null then
          raise exception 'The library has no active factor %.', v_source using errcode = '22023';
        end if;
      end if;
      insert into public.risk_factors (
        organization_id, client_id, evaluation_id, component, factor_group, description,
        gravity_class, probability_class, actions, deadline, responsible_person, observations,
        sort_order, source_profile_factor_id, created_by
      )
      values (
        v_import.organization_id, v_import.client_id, v_evaluation.id,
        (v_factor ->> 'component')::public.work_system_component,
        btrim(v_factor ->> 'group'), btrim(v_factor ->> 'description'),
        (v_factor ->> 'gravity_class')::smallint, (v_factor ->> 'probability_class')::smallint,
        public.import_risk_text(v_factor -> 'actions'), public.import_risk_text(v_factor -> 'deadline'),
        public.import_risk_text(v_factor -> 'responsible_person'),
        public.import_risk_text(v_factor -> 'observations'), v_order, v_profile_factor_id, v_user
      )
      returning id into v_factor_id;
      insert into public.prevention_measures (
        organization_id, client_id, factor_id, kind, description, sort_order, created_by
      )
      select v_import.organization_id, v_import.client_id, v_factor_id,
        (m.value ->> 'kind')::public.prevention_measure_kind, btrim(m.value ->> 'description'),
        m.ordinality - 1, v_user
      from jsonb_array_elements(coalesce(v_factor -> 'measures', '[]')) with ordinality as m (value, ordinality);
      v_order := v_order + 1;
      v_written := v_written + 1;
    end loop;
    if not v_evaluation.id = any (v_evaluations) then
      v_evaluations := v_evaluations || v_evaluation.id;
    end if;
  end loop;

  update public.import_library_parts
  set status = 'confirmed', confirmed_at = now(), confirmed_by = v_user
  where import_id = p_import_id and part = p_part;

  return jsonb_build_object(
    'created', to_jsonb(v_created), 'evaluations', to_jsonb(v_evaluations), 'factors', v_written
  );
end;
$$;

comment on function public.apply_risk_import(uuid, public.import_library_part, integer, jsonb) is $comment$
Confirms the risk evaluations' part of a confirmed client import in one transaction (ADR 036). The
payload, built by riskImportPayload of packages/import:

{
  "entries": [{ "key", "name", "means_of_production", "work_environment", "exposure",
                "factors": [factor] }],
  "evaluations": [{ "sheet", "kind", "job_position_id", "name", "mode": "append" | "replace",
                    "means_of_production", "work_environment", "exposure",
                    "factors": [factor & { "source" }] }]
}

factor: { "key", "component", "group", "description", "gravity_class", "probability_class",
"measures": [{ "kind", "description" }], "actions", "deadline", "responsible_person",
"observations" }. source: null, { "entry", "factor" } naming a factor of an entry this payload
creates by their keys, or { "profile_factor_id" } of an active entry of the library.

"entries" become library entries, their plan fields defaults. Each of "evaluations" is written to
the client's evaluation of its post, its sensitive groups or the other one by name, created when
missing; only its empty texts are filled. "append" adds the factors after its own, "replace"
deletes its own first. Each factor points at its source. Answers {"created": [entry ids],
"evaluations": [evaluation ids written], "factors": the factors written}.
$comment$;

revoke all on function public.apply_risk_import(uuid, public.import_library_part, integer, jsonb) from public, anon;
grant execute on function public.apply_risk_import(uuid, public.import_library_part, integer, jsonb) to authenticated;

drop function public.fail_stalled_library_parts(text);

-- A part the queue stopped reading without recording a failure, with the reason of its library.
-- Parts of an abandoned or failed import are left as they are, and go with it.
create function public.fail_stalled_library_parts(p_reason text, p_risks_reason text)
returns table (import_id uuid, part public.import_library_part)
language sql
set search_path = ''
as $$
  update public.import_library_parts p
  set status = 'failed',
      failure_reason = case when p.part = 'risk_evaluations' then p_risks_reason else p_reason end,
      failed_at = now()
  from public.imports i
  where i.id = p.import_id
    and i.status in ('ready', 'confirmed')
    and p.status = 'reading'
    and p.updated_at < now() - interval '6 hours'
  returning p.import_id, p.part;
$$;

comment on function public.fail_stalled_library_parts(text, text) is
  'Fails the library parts of open or confirmed imports still reading 6 hours after their last change, an instructions part with p_reason and the risk evaluations with p_risks_reason. Returns them.';

revoke all on function public.fail_stalled_library_parts(text, text) from public, anon, authenticated;
grant execute on function public.fail_stalled_library_parts(text, text) to service_role;
