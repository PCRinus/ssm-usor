-- Where the person lives when it is not the address on their identity card (domiciliul). The
-- individual training sheets print only the domicile (HG 1425/2006 annex 11), so this one prints
-- nowhere.
alter table public.employees
  add column residence_address text
    constraint employees_residence_address_length check (char_length(btrim(residence_address)) between 1 and 240);

comment on column public.employees.residence_address is
  'Where the person lives when it differs from home_address, the domicile on the identity card; null when it does not or is not known.';

create or replace function public.apply_employee_import(p_import_id uuid, p_expected_version integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_employee_columns constant text[] := array[
    'job_position_id', 'workplace_id', 'last_name', 'first_name', 'cnp', 'employee_number',
    'birth_date', 'birth_place', 'home_address', 'residence_address', 'education',
    'qualification', 'blood_group', 'rh_factor', 'job_title', 'hired_at', 'commute_route',
    'commute_minutes', 'status', 'terminated_at'
  ];
  c_training_columns constant text[] := array[
    'domain', 'phase', 'held_on', 'duration_minutes', 'material', 'trainer_name',
    'trainer_job_title', 'verifier_name', 'verifier_job_title', 'supplementary_reason'
  ];
  v_user uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'Europe/Bucharest')::date;
  v_import public.imports;
  v_org uuid;
  v_client public.clients;
  v_item jsonb;
  v_record jsonb;
  v_employees jsonb := '{}';
  v_employee public.employees;
  v_training public.trainings;
  v_admission public.training_records;
  v_result public.test_results;
  v_file public.import_files;
  v_employee_id uuid;
  v_id uuid;
  v_derived boolean;
  v_page integer;
  v_image public.import_page_images;
  v_stem text;
  v_name text;
  v_record_ids uuid[] := '{}';
  v_result_ids uuid[] := '{}';
begin
  v_import := public.lock_visible_import(p_import_id);
  v_org := v_import.organization_id;
  if v_import.kind <> 'employees' then
    raise exception 'Only an employee import is confirmed by this function.' using errcode = '22023';
  end if;
  if v_import.status <> 'ready' then
    raise exception 'The import is not ready for review.' using errcode = 'IMP01';
  end if;
  if v_import.version <> p_expected_version then
    raise exception 'The import was saved since it was read.' using errcode = 'IMP02';
  end if;
  perform public.import_payload_keys(p_payload, array[
    'employees', 'trainings', 'test_results', 'files', 'quality'
  ], 'payload');

  select c.* into v_client from public.clients c where c.id = v_import.client_id for update;
  if v_client.archived_at is not null then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'employees', '[]')) loop
    perform public.import_payload_keys(v_item, c_employee_columns || array['key', 'id', 'replace'], 'employee');
    if v_item ? 'job_position_id' and not exists (
      select 1 from public.job_positions p
      where p.id = (v_item ->> 'job_position_id')::uuid and p.client_id = v_client.id and p.archived_at is null
    ) then
      raise exception 'The client has no active job position %.', v_item ->> 'job_position_id' using errcode = '22023';
    end if;
    if v_item ? 'workplace_id' and not exists (
      select 1 from public.client_workplaces w
      where w.id = (v_item ->> 'workplace_id')::uuid and w.client_id = v_client.id and w.archived_at is null
    ) then
      raise exception 'The client has no active workplace %.', v_item ->> 'workplace_id' using errcode = '22023';
    end if;
    if v_item ? 'workplace_id' and exists (
      select 1 from public.client_workplaces w
      where w.id = (v_item ->> 'workplace_id')::uuid and not w.office_has_activity
    ) and not exists (
      select 1 from public.employees e
      where e.id = (v_item ->> 'id')::uuid and e.workplace_id = (v_item ->> 'workplace_id')::uuid
    ) then
      raise exception 'No activity takes place at the registered office %.', v_item ->> 'workplace_id'
        using errcode = '22023';
    end if;

    if v_item ? 'id' then
      select e.* into v_employee from public.employees e
      where e.id = (v_item ->> 'id')::uuid and e.client_id = v_client.id and e.archived_at is null
      for update;
      if not found then
        raise exception 'The client has no employee %.', v_item ->> 'id' using errcode = '22023';
      end if;
      v_employee := jsonb_populate_record(
        v_employee, public.import_patch(to_jsonb(v_employee), v_item, c_employee_columns)
      );
      update public.employees set
        job_position_id = v_employee.job_position_id,
        workplace_id = v_employee.workplace_id,
        last_name = v_employee.last_name,
        first_name = v_employee.first_name,
        cnp = v_employee.cnp,
        employee_number = v_employee.employee_number,
        birth_date = v_employee.birth_date,
        birth_place = v_employee.birth_place,
        home_address = v_employee.home_address,
        residence_address = v_employee.residence_address,
        education = v_employee.education,
        qualification = v_employee.qualification,
        blood_group = v_employee.blood_group,
        rh_factor = v_employee.rh_factor,
        job_title = v_employee.job_title,
        hired_at = v_employee.hired_at,
        commute_route = v_employee.commute_route,
        commute_minutes = v_employee.commute_minutes,
        status = v_employee.status,
        terminated_at = v_employee.terminated_at
      where id = v_employee.id;
      v_employee_id := v_employee.id;
    else
      -- Named always, so default_employee_job_position never makes a position from a job title.
      if not v_item ? 'job_position_id' then
        raise exception 'A new employee of an import names their job position.' using errcode = '22023';
      end if;
      v_employee := jsonb_populate_record(null::public.employees, v_item);
      insert into public.employees (
        organization_id, client_id, job_position_id, workplace_id, last_name, first_name, cnp,
        employee_number, birth_date, birth_place, home_address, residence_address, education,
        qualification, blood_group, rh_factor, job_title, hired_at, commute_route, commute_minutes,
        status, terminated_at, created_by
      )
      values (
        v_org, v_client.id, v_employee.job_position_id, v_employee.workplace_id, v_employee.last_name,
        v_employee.first_name, v_employee.cnp, v_employee.employee_number, v_employee.birth_date,
        v_employee.birth_place, v_employee.home_address, v_employee.residence_address,
        v_employee.education,
        v_employee.qualification, v_employee.blood_group, v_employee.rh_factor, v_employee.job_title,
        v_employee.hired_at, v_employee.commute_route, v_employee.commute_minutes,
        coalesce(v_employee.status, 'active'), v_employee.terminated_at, v_user
      )
      returning id into v_employee_id;
    end if;
    v_employees := public.import_add_key(v_employees, v_item, v_employee_id, 'employee');
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'trainings', '[]')) loop
    perform public.import_payload_keys(v_item, c_training_columns || array['key', 'records'], 'training');
    if jsonb_typeof(v_item -> 'records') is distinct from 'array' or jsonb_array_length(v_item -> 'records') = 0 then
      raise exception 'A training of an import payload has its attendees'' records.' using errcode = '22023';
    end if;
    -- Raised like the tables' own checks, so that the API names the rule as it names theirs.
    -- jsonb_populate_record would fail a duration beyond a smallint before the check could.
    if coalesce(v_item -> 'duration_minutes', 'null'::jsonb) <> 'null'::jsonb and not jsonb_path_exists(
      v_item, '$.duration_minutes ? (@.type() == "number" && @ >= 1 && @ <= 600 && @ == @.floor())'
    ) then
      raise exception 'new row for relation "trainings" violates check constraint "trainings_duration_range"'
        using errcode = '23514', table = 'trainings', constraint = 'trainings_duration_range';
    end if;
    v_training := jsonb_populate_record(null::public.trainings, v_item);
    if v_training.held_on > v_today then
      raise exception 'new row for relation "trainings" violates check constraint "trainings_held_on_past"'
        using errcode = '23514', table = 'trainings', constraint = 'trainings_held_on_past';
    end if;
    insert into public.trainings (
      organization_id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name,
      trainer_job_title, verifier_name, verifier_job_title, supplementary_reason, source, created_by
    )
    values (
      v_org, v_client.id, v_training.domain, v_training.phase, v_training.held_on,
      v_training.duration_minutes, v_training.material, v_training.trainer_name,
      v_training.trainer_job_title, v_training.verifier_name, v_training.verifier_job_title,
      v_training.supplementary_reason, 'paper', v_user
    )
    returning id into v_training.id;

    for v_record in select value from jsonb_array_elements(v_item -> 'records') loop
      perform public.import_payload_keys(v_record, array[
        'employee_key', 'admitted_on', 'admitted_by_name', 'admitted_by_job_title'
      ], 'training record');
      v_employee_id := public.import_reference(v_record, 'employee', v_employees);
      if v_employee_id is null then
        raise exception 'A training record of an import payload names its employee.' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.training_records r
        where r.training_id = v_training.id and r.employee_id = v_employee_id
      ) then
        raise exception 'An employee attends a training of an import payload once.' using errcode = '22023';
      end if;
      v_admission := jsonb_populate_record(null::public.training_records, v_record);
      -- The occupation the sheet prints is the job position's name, as the app's own save records it.
      insert into public.training_records (
        organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on,
        admitted_by_name, admitted_by_job_title, created_by
      )
      select
        v_org, v_client.id, v_training.id, v_training.phase, e.id, btrim(p.name),
        v_admission.admitted_on, v_admission.admitted_by_name, v_admission.admitted_by_job_title,
        v_user
      from public.employees e
      join public.job_positions p on p.id = e.job_position_id
      where e.id = v_employee_id
      returning id into v_id;
      v_record_ids := v_record_ids || v_id;
    end loop;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'test_results', '[]')) loop
    perform public.import_payload_keys(v_item, array[
      'employee_key', 'domain', 'test', 'taken_on', 'material', 'examiner_name', 'examiner_job_title'
    ], 'test result');
    v_employee_id := public.import_reference(v_item, 'employee', v_employees);
    if v_employee_id is null then
      raise exception 'A test result of an import payload names its employee.' using errcode = '22023';
    end if;
    v_result := jsonb_populate_record(null::public.test_results, v_item);
    if v_result.taken_on > v_today then
      raise exception 'new row for relation "test_results" violates check constraint "test_results_taken_on_past"'
        using errcode = '23514', table = 'test_results', constraint = 'test_results_taken_on_past';
    end if;
    if v_result.test = 'hiring' and exists (
      select 1 from public.test_results x
      where x.employee_id = v_employee_id and x.domain = v_result.domain and x.test = 'hiring'
    ) then
      raise exception 'new row for relation "test_results" violates check constraint "test_results_hiring_once"'
        using errcode = '23514', table = 'test_results', constraint = 'test_results_hiring_once';
    end if;
    insert into public.test_results (
      organization_id, client_id, employee_id, domain, test, taken_on, material, examiner_name,
      examiner_job_title, source, created_by
    )
    values (
      v_org, v_client.id, v_employee_id, v_result.domain, v_result.test, v_result.taken_on,
      v_result.material, v_result.examiner_name, v_result.examiner_job_title, 'paper', v_user
    )
    returning id into v_id;
    v_result_ids := v_result_ids || v_id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'files', '[]')) loop
    perform public.import_payload_keys(v_item, array['employee_key', 'import_file_id', 'page'], 'file');
    v_employee_id := public.import_reference(v_item, 'employee', v_employees);
    if v_employee_id is null then
      raise exception 'A file of an import payload names its employee.' using errcode = '22023';
    end if;
    select f.* into v_file from public.import_files f
    where f.id = (v_item ->> 'import_file_id')::uuid and f.import_id = p_import_id and f.state <> 'uploading';
    if not found then
      raise exception 'The import has no file %.', v_item ->> 'import_file_id' using errcode = '22023';
    end if;
    v_page := null;
    if v_file.mime_type = 'application/pdf' then
      if not jsonb_path_exists(v_item, '$.page ? (@.type() == "number" && @ >= 1 && @ <= 10000 && @ == @.floor())') then
        raise exception 'A PDF of an import goes to an employee page by page.' using errcode = '22023';
      end if;
      v_page := (v_item ->> 'page')::integer;
      select i.* into v_image from public.import_page_images i
      where i.import_file_id = v_file.id and i.page = v_page;
      if not found then
        raise exception 'The import''s file % has no image of page %.', v_file.id, v_page using errcode = '22023';
      end if;
    elsif v_item ? 'page' and v_item -> 'page' <> 'null'::jsonb then
      raise exception 'Only a PDF of an import has pages.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.client_files cf
      where cf.import_file_id = v_file.id and cf.employee_id = v_employee_id
        and cf.import_page is not distinct from v_page
    ) then
      continue;
    end if;
    v_derived := v_file.mime_type like 'image/%' and v_file.derived_path is not null;
    if v_page is null and not v_derived and v_file.mime_type not in ('image/jpeg', 'image/png') then
      raise exception 'The import''s file % has no copy an employee''s file takes.', v_file.id using errcode = '22023';
    end if;
    v_stem := regexp_replace(v_file.original_file_name, '\.[^.]*$', '');
    v_name := left(coalesce(nullif(btrim(v_stem), ''), v_file.original_file_name), 200);
    if v_page is not null then
      insert into public.client_files (
        organization_id, client_id, employee_id, name, original_file_name, mime_type, size_bytes,
        sha256, uploaded_by, import_id, import_file_id, import_page
      )
      values (
        v_org, v_client.id, v_employee_id,
        left(v_name, 180) || ' — pagina ' || v_page,
        left(v_stem, 230) || ' — pagina ' || v_page || '.jpg',
        'image/jpeg', v_image.size_bytes, v_image.sha256, v_import.created_by, p_import_id,
        v_file.id, v_page
      );
      -- A PDF found in the client's documentation pack is among the client's files already.
      if v_file.source_file_id is null and not exists (
        select 1 from public.client_files cf
        where cf.import_file_id = v_file.id and cf.employee_id is null
      ) then
        insert into public.client_files (
          organization_id, client_id, name, original_file_name, mime_type, size_bytes, sha256,
          uploaded_by, import_id, import_path, import_file_id
        )
        values (
          v_org, v_client.id, v_name, v_file.original_file_name, v_file.mime_type,
          v_file.size_bytes, v_file.sha256, v_import.created_by, p_import_id,
          nullif(regexp_replace(v_file.upload_path, '/?[^/]*$', ''), ''), v_file.id
        );
      end if;
      continue;
    end if;
    insert into public.client_files (
      organization_id, client_id, employee_id, name, original_file_name, mime_type, size_bytes,
      sha256, uploaded_by, import_id, import_file_id
    )
    values (
      v_org,
      v_client.id,
      v_employee_id,
      v_name,
      case when v_derived then left(v_stem, 251) || '.jpg' else v_file.original_file_name end,
      case when v_derived then 'image/jpeg' else v_file.mime_type end,
      case when v_derived then v_file.derived_size_bytes else v_file.size_bytes end,
      case when v_derived then v_file.derived_sha256 else v_file.sha256 end,
      v_import.created_by,
      p_import_id,
      v_file.id
    );
  end loop;

  update public.imports set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = v_user,
    quality = p_payload -> 'quality'
  where id = p_import_id;

  return jsonb_build_object(
    'client_id', v_client.id,
    'employees', v_employees,
    'training_record_ids', to_jsonb(v_record_ids),
    'test_result_ids', to_jsonb(v_result_ids),
    'files', coalesce(
      (select jsonb_agg(to_jsonb(c)) from public.import_folder_copies(p_import_id) c),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.apply_employee_import(uuid, integer, jsonb) is $comment$
Confirms a ready employee import in one transaction (ADR 032) and returns
{"client_id": uuid, "employees": {<key>: uuid}, "training_record_ids": [uuid],
"test_result_ids": [uuid], "files": [{"client_file_id", "source_path", "target_path"}]}: the
records and results whose rows the API then brings up to date on the stored signed sheets, and
the objects it copies from the imports bucket into client-files, which import_folder_copies lists
again.

p_payload is shaped like the tables, as packages/import's toEmployeePayload builds it. Every
object refuses fields it does not name. Column fields take the column's values and types.
{
  "employees": [{ key, id, replace, job_position_id, workplace_id, last_name, first_name, cnp,
    employee_number, birth_date, birth_place, home_address, residence_address, education,
    qualification, blood_group, rh_factor, job_title, hired_at, commute_route, commute_minutes,
    status, terminated_at }],
  "trainings": [{ key, domain, phase, held_on, duration_minutes, material, trainer_name,
    trainer_job_title, verifier_name, verifier_job_title, supplementary_reason,
    records: [{ employee_key, admitted_on, admitted_by_name, admitted_by_job_title }] }],
  "test_results": [{ employee_key, domain, test, taken_on, material, examiner_name,
    examiner_job_title }],
  "files": [{ employee_key, import_file_id, page }],
  "quality": { <section>: { "changed": n, "unticked": n, "kept": n } }
}
An employee without "id" is created and names an active job position of the client, so none is
ever made from the job title. One with "id" is an active employee of the client: its empty
columns are filled and those listed in "replace" take the payload's value; a leaver's "status"
and "terminated_at" are replaced together. A workplace is an active one of the client, never a
registered office where no activity takes place unless the employee already works there. Every other
list names an employee by the "key" of one of "employees". A training is held from paper, with a
record for each attendee carrying the name of their job position as the occupation, the
admission only on a workplace training; its day and a test's day are not after today in Romania,
and its duration, when the sheet gives one, is 1 to 600 minutes. Its trainer, the trainer's
function, its material and its duration are left out where the sheet does not give them (ADR 042).
A test result is a paper one, its examiner left out where the sheet names none; an employee has
at most one hiring result per domain. A file is one of the import's, kept as a client file of
the employee in the import's folder: a photograph as its upright JPEG, a PDF's page, which "page"
names, as the JPEG import_page_images describes. A PDF a page of an employee is in is also, whole
and once, a client file of the client in the import's folder, unless it is a copy of one found in
the client's documentation pack, which is among the client's files already. A file or a page
listed for several employees is a file of each. "quality" is stored on the import as given.
$comment$;
