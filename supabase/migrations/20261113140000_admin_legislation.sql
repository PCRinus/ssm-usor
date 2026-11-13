-- The admin area's Legislație page (ADR 017 amended 2026-11-12, ADR 038): the platform admin
-- resolves a change as no impact with a note, links it to the template version that answers it,
-- and records the form an act was verified against. The only writes to the legislation data
-- outside the legislation Worker, each a definer function that asks is_platform_admin(), so an
-- admin past his second factor alone makes them, and each records a named event in audit.events.
--   LGA01  the change is not open
--   LGA02  the template version cannot answer the change
--   LGA03  the form was not seen on the portal
--   LGA04  an open change of the act is at or before the form
--   LGA05  the daily check has not assessed the change yet
--   LGA06  an older change of the act is open

alter table audit.events drop constraint events_action_known;
alter table audit.events add constraint events_action_known check (
  action in (
    'insert', 'update', 'delete', 'impersonation_started', 'impersonation_ended', 'client_deleted',
    'import_copy_opened', 'import_copy_file_opened',
    'legal_change_resolved', 'legal_act_verified'
  )
);

-- A version answers a change of the templates the change's passages name. The file names do not
-- give the type: the training and test sheets are named in Romanian.
alter table public.legal_change_passages
  add column type_key text
    constraint legal_change_passages_type_key_length check (char_length(type_key) between 1 and 80);

-- The passages stored before the Worker wrote the type, by the citation index of 2026-11-13. A
-- file the index no longer lists keeps a null type, and no version can answer it.
update public.legal_change_passages p
set type_key = f.type_key
from (values
  ('fire', 'fire/1.1_fire_decision_organization.docx', 'fire_decision_organization'),
  ('fire', 'fire/1.2_fire_decision_training.docx', 'fire_decision_training'),
  ('fire', 'fire/1.3_fire_decision_open_fire.docx', 'fire_decision_open_fire'),
  ('fire', 'fire/1.4_fire_decision_smoking.docx', 'fire_decision_smoking'),
  ('fire', 'fire/1.5_fire_decision_technician.docx', 'fire_decision_technician'),
  ('fire', 'fire/1.6_fire_decision_instructions.docx', 'fire_decision_instructions'),
  ('fire', 'fire/1.7_fire_decision_waste.docx', 'fire_decision_waste'),
  ('fire', 'fire/1.8_fire_decision_seasons.docx', 'fire_decision_seasons'),
  ('fire', 'fire/1.9_fire_decision_control.docx', 'fire_decision_control'),
  ('fire', 'fire/2.1_fire_own_instructions.docx', 'fire_own_instructions'),
  ('fire', 'fire/3.1_fire_training_themes.docx', 'fire_training_themes'),
  ('fire', 'fire/5.1_fire_means_list.docx', 'fire_means_list'),
  ('fire', 'fire/5.3_fire_substances_list.docx', 'fire_substances_list'),
  ('fire', 'fire/5.4_fire_maintenance_schedules.docx', 'fire_maintenance_schedules'),
  ('fire', 'fire/7.1_fire_site_sheet.docx', 'fire_site_sheet'),
  ('fire', 'fire/7.2_fire_annual_report.docx', 'fire_annual_report'),
  ('fire', 'fire/fisa_instructaj_su.docx', 'training_sheet_su'),
  ('other', 'other/service_contract.docx', 'service_contract'),
  ('ssm', '1.1_decision_training.docx', 'decision_training'),
  ('ssm', '1.2_decision_risk_evaluation_team.docx', 'decision_risk_evaluation_team'),
  ('ssm', '1.3_decision_first_aid.docx', 'decision_first_aid'),
  ('ssm', '1.4_decision_imminent_danger.docx', 'decision_imminent_danger'),
  ('ssm', '1.5_decision_workers_representative.docx', 'decision_workers_representative'),
  ('ssm', '11_employer_briefing.docx', 'employer_briefing'),
  ('ssm', '12_control_regulation.docx', 'control_regulation'),
  ('ssm', '13_signing_regulation_annex.docx', 'signing_regulation_annex'),
  ('ssm', '2.2_general_training_material.docx', 'general_training_material'),
  ('ssm', '3.2_own_instructions.docx', 'own_instructions'),
  ('ssm', '4.2_training_themes.docx', 'training_themes'),
  ('ssm', '6_protective_equipment_list.docx', 'protective_equipment_list'),
  ('ssm', '9_risk_assessment.docx', 'risk_assessment'),
  ('ssm', 'act_aditional_semnare_electronica.docx', 'signing_agreement'),
  ('ssm', 'fisa_instruire_ssm.docx', 'training_sheet_ssm')
) as f (manifest, template_file, type_key)
where p.manifest = f.manifest and p.template_file = f.template_file and p.type_key is null;

create function public.admin_resolve_legal_change_no_impact(p_change_id uuid, p_note text)
returns public.legal_changes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change public.legal_changes;
  v_note text := btrim(p_note);
  v_verified date;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin resolves a legal change.' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) not between 2 and 500 then
    raise exception 'The note has 2 to 500 characters.' using errcode = '22023';
  end if;

  select * into v_change from public.legal_changes where id = p_change_id for update;
  if not found then
    raise exception 'No such legal change.' using errcode = 'P0002';
  end if;
  if v_change.resolution <> 'open' then
    raise exception 'The legal change is already resolved.' using errcode = 'LGA01';
  end if;
  select verified_consolidated_on into v_verified from public.legal_acts where id = v_change.act_id for update;
  -- The daily check assesses only open changes after the verified form: resolved before it, this
  -- one would keep no outcome. One at or before the verified form will never be assessed.
  if v_change.outcome is null and (v_verified is null or v_change.consolidated_on > v_verified) then
    raise exception 'The daily check has not assessed the legal change yet.' using errcode = 'LGA05';
  end if;
  -- Resolving moves the verified form to this change's, and the daily check never assesses a
  -- change at or before the verified form, so an older one left open would stay open for good.
  if exists (
    select 1 from public.legal_changes c
    where c.act_id = v_change.act_id and c.resolution = 'open' and c.consolidated_on < v_change.consolidated_on
  ) then
    raise exception 'An older change of the act is open; resolve it first.' using errcode = 'LGA06';
  end if;

  update public.legal_changes
  set resolution = 'no_impact', resolved_at = now(), resolved_by_note = v_note
  where id = p_change_id
  returning * into v_change;

  -- As the Worker does on its own no-impact: the next form is compared with this one.
  update public.legal_acts
  set verified_consolidated_on = v_change.consolidated_on
  where id = v_change.act_id
    and (verified_consolidated_on is null or verified_consolidated_on < v_change.consolidated_on);

  insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
  values (
    'legal_change_resolved', 'legal_changes', v_change.id, null,
    jsonb_build_object(
      'resolution', 'no_impact',
      'act_id', v_change.act_id,
      'consolidated_on', v_change.consolidated_on,
      'verified_consolidated_on', jsonb_build_array(v_verified, greatest(v_verified, v_change.consolidated_on))
    ),
    auth.uid(), null, 'user'
  );
  return v_change;
end;
$$;

comment on function public.admin_resolve_legal_change_no_impact(uuid, text) is
  'Resolves an open legal change as no impact with p_note, Romanian for members (ADR 017), and advances the act''s verified form to the change''s, for a platform admin past the second factor (ADR 038). 42501 for anyone else, P0002 for no such change, LGA01 when it is not open, LGA05 while the daily check has yet to assess it, LGA06 while an older change of the act is open, 22023 for a note not of 2 to 500 characters.';

create function public.admin_link_legal_change(p_change_id uuid, p_template_version_id uuid)
returns public.legal_changes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change public.legal_changes;
  v_version record;
  v_verified date;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin links a legal change to a template version.' using errcode = '42501';
  end if;

  select * into v_change from public.legal_changes where id = p_change_id for update;
  if not found then
    raise exception 'No such legal change.' using errcode = 'P0002';
  end if;
  if v_change.resolution <> 'open' then
    raise exception 'The legal change is already resolved.' using errcode = 'LGA01';
  end if;
  select verified_consolidated_on into v_verified from public.legal_acts where id = v_change.act_id for update;
  -- The daily check assesses only open changes after the verified form: resolved before it, this
  -- one would keep no outcome. One at or before the verified form will never be assessed.
  if v_change.outcome is null and (v_verified is null or v_change.consolidated_on > v_verified) then
    raise exception 'The daily check has not assessed the legal change yet.' using errcode = 'LGA05';
  end if;
  -- Resolving moves the verified form to this change's, and the daily check never assesses a
  -- change at or before the verified form, so an older one left open would stay open for good.
  if exists (
    select 1 from public.legal_changes c
    where c.act_id = v_change.act_id and c.resolution = 'open' and c.consolidated_on < v_change.consolidated_on
  ) then
    raise exception 'An older change of the act is open; resolve it first.' using errcode = 'LGA06';
  end if;

  select tv.id, tv.version, tv.kind, tv.note, tv.created_at, tv.resolves_legal_change_id, t.type_key, t.organization_id
  into v_version
  from public.document_template_versions tv
  join public.document_templates t on t.id = tv.template_id
  where tv.id = p_template_version_id
  for update of tv;
  -- A layout version changes no words, so it cannot answer a change of the law's; a version with no
  -- note would leave members nothing to read under the change.
  if not found
    or v_version.organization_id is not null
    or v_version.kind = 'layout'
    or v_version.note is null
    or v_version.resolves_legal_change_id is not null
    or v_version.created_at <= v_change.seen_at
    or not exists (
      select 1 from public.legal_change_passages p
      where p.change_id = p_change_id and p.type_key = v_version.type_key
    ) then
    raise exception 'The template version cannot answer this legal change.' using errcode = 'LGA02';
  end if;

  update public.document_template_versions
  set resolves_legal_change_id = p_change_id
  where id = p_template_version_id;

  update public.legal_changes
  set resolution = 'template_version', resolved_at = now(), resolved_by_note = v_version.note
  where id = p_change_id
  returning * into v_change;

  -- The answering version quotes the new form, which the next one is compared with.
  update public.legal_acts
  set verified_consolidated_on = v_change.consolidated_on
  where id = v_change.act_id
    and (verified_consolidated_on is null or verified_consolidated_on < v_change.consolidated_on);

  insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
  values (
    'legal_change_resolved', 'legal_changes', v_change.id, null,
    jsonb_build_object(
      'resolution', 'template_version',
      'act_id', v_change.act_id,
      'consolidated_on', v_change.consolidated_on,
      'template_version_id', v_version.id,
      'type_key', v_version.type_key,
      'version', v_version.version,
      'verified_consolidated_on', jsonb_build_array(v_verified, greatest(v_verified, v_change.consolidated_on))
    ),
    auth.uid(), null, 'user'
  );
  return v_change;
end;
$$;

comment on function public.admin_link_legal_change(uuid, uuid) is
  'Resolves an open legal change by the built-in template version p_template_version_id, which then names it, with the version''s note, and advances the act''s verified form to the change''s, for a platform admin past the second factor (ADR 038). The version is of a template the change''s passages name, registered after the change was seen, not a layout version, with a note and answering no other change. 42501 for anyone else, P0002 for no such change, LGA01 when it is not open, LGA05 while the daily check has yet to assess it, LGA06 while an older change of the act is open, LGA02 for a version that cannot answer it.';

create function public.admin_record_verified_form(p_act_id text, p_consolidated_on date)
returns public.legal_acts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_act public.legal_acts;
  v_previous date;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin records a verified form.' using errcode = '42501';
  end if;

  select * into v_act from public.legal_acts where id = p_act_id for update;
  if not found then
    raise exception 'No such legal act.' using errcode = 'P0002';
  end if;
  if p_consolidated_on is null or v_act.last_consolidated_on is null or p_consolidated_on > v_act.last_consolidated_on then
    raise exception 'The form was not seen on the portal.' using errcode = 'LGA03';
  end if;
  -- The daily check never assesses a change at or before the verified form again, so one left
  -- open there would stay open for good.
  if exists (
    select 1 from public.legal_changes c
    where c.act_id = p_act_id and c.resolution = 'open' and c.consolidated_on <= p_consolidated_on
  ) then
    raise exception 'An open change of the act is at or before the form.' using errcode = 'LGA04';
  end if;

  v_previous := v_act.verified_consolidated_on;
  update public.legal_acts set verified_consolidated_on = p_consolidated_on
  where id = p_act_id
  returning * into v_act;

  insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
  values (
    'legal_act_verified', 'legal_acts', null, null,
    jsonb_build_object(
      'act_id', v_act.id,
      'verified_consolidated_on', jsonb_build_array(v_previous, p_consolidated_on)
    ),
    auth.uid(), null, 'user'
  );
  return v_act;
end;
$$;

comment on function public.admin_record_verified_form(text, date) is
  'Records the consolidated form p_consolidated_on as the one the templates were verified against for act p_act_id (ADR 017), for a platform admin past the second factor (ADR 038). The form is no newer than the last one seen on the portal, and may be older than the current verified one, which corrects it. 42501 for anyone else, P0002 for no such act, LGA03 for a form not seen, LGA04 while a change of the act at or before it is open.';

revoke all on function public.admin_resolve_legal_change_no_impact(uuid, text) from public, anon, service_role;
revoke all on function public.admin_link_legal_change(uuid, uuid) from public, anon, service_role;
revoke all on function public.admin_record_verified_form(text, date) from public, anon, service_role;
grant execute on function public.admin_resolve_legal_change_no_impact(uuid, text) to authenticated;
grant execute on function public.admin_link_legal_change(uuid, uuid) to authenticated;
grant execute on function public.admin_record_verified_form(text, date) to authenticated;
