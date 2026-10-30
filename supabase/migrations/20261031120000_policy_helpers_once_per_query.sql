-- A helper called bare in a policy runs for every row the policy checks; wrapped in a subquery,
-- the planner runs it once per query.

alter policy "members create documents for their active clients" on public.client_documents
  with check (
    (organization_id = (select public.current_organization_id()))
    and ((not owners_only) or (select public.is_organization_owner()))
    and (exists (select 1 from public.clients c where ((c.id = client_documents.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their client documents, owners also theirs alone" on public.client_documents
  using (
    (organization_id = (select public.current_organization_id()))
    and ((not owners_only) or (select public.is_organization_owner()))
  );

alter policy "members read their client files, owners also theirs alone" on public.client_files
  using (
    (organization_id = (select public.current_organization_id()))
    and ((not owners_only) or (select public.is_organization_owner()))
  );

alter policy "members upload files for their active clients" on public.client_files
  with check (
    (organization_id = (select public.current_organization_id()))
    and (uploaded_by = (select auth.uid() as uid))
    and ((not owners_only) or (select public.is_organization_owner()))
    and (exists (select 1 from public.clients c where ((c.id = client_files.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null) and ((c.stage = 'client'::public.client_stage) or (select public.is_organization_owner())))))
  );

alter policy "uploaders and owners change the files they see" on public.client_files
  using (
    (organization_id = (select public.current_organization_id()))
    and ((not owners_only) or (select public.is_organization_owner()))
    and ((uploaded_by = (select auth.uid() as uid)) or (select public.is_organization_owner()))
  )
  with check (organization_id = (select public.current_organization_id()));

alter policy "uploaders and owners delete the files they see" on public.client_files
  using (
    (organization_id = (select public.current_organization_id()))
    and ((not owners_only) or (select public.is_organization_owner()))
    and ((uploaded_by = (select auth.uid() as uid)) or (select public.is_organization_owner()))
  );

alter policy "members create fire safety for their active clients" on public.client_fire_safety
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = client_fire_safety.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their client fire safety" on public.client_fire_safety
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their client fire safety" on public.client_fire_safety
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "owners change the notes of their clients" on public.client_owner_notes
  using (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  )
  with check (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "owners read the notes of their clients" on public.client_owner_notes
  using (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "owners write the notes of their clients" on public.client_owner_notes
  with check (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "members create responsible persons for their active clients" on public.client_responsible_persons
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = client_responsible_persons.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their client responsible persons" on public.client_responsible_persons
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their client responsible persons" on public.client_responsible_persons
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create workplaces for their active clients" on public.client_workplaces
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = client_workplaces.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their client workplaces" on public.client_workplaces
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their client workplaces" on public.client_workplaces
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create clients, owners also leads" on public.clients
  with check (
    (organization_id = (select public.current_organization_id()))
    and ((stage = 'client'::public.client_stage) or (select public.is_organization_owner()))
  );

alter policy "members read their clients, owners also their leads" on public.clients
  using (
    (organization_id = (select public.current_organization_id()))
    and ((stage = 'client'::public.client_stage) or (select public.is_organization_owner()))
  );

alter policy "members update their clients, owners also their leads" on public.clients
  using (
    (organization_id = (select public.current_organization_id()))
    and ((stage = 'client'::public.client_stage) or (select public.is_organization_owner()))
  )
  with check (
    (organization_id = (select public.current_organization_id()))
    and ((stage = 'client'::public.client_stage) or (select public.is_organization_owner()))
  );

alter policy "members generate documents for their active clients" on public.document_generations
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = document_generations.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their document generations" on public.document_generations
  using (organization_id = (select public.current_organization_id()));

alter policy "members create draft revisions" on public.document_revisions
  with check (
    (organization_id = (select public.current_organization_id()))
    and (status = 'draft'::public.document_revision_status)
    and public.can_access_document(document_id)
  );

alter policy "members delete their draft revisions" on public.document_revisions
  using (
    (organization_id = (select public.current_organization_id()))
    and (status = 'draft'::public.document_revision_status)
    and public.can_access_document(document_id)
  );

alter policy "members update their draft revisions" on public.document_revisions
  using (
    (organization_id = (select public.current_organization_id()))
    and (status = 'draft'::public.document_revision_status)
    and public.can_access_document(document_id)
  )
  with check (
    (organization_id = (select public.current_organization_id()))
    and (status = 'draft'::public.document_revision_status)
  );

alter policy "members attach signed copies to documents they can read" on public.document_signed_copies
  with check (
    (organization_id = (select public.current_organization_id()))
    and public.can_access_document(document_id)
  );

alter policy "members remove signed copies of documents they can read" on public.document_signed_copies
  using (
    (organization_id = (select public.current_organization_id()))
    and public.can_access_document(document_id)
  );

alter policy "members replace signed copies of documents they can read" on public.document_signed_copies
  using (
    (organization_id = (select public.current_organization_id()))
    and public.can_access_document(document_id)
  )
  with check (
    (organization_id = (select public.current_organization_id()))
    and public.can_access_document(document_id)
  );

alter policy "members read built-in and their own templates" on public.document_templates
  using (
    ((select public.current_organization_id()) is not null)
    and ((organization_id is null) or (organization_id = (select public.current_organization_id())))
  );

alter policy "members create employees for their active clients" on public.employees
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = employees.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their employees" on public.employees
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their employees" on public.employees
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create evaluation profile factors" on public.evaluation_profile_factors
  with check (organization_id = (select public.current_organization_id()));

alter policy "members delete their evaluation profile factors" on public.evaluation_profile_factors
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their evaluation profile factors" on public.evaluation_profile_factors
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their evaluation profile factors" on public.evaluation_profile_factors
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create evaluation profile measures" on public.evaluation_profile_measures
  with check (organization_id = (select public.current_organization_id()));

alter policy "members delete their evaluation profile measures" on public.evaluation_profile_measures
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their evaluation profile measures" on public.evaluation_profile_measures
  using (organization_id = (select public.current_organization_id()));

alter policy "members create evaluation profiles" on public.evaluation_profiles
  with check (organization_id = (select public.current_organization_id()));

alter policy "members delete their evaluation profiles" on public.evaluation_profiles
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their evaluation profiles" on public.evaluation_profiles
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their evaluation profiles" on public.evaluation_profiles
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create fire buildings for their active clients" on public.fire_buildings
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = fire_buildings.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their fire buildings" on public.fire_buildings
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their fire buildings" on public.fire_buildings
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their fire buildings" on public.fire_buildings
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create fire equipment for their active clients" on public.fire_equipment
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = fire_equipment.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their fire equipment" on public.fire_equipment
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their fire equipment" on public.fire_equipment
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their fire equipment" on public.fire_equipment
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create fire installations for their active clients" on public.fire_installations
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = fire_installations.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their fire installations" on public.fire_installations
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their fire installations" on public.fire_installations
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their fire installations" on public.fire_installations
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create fire maintenance items for their active clients" on public.fire_maintenance_items
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = fire_maintenance_items.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their fire maintenance items" on public.fire_maintenance_items
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their fire maintenance items" on public.fire_maintenance_items
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their fire maintenance items" on public.fire_maintenance_items
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create fire substances for their active clients" on public.fire_substances
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = fire_substances.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their fire substances" on public.fire_substances
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their fire substances" on public.fire_substances
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their fire substances" on public.fire_substances
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members add instruction module versions" on public.instruction_module_versions
  with check (organization_id = (select public.current_organization_id()));

alter policy "members read their instruction module versions" on public.instruction_module_versions
  using (organization_id = (select public.current_organization_id()));

alter policy "members create instruction modules" on public.instruction_modules
  with check (organization_id = (select public.current_organization_id()));

alter policy "members read their instruction modules" on public.instruction_modules
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their instruction modules" on public.instruction_modules
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create equipment entries for their active clients" on public.job_position_equipment
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = job_position_equipment.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their equipment entries" on public.job_position_equipment
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their equipment entries" on public.job_position_equipment
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their equipment entries" on public.job_position_equipment
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members apply instructions for their active clients" on public.job_position_instructions
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = job_position_instructions.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members read their applied instructions" on public.job_position_instructions
  using (organization_id = (select public.current_organization_id()));

alter policy "members remove their applied instructions" on public.job_position_instructions
  using (organization_id = (select public.current_organization_id()));

alter policy "members create job positions for their active clients" on public.job_positions
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = job_positions.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their job positions" on public.job_positions
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their job positions" on public.job_positions
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their job positions" on public.job_positions
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "owners read their organization's invitations" on public.organization_invitations
  using (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "members read their organization members" on public.organization_members
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their organization" on public.organizations
  using (id = (select public.current_organization_id()));

alter policy "owners update their organization" on public.organizations
  using (
    (id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  )
  with check (
    (id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "members create prevention measures for their active clients" on public.prevention_measures
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = prevention_measures.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their prevention measures" on public.prevention_measures
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their prevention measures" on public.prevention_measures
  using (organization_id = (select public.current_organization_id()));

alter policy "users read their profile and their organization's" on public.profiles
  using ((user_id = (select auth.uid() as uid)) or (exists (select 1 from public.organization_members m where ((m.user_id = profiles.user_id) and (m.organization_id = (select public.current_organization_id()))))));

alter policy "members create risk evaluations for their active clients" on public.risk_evaluations
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = risk_evaluations.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their risk evaluations" on public.risk_evaluations
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their risk evaluations" on public.risk_evaluations
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their risk evaluations" on public.risk_evaluations
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "members create risk factors for their active clients" on public.risk_factors
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = risk_factors.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

alter policy "members delete their risk factors" on public.risk_factors
  using (organization_id = (select public.current_organization_id()));

alter policy "members read their risk factors" on public.risk_factors
  using (organization_id = (select public.current_organization_id()));

alter policy "members update their risk factors" on public.risk_factors
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

alter policy "owners record the sends of their issued contracts" on public.service_contract_sends
  with check (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
    and public.can_access_document(document_id)
    and (exists (select 1 from public.document_revisions r where ((r.id = service_contract_sends.revision_id) and (r.document_id = service_contract_sends.document_id) and (r.status = 'issued'::public.document_revision_status))))
  );

alter policy "owners change the contracts of their clients" on public.service_contracts
  using (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  )
  with check (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "owners read the contracts of their clients" on public.service_contracts
  using (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "owners write the contracts of their clients" on public.service_contracts
  with check (
    (organization_id = (select public.current_organization_id()))
    and (select public.is_organization_owner())
  );

alter policy "members read their organization's subscription" on public.subscriptions
  using (organization_id = (select public.current_organization_id()));

alter policy "members read template files" on storage.objects
  using (
    (bucket_id = 'document-templates'::text)
    and ((select public.current_organization_id()) is not null)
    and ((storage.foldername(name))[1] = any (array['built-in'::text, ((select public.current_organization_id()))::text]))
  );

alter policy "members read the files of documents they can read" on storage.objects
  using (
    (bucket_id = 'documents'::text)
    and ((storage.foldername(name))[1] = ((select public.current_organization_id()))::text)
    and public.is_readable_document_path(name)
  );

alter policy "members read their instruction module files" on storage.objects
  using (
    (bucket_id = 'instruction-modules'::text)
    and ((storage.foldername(name))[1] = ((select public.current_organization_id()))::text)
  );

-- The statuses compute from the row they are given rather than reading the status views by id,
-- which reads the employee again under its policies for every row of a list. They repeat the
-- views' logic: a change to one belongs in the other.
-- No search_path setting, and every name qualified instead: a function with one is never inlined.
create or replace function public.training_status(public.employees)
returns setof public.employee_training_status
rows 1
language sql
stable
as $$
  select
    $1.id,
    $1.client_id,
    $1.organization_id,
    ssm.last_periodic_on,
    ssm.workplace_trained_on,
    ssm.has_hiring_training,
    ssm.due_on,
    ssm.state,
    psi.last_periodic_on,
    psi.workplace_trained_on,
    psi.has_hiring_training,
    psi.due_on,
    psi.state,
    coalesce(p.training_interval_months, programme.ssm_months),
    case
      when p.training_interval_months is not null then 'position'
      when programme.ssm_months is not null then 'client'
    end,
    programme.psi_months,
    case when programme.psi_months is not null then 'client' end
  from public.job_positions p
  join public.clients c on c.id = $1.client_id
  left join public.client_fire_safety f on f.client_id = $1.client_id
  cross join lateral (
    select
      case p.staff_category
        when 'execution' then c.worker_training_interval_months
        else c.administrative_training_interval_months
      end as ssm_months,
      case p.staff_category
        when 'execution' then f.worker_training_interval_months
        else f.administrative_training_interval_months
      end as psi_months
  ) as programme
  cross join lateral public.employee_training_due(
    $1.id, $1.hired_at, $1.status, 'ssm', coalesce(p.training_interval_months, programme.ssm_months)::integer
  ) as ssm
  cross join lateral public.employee_training_due(
    $1.id, $1.hired_at, $1.status, 'psi', programme.psi_months::integer
  ) as psi
  where p.id = $1.job_position_id;
$$;

create or replace function public.test_status(public.employees)
returns setof public.employee_test_status
rows 1
language sql
stable
as $$
  select
    $1.id,
    $1.client_id,
    $1.organization_id,
    ssm.hiring_trained_on,
    ssm.last_passed_on,
    ssm.state,
    ssm.awaiting_test,
    psi.hiring_trained_on,
    psi.last_passed_on,
    psi.due_on,
    psi.state,
    psi.awaiting_test
  from public.employee_test_due($1.id, $1.status, 'ssm') as ssm
  cross join public.employee_test_due($1.id, $1.status, 'psi') as psi;
$$;

-- not in rather than not exists: the planner hashes the subquery once instead of rescanning the
-- other module list per row. Both lists' columns are not null, so the two mean the same.
create or replace view public.documents_behind
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
  where (am.document_id, am.module_id) not in (select cm.document_id, cm.module_id from cited_module cm)
  union all
  select cm.document_id, 'module_removed', m.title, null
  from cited_module cm
  join public.instruction_modules m on m.id = cm.module_id
  where (cm.document_id, cm.module_id) not in (select am.document_id, am.module_id from applied_module am)
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

-- Deleting a parent row checks each foreign key that points at it; without these, every check
-- reads the whole child table.
create index training_records_client_id_idx on public.training_records (client_id);
create index trainings_themes_revision_id_idx on public.trainings (themes_revision_id)
  where themes_revision_id is not null;
create index document_revisions_generation_id_idx on public.document_revisions (generation_id)
  where generation_id is not null;
create index client_responsible_persons_employee_id_client_id_idx
  on public.client_responsible_persons (employee_id, client_id)
  where employee_id is not null;
create index service_contract_sends_revision_id_idx on public.service_contract_sends (revision_id);
create index employee_signing_agreements_client_file_id_idx
  on public.employee_signing_agreements (client_file_id)
  where client_file_id is not null;
create index document_signed_copies_document_id_idx on public.document_signed_copies (document_id);
