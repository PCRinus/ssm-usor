-- A client import also takes a job position's decision that it needs no protective equipment,
-- and a staff category's "not applicable" into a client that left the category undecided
-- (ADR 030).

-- Runs as its owner so that the import, which members do not write, is confirmed in the same
-- transaction as everything it creates. Every row still passes its constraints and its triggers:
-- the archived-client and lead freezes, the position given to an employee by job title, and the
-- position's equipment decision following its entries.
--   P0002  no such import for the caller
--   IMP01  the import is not ready for review
--   IMP02  the import was saved since the caller read it
--   IMP03  the existing client's CUI is not the documents'
--   IMP04  the organization already has a client with the new client's CUI
--   CLA01  the existing client is archived
--   22023  a payload that breaks its contract
create or replace function public.apply_client_import(p_import_id uuid, p_expected_version integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_client_columns constant text[] := array[
    'legal_name', 'vat_payer', 'caen_code', 'trade_register_number', 'county_code', 'locality',
    'address_line', 'legal_representative_name', 'legal_representative_role', 'contact_name',
    'contact_email', 'contact_phone', 'periodic_training_minutes',
    'administrative_training_interval_months', 'administrative_training_not_applicable',
    'worker_training_interval_months', 'worker_training_not_applicable', 'training_first_month',
    'training_day_from', 'training_day_to'
  ];
  c_workplace_columns constant text[] := array[
    'name', 'is_registered_office', 'kind', 'county_code', 'locality', 'address_line', 'activity',
    'floor_area_m2', 'extinguisher_norm', 'assembly_point', 'combustible_materials',
    'ignition_sources', 'fire_risk_equipment', 'specific_measures'
  ];
  c_position_columns constant text[] := array[
    'name', 'staff_category', 'work_zone', 'activities', 'training_interval_months',
    'needs_protective_equipment'
  ];
  c_fire_safety_columns constant text[] := array[
    'periodic_training_hours', 'administrative_training_interval_months',
    'worker_training_interval_months', 'training_first_month', 'training_day_from',
    'training_day_to', 'smoking_policy', 'smoking_place', 'waste_kinds', 'waste_contractor',
    'waste_collectors', 'has_third_parties'
  ];
  v_user uuid := auth.uid();
  v_import public.imports;
  v_org uuid;
  v_client_id uuid;
  v_client public.clients;
  v_payload_client jsonb := p_payload -> 'client';
  v_patch jsonb;
  v_scope text;
  v_item jsonb;
  v_workplaces jsonb := '{}';
  v_positions jsonb := '{}';
  v_employees jsonb := '{}';
  v_workplace public.client_workplaces;
  v_position public.job_positions;
  v_employee public.employees;
  v_person public.client_responsible_persons;
  v_entry public.job_position_equipment;
  v_fire public.client_fire_safety;
  v_unit public.fire_equipment;
  v_installation public.fire_installations;
  v_file public.import_files;
  v_heic boolean;
  v_id uuid;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_org := v_import.organization_id;
  if v_import.kind <> 'client' then
    raise exception 'Only a client import is confirmed by this function.' using errcode = '22023';
  end if;
  if v_import.status <> 'ready' then
    raise exception 'The import is not ready for review.' using errcode = 'IMP01';
  end if;
  if v_import.version <> p_expected_version then
    raise exception 'The import was saved since it was read.' using errcode = 'IMP02';
  end if;
  perform public.import_payload_keys(p_payload, array[
    'client', 'workplaces', 'job_positions', 'equipment', 'employees', 'responsible_persons',
    'fire_safety', 'fire_equipment', 'fire_installations', 'quality'
  ], 'payload');
  perform public.import_payload_keys(v_payload_client, c_client_columns || array['cui', 'replace'], 'client');

  if v_import.into_existing_client then
    select c.* into v_client from public.clients c where c.id = v_import.client_id for update;
    if v_client.archived_at is not null then
      raise exception 'An archived client is not changed.' using errcode = 'CLA01';
    end if;
    if (v_import.company_cui is not null and v_import.company_cui <> v_client.cui)
      or (v_payload_client ? 'cui' and v_payload_client ->> 'cui' is distinct from v_client.cui)
    then
      raise exception 'The documents are about another company than the client.' using errcode = 'IMP03';
    end if;

    v_patch := public.import_patch(to_jsonb(v_client), v_payload_client, c_client_columns);
    -- An interval and its "not applicable" are one choice: a declared exclusion counts as filled,
    -- and a category with neither takes the documents' exclusion.
    foreach v_scope in array array['administrative', 'worker'] loop
      if (v_payload_client ->> (v_scope || '_training_not_applicable'))::boolean
        and to_jsonb(v_client) ->> (v_scope || '_training_interval_months') is null
      then
        v_patch := v_patch || jsonb_build_object(v_scope || '_training_not_applicable', true);
      end if;
      if v_patch ? (v_scope || '_training_interval_months')
        and (to_jsonb(v_client) ->> (v_scope || '_training_not_applicable'))::boolean
        and not coalesce(v_payload_client -> 'replace', '[]') ? (v_scope || '_training_interval_months')
      then
        v_patch := v_patch - (v_scope || '_training_interval_months');
      end if;
      if v_patch ? (v_scope || '_training_interval_months') then
        v_patch := v_patch || jsonb_build_object(v_scope || '_training_not_applicable', false);
      elsif (v_patch ->> (v_scope || '_training_not_applicable'))::boolean then
        v_patch := v_patch || jsonb_build_object(v_scope || '_training_interval_months', null);
      end if;
    end loop;
    v_client := jsonb_populate_record(v_client, v_patch);

    update public.clients set
      legal_name = v_client.legal_name,
      vat_payer = v_client.vat_payer,
      caen_code = v_client.caen_code,
      trade_register_number = v_client.trade_register_number,
      county_code = v_client.county_code,
      locality = v_client.locality,
      address_line = v_client.address_line,
      legal_representative_name = v_client.legal_representative_name,
      legal_representative_role = v_client.legal_representative_role,
      contact_name = v_client.contact_name,
      contact_email = v_client.contact_email,
      contact_phone = v_client.contact_phone,
      periodic_training_minutes = v_client.periodic_training_minutes,
      administrative_training_interval_months = v_client.administrative_training_interval_months,
      administrative_training_not_applicable = v_client.administrative_training_not_applicable,
      worker_training_interval_months = v_client.worker_training_interval_months,
      worker_training_not_applicable = v_client.worker_training_not_applicable,
      training_first_month = v_client.training_first_month,
      training_day_from = v_client.training_day_from,
      training_day_to = v_client.training_day_to
    where id = v_client.id;
    v_client_id := v_client.id;
  else
    v_client := jsonb_populate_record(null::public.clients, v_payload_client);
    begin
      insert into public.clients (
        organization_id, legal_name, cui, vat_payer, caen_code, trade_register_number, county_code,
        locality, address_line, legal_representative_name, legal_representative_role, contact_name,
        contact_email, contact_phone, periodic_training_minutes,
        administrative_training_interval_months, administrative_training_not_applicable,
        worker_training_interval_months, worker_training_not_applicable, training_first_month,
        training_day_from, training_day_to, created_by
      )
      values (
        v_org, v_client.legal_name, v_client.cui, coalesce(v_client.vat_payer, false),
        v_client.caen_code, v_client.trade_register_number, v_client.county_code, v_client.locality,
        v_client.address_line, v_client.legal_representative_name, v_client.legal_representative_role,
        v_client.contact_name, v_client.contact_email, v_client.contact_phone,
        v_client.periodic_training_minutes, v_client.administrative_training_interval_months,
        coalesce(v_client.administrative_training_not_applicable, false),
        v_client.worker_training_interval_months,
        coalesce(v_client.worker_training_not_applicable, false), v_client.training_first_month,
        v_client.training_day_from, v_client.training_day_to, v_user
      )
      returning id into v_client_id;
    exception when unique_violation then
      raise exception 'The organization already has a client with this CUI.' using errcode = 'IMP04';
    end;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'workplaces', '[]')) loop
    perform public.import_payload_keys(v_item, c_workplace_columns || array['key', 'id', 'replace'], 'workplace');
    if v_item ? 'id' then
      select w.* into v_workplace from public.client_workplaces w
      where w.id = (v_item ->> 'id')::uuid and w.client_id = v_client_id
      for update;
      if not found then
        raise exception 'The client has no workplace %.', v_item ->> 'id' using errcode = '22023';
      end if;
      v_workplace := jsonb_populate_record(
        v_workplace, public.import_patch(to_jsonb(v_workplace), v_item, c_workplace_columns)
      );
      update public.client_workplaces set
        name = v_workplace.name,
        is_registered_office = v_workplace.is_registered_office,
        kind = v_workplace.kind,
        county_code = v_workplace.county_code,
        locality = v_workplace.locality,
        address_line = v_workplace.address_line,
        activity = v_workplace.activity,
        floor_area_m2 = v_workplace.floor_area_m2,
        extinguisher_norm = v_workplace.extinguisher_norm,
        assembly_point = v_workplace.assembly_point,
        combustible_materials = v_workplace.combustible_materials,
        ignition_sources = v_workplace.ignition_sources,
        fire_risk_equipment = v_workplace.fire_risk_equipment,
        specific_measures = v_workplace.specific_measures
      where id = v_workplace.id;
    else
      v_workplace := jsonb_populate_record(null::public.client_workplaces, v_item);
      insert into public.client_workplaces (
        organization_id, client_id, name, is_registered_office, kind, county_code, locality,
        address_line, activity, floor_area_m2, extinguisher_norm, assembly_point,
        combustible_materials, ignition_sources, fire_risk_equipment, specific_measures, created_by
      )
      values (
        v_org, v_client_id, v_workplace.name, coalesce(v_workplace.is_registered_office, false),
        coalesce(v_workplace.kind, 'fixed_space'), v_workplace.county_code, v_workplace.locality,
        v_workplace.address_line, v_workplace.activity, v_workplace.floor_area_m2,
        v_workplace.extinguisher_norm, v_workplace.assembly_point, v_workplace.combustible_materials,
        v_workplace.ignition_sources, v_workplace.fire_risk_equipment, v_workplace.specific_measures,
        v_user
      )
      returning id into v_workplace.id;
    end if;
    v_workplaces := public.import_add_key(v_workplaces, v_item, v_workplace.id, 'workplace');
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'job_positions', '[]')) loop
    perform public.import_payload_keys(v_item, c_position_columns || array['key', 'id', 'replace'], 'job position');
    -- True is the entries' to set: an insert would pass the trigger that refuses it without them.
    if coalesce(v_item -> 'needs_protective_equipment', 'null'::jsonb) not in ('false'::jsonb, 'null'::jsonb) then
      raise exception 'A job position of an import payload needs equipment through its entries.' using errcode = '22023';
    end if;
    -- A position is known by its name, as the unique index says: a new one named like an
    -- active one of the client fills that one.
    select p.* into v_position from public.job_positions p
    where p.client_id = v_client_id
      and p.archived_at is null
      and case
        when v_item ? 'id' then p.id = (v_item ->> 'id')::uuid
        else lower(btrim(p.name)) = lower(btrim(v_item ->> 'name'))
      end
    for update;
    if found then
      v_position := jsonb_populate_record(
        v_position, public.import_patch(to_jsonb(v_position), v_item, c_position_columns)
      );
      update public.job_positions set
        name = v_position.name,
        staff_category = v_position.staff_category,
        work_zone = v_position.work_zone,
        activities = v_position.activities,
        training_interval_months = v_position.training_interval_months,
        needs_protective_equipment = v_position.needs_protective_equipment
      where id = v_position.id;
    elsif v_item ? 'id' then
      raise exception 'The client has no active job position %.', v_item ->> 'id' using errcode = '22023';
    else
      v_position := jsonb_populate_record(null::public.job_positions, v_item);
      insert into public.job_positions (
        organization_id, client_id, name, staff_category, work_zone, activities,
        training_interval_months, needs_protective_equipment, created_by
      )
      values (
        v_org, v_client_id, v_position.name, coalesce(v_position.staff_category, 'execution'),
        v_position.work_zone, v_position.activities, v_position.training_interval_months,
        v_position.needs_protective_equipment, v_user
      )
      returning id into v_position.id;
    end if;
    v_positions := public.import_add_key(v_positions, v_item, v_position.id, 'job position');
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'equipment', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'job_position_key', 'job_position_id', 'risk', 'item', 'quantity', 'duration_months', 'allocation'
    ], 'equipment entry');
    v_entry := jsonb_populate_record(null::public.job_position_equipment, v_item);
    insert into public.job_position_equipment (
      organization_id, client_id, job_position_id, risk, item, quantity, duration_months, allocation,
      created_by
    )
    values (
      v_org, v_client_id, public.import_reference(v_item, 'job_position', v_positions), v_entry.risk,
      v_entry.item, coalesce(v_entry.quantity, 1), v_entry.duration_months,
      coalesce(v_entry.allocation, 'personal_inventory'), v_user
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'employees', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'key', 'job_position_key', 'job_position_id', 'workplace_key', 'workplace_id', 'last_name',
      'first_name', 'job_title', 'hired_at', 'cnp', 'employee_number', 'email', 'phone',
      'contract_number'
    ], 'employee');
    v_employee := jsonb_populate_record(null::public.employees, v_item);
    insert into public.employees (
      organization_id, client_id, job_position_id, workplace_id, last_name, first_name, job_title,
      hired_at, cnp, employee_number, email, phone, contract_number, created_by
    )
    values (
      v_org, v_client_id, public.import_reference(v_item, 'job_position', v_positions),
      public.import_reference(v_item, 'workplace', v_workplaces), v_employee.last_name,
      v_employee.first_name, v_employee.job_title, v_employee.hired_at, v_employee.cnp,
      v_employee.employee_number, v_employee.email, v_employee.phone, v_employee.contract_number,
      v_user
    )
    returning id into v_id;
    v_employees := public.import_add_key(v_employees, v_item, v_id, 'employee');
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'responsible_persons', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'employee_key', 'employee_id', 'workplace_key', 'workplace_id', 'full_name', 'job_title', 'roles'
    ], 'responsible person');
    v_person := jsonb_populate_record(null::public.client_responsible_persons, v_item);
    insert into public.client_responsible_persons (
      organization_id, client_id, employee_id, workplace_id, full_name, job_title, roles, created_by
    )
    values (
      v_org, v_client_id, public.import_reference(v_item, 'employee', v_employees),
      public.import_reference(v_item, 'workplace', v_workplaces), v_person.full_name,
      v_person.job_title, v_person.roles, v_user
    );
  end loop;

  if p_payload ? 'fire_safety' then
    v_item := p_payload -> 'fire_safety';
    perform public.import_payload_keys(v_item, c_fire_safety_columns || array['replace'], 'fire safety');
    select f.* into v_fire from public.client_fire_safety f where f.client_id = v_client_id for update;
    if found then
      v_fire := jsonb_populate_record(v_fire, public.import_patch(to_jsonb(v_fire), v_item, c_fire_safety_columns));
      update public.client_fire_safety set
        periodic_training_hours = v_fire.periodic_training_hours,
        administrative_training_interval_months = v_fire.administrative_training_interval_months,
        worker_training_interval_months = v_fire.worker_training_interval_months,
        training_first_month = v_fire.training_first_month,
        training_day_from = v_fire.training_day_from,
        training_day_to = v_fire.training_day_to,
        smoking_policy = v_fire.smoking_policy,
        smoking_place = v_fire.smoking_place,
        waste_kinds = v_fire.waste_kinds,
        waste_contractor = v_fire.waste_contractor,
        waste_collectors = v_fire.waste_collectors,
        has_third_parties = v_fire.has_third_parties
      where client_id = v_client_id;
    else
      v_fire := jsonb_populate_record(null::public.client_fire_safety, v_item);
      insert into public.client_fire_safety (
        client_id, organization_id, periodic_training_hours, administrative_training_interval_months,
        worker_training_interval_months, training_first_month, training_day_from, training_day_to,
        smoking_policy, smoking_place, waste_kinds, waste_contractor, waste_collectors,
        has_third_parties, created_by
      )
      values (
        v_client_id, v_org, v_fire.periodic_training_hours, v_fire.administrative_training_interval_months,
        v_fire.worker_training_interval_months, v_fire.training_first_month, v_fire.training_day_from,
        v_fire.training_day_to, v_fire.smoking_policy, v_fire.smoking_place,
        coalesce(v_fire.waste_kinds, '{}'), v_fire.waste_contractor, v_fire.waste_collectors,
        coalesce(v_fire.has_third_parties, false), v_user
      );
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'fire_equipment', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'workplace_key', 'workplace_id', 'kind', 'agent', 'capacity', 'wheeled', 'label', 'location',
      'manufactured_year', 'last_service_on', 'next_service_on', 'maintainer'
    ], 'fire equipment unit');
    v_unit := jsonb_populate_record(null::public.fire_equipment, v_item);
    insert into public.fire_equipment (
      organization_id, client_id, workplace_id, kind, agent, capacity, wheeled, label, location,
      manufactured_year, last_service_on, next_service_on, maintainer, created_by
    )
    values (
      v_org, v_client_id, public.import_reference(v_item, 'workplace', v_workplaces), v_unit.kind,
      v_unit.agent, v_unit.capacity, coalesce(v_unit.wheeled, false), v_unit.label, v_unit.location,
      v_unit.manufactured_year, v_unit.last_service_on, v_unit.next_service_on, v_unit.maintainer,
      v_user
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'fire_installations', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'workplace_key', 'workplace_id', 'kind', 'description', 'maintainer', 'last_check_on', 'next_check_on'
    ], 'fire installation');
    v_installation := jsonb_populate_record(null::public.fire_installations, v_item);
    insert into public.fire_installations (
      organization_id, client_id, workplace_id, kind, description, maintainer, last_check_on,
      next_check_on, created_by
    )
    values (
      v_org, v_client_id, public.import_reference(v_item, 'workplace', v_workplaces),
      v_installation.kind, v_installation.description, v_installation.maintainer,
      v_installation.last_check_on, v_installation.next_check_on, v_user
    );
  end loop;

  -- Another company's files go to that company's import, and a HEIC photograph whose JPEG was
  -- never made has nothing client-files takes.
  for v_file in
    select f.* from public.import_files f
    where f.import_id = p_import_id
      and f.state not in ('uploading', 'other_company')
      and (f.mime_type not in ('image/heic', 'image/heif') or f.derived_path is not null)
    order by f.upload_path, f.id
  loop
    v_heic := v_file.mime_type in ('image/heic', 'image/heif');
    insert into public.client_files (
      organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256,
      uploaded_by, import_id, import_path
    )
    values (
      v_org,
      v_client_id,
      left(coalesce(nullif(btrim(regexp_replace(v_file.original_file_name, '\.[^.]*$', '')), ''), v_file.original_file_name), 200),
      case
        when v_heic then left(regexp_replace(v_file.original_file_name, '\.[^.]*$', ''), 251) || '.jpg'
        else v_file.original_file_name
      end,
      case when v_heic then 'image/jpeg' else v_file.mime_type end,
      case when v_heic then v_file.derived_size_bytes else v_file.size_bytes end,
      case when v_heic then v_file.derived_sha256 else v_file.sha256 end,
      v_import.created_by,
      p_import_id,
      nullif(regexp_replace(v_file.upload_path, '/?[^/]*$', ''), '')
    )
    returning id into v_id;
    update public.import_files set client_file_id = v_id where id = v_file.id;
  end loop;

  update public.imports set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = v_user,
    client_id = v_client_id,
    quality = p_payload -> 'quality'
  where id = p_import_id;

  return jsonb_build_object(
    'client_id', v_client_id,
    'files', coalesce(
      (select jsonb_agg(to_jsonb(c)) from public.import_folder_copies(p_import_id) c),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.apply_client_import(uuid, integer, jsonb) is $comment$
Confirms a ready client import in one transaction (ADR 030) and returns
{"client_id": uuid, "files": [{"client_file_id", "source_path", "target_path"}]}: the objects the
API then copies from the imports bucket into client-files, which import_folder_copies lists again.

p_payload is shaped like the tables, not like the proposal. Every object refuses fields it does
not name. Column fields take the column's values and types; JSON null or absent leaves a column
to its default.
{
  "client": { legal_name, cui, vat_payer, caen_code, trade_register_number, county_code, locality,
    address_line, legal_representative_name, legal_representative_role, contact_name,
    contact_email, contact_phone, periodic_training_minutes,
    administrative_training_interval_months, administrative_training_not_applicable,
    worker_training_interval_months, worker_training_not_applicable, training_first_month,
    training_day_from, training_day_to, replace },
  "workplaces": [{ key, id, replace, name, is_registered_office, kind, county_code, locality,
    address_line, activity, floor_area_m2, extinguisher_norm, assembly_point,
    combustible_materials, ignition_sources, fire_risk_equipment, specific_measures }],
  "job_positions": [{ key, id, replace, name, staff_category, work_zone, activities,
    training_interval_months, needs_protective_equipment }],
  "equipment": [{ job_position_key | job_position_id, risk, item, quantity, duration_months,
    allocation }],
  "employees": [{ key, job_position_key | job_position_id, workplace_key | workplace_id,
    last_name, first_name, job_title, hired_at, cnp, employee_number, email, phone,
    contract_number }],
  "responsible_persons": [{ employee_key | employee_id, workplace_key | workplace_id, full_name,
    job_title, roles }],
  "fire_safety": { periodic_training_hours, administrative_training_interval_months,
    worker_training_interval_months, training_first_month, training_day_from, training_day_to,
    smoking_policy, smoking_place, waste_kinds, waste_contractor, waste_collectors,
    has_third_parties, replace },
  "fire_equipment": [{ workplace_key | workplace_id, kind, agent, capacity, wheeled, label,
    location, manufactured_year, last_service_on, next_service_on, maintainer }],
  "fire_installations": [{ workplace_key | workplace_id, kind, description, maintainer,
    last_check_on, next_check_on }],
  "quality": { <section>: { "changed": n, "unticked": n, "kept": n } }
}
Only "client" is required. A new client's import creates the client from "client"; an existing
client's fills its empty columns and leaves the others as they are, except the columns listed in
"replace", which take the payload's value. "cui", when given for an existing client, must be its
CUI. A category's "not applicable" also fills a client that has neither it nor an interval for
the category. A workplace or job position with "id" is an existing row of the client, filled the
same way; a job position without "id" named like an active one of the client is that one. A job
position's "needs_protective_equipment" is false or absent: its entries decide that it needs
some. Every other item is a new row. "key" is any string unique within its list; an item names a
row of another list by its "key" in this payload or by the "id" of an existing row of the client.
An employee without a job position gets the one named like their job title, created when
missing. The workers' representative is a responsible person whose employee is one of
"employees". A room where fire-safety means stand is their "location". "quality" is stored on the
import as given.
$comment$;
