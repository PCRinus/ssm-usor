-- Document 13, the SSM duties of every post as annexes to the job descriptions (ADR 046), is a
-- built-in document of the occupational safety set that every client gets, whatever its headcount.
-- No search_path setting: a function with one is never inlined, and the list reads this per client.
create or replace function public.built_in_document_types()
returns table (document_group public.document_group, type_key text, applies_when text)
language sql
immutable
parallel safe
as $$
  values
    ('documentation_set'::public.document_group, 'cover_decisions', 'always'),
    ('documentation_set', 'decision_training', 'always'),
    ('documentation_set', 'decision_risk_evaluation_team', 'always'),
    ('documentation_set', 'decision_first_aid', 'always'),
    ('documentation_set', 'decision_imminent_danger', 'always'),
    ('documentation_set', 'decision_workers_representative', 'from_ten_employees'),
    ('documentation_set', 'cover_general_training_material', 'always'),
    ('documentation_set', 'general_training_material', 'always'),
    ('documentation_set', 'cover_own_instructions', 'always'),
    ('documentation_set', 'own_instructions', 'always'),
    ('documentation_set', 'cover_training_themes', 'always'),
    ('documentation_set', 'training_themes', 'always'),
    ('documentation_set', 'cover_tests', 'always'),
    ('documentation_set', 'test_hiring', 'always'),
    ('documentation_set', 'protective_equipment_list', 'always'),
    ('documentation_set', 'cover_event_registers', 'always'),
    ('documentation_set', 'event_registers', 'always'),
    ('documentation_set', 'control_report', 'always'),
    ('documentation_set', 'risk_assessment', 'always'),
    ('documentation_set', 'risk_zones_record', 'always'),
    ('documentation_set', 'prevention_plan', 'always'),
    ('documentation_set', 'cover_employer_briefing', 'always'),
    ('documentation_set', 'employer_briefing', 'always'),
    ('documentation_set', 'control_regulation', 'always'),
    ('documentation_set', 'ssm_duties', 'always'),
    ('documentation_set', 'signing_regulation_annex', 'with_participants'),
    ('fire_safety_set', 'fire_cover_decisions', 'always'),
    ('fire_safety_set', 'fire_decision_organization', 'always'),
    ('fire_safety_set', 'fire_decision_training', 'always'),
    ('fire_safety_set', 'fire_decision_open_fire', 'always'),
    ('fire_safety_set', 'fire_decision_smoking', 'always'),
    ('fire_safety_set', 'fire_decision_technician', 'always'),
    ('fire_safety_set', 'fire_decision_instructions', 'always'),
    ('fire_safety_set', 'fire_decision_waste', 'always'),
    ('fire_safety_set', 'fire_decision_seasons', 'from_ten_employees'),
    ('fire_safety_set', 'fire_decision_control', 'from_ten_employees'),
    ('fire_safety_set', 'fire_cover_own_instructions', 'always'),
    ('fire_safety_set', 'fire_own_instructions', 'always'),
    ('fire_safety_set', 'fire_cover_training_themes', 'always'),
    ('fire_safety_set', 'fire_training_themes', 'always'),
    ('fire_safety_set', 'fire_cover_tests', 'always'),
    ('fire_safety_set', 'fire_test_hiring', 'always'),
    ('fire_safety_set', 'fire_test_annual', 'always'),
    ('fire_safety_set', 'fire_means_list', 'always'),
    ('fire_safety_set', 'fire_workplace_organization', 'always'),
    ('fire_safety_set', 'fire_substances_list', 'always'),
    ('fire_safety_set', 'fire_maintenance_schedules', 'from_ten_employees'),
    ('fire_safety_set', 'fire_cover_registers', 'always'),
    ('fire_safety_set', 'fire_registers', 'always'),
    ('fire_safety_set', 'fire_work_permit', 'always'),
    ('fire_safety_set', 'fire_installation_register', 'from_ten_employees'),
    ('fire_safety_set', 'fire_extinguisher_register', 'always'),
    ('fire_safety_set', 'fire_site_sheet', 'from_ten_employees'),
    ('fire_safety_set', 'fire_annual_report', 'from_ten_employees')
$$;

-- What a generated revision of document 13 printed, kept apart from its snapshot because the
-- snapshot is compared with the current data and a hash cannot be rebuilt synchronously there:
-- { "annexes": [{ "positionId", "fingerprint" }], "roles": [{ "role", "fingerprint" }] }. A
-- worker's acknowledgement of their duties is out of date once their post's fingerprint, or a
-- role's they hold, differs from the one they signed. Null for every other document and for an
-- uploaded file.
alter table public.document_revisions
  add column duty_fingerprints jsonb
  constraint document_revisions_duty_fingerprints_shape check (
    duty_fingerprints is null
    or coalesce(
      jsonb_typeof(duty_fingerprints -> 'annexes') = 'array'
        and jsonb_typeof(duty_fingerprints -> 'roles') = 'array',
      false
    )
  );
