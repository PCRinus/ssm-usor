-- Every file of the documents bucket is under its organization, so that one organization's files
-- are found by one prefix. Not valid: older rows name files under their kind
-- ("signed-sheets/<client>/…"), and they are evidence written once.
alter table public.signed_sheets
  add constraint signed_sheets_path_in_organization
    check (split_part(storage_path, '/', 1) = organization_id::text) not valid;

alter table public.test_sheets
  add constraint test_sheets_path_in_organization
    check (split_part(storage_path, '/', 1) = organization_id::text) not valid;

-- employee_signing_agreements.storage_path gets none: only settle_signing_agreement() writes it,
-- copying a signature's path held here, and members still update older agreements (a withdrawal),
-- which a not-valid check would refuse for the old path they keep.
alter table public.agreement_signatures
  add constraint agreement_signatures_path_in_organization
    check (split_part(storage_path, '/', 1) = organization_id::text) not valid;

-- Members create draft revisions with a path of their choosing under their organization, and the
-- storage policies let them read, write and remove the files a draft names. The evidence is now
-- under the organization too, so no revision may name its folders.
alter table public.document_revisions
  add constraint document_revisions_path_not_evidence
    check (split_part(docx_path, '/', 2) not in ('signed-sheets', 'test-sheets', 'signing-agreements'));

create or replace function public.delete_archived_client(p_organization_id uuid, p_client_id uuid)
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_imports uuid[];
  v_documents uuid[];
  v_buckets text[];
  v_paths text[];
begin
  select c.* into v_client
  from public.clients c
  where c.id = p_client_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'No such client.' using errcode = 'P0002';
  end if;
  if v_client.archived_at is null then
    raise exception 'Only an archived client is deleted.' using errcode = 'CLA02';
  end if;

  select coalesce(array_agg(i.id), '{}') into v_imports
  from public.imports i where i.client_id = p_client_id;
  select coalesce(array_agg(d.id), '{}') into v_documents
  from public.client_documents d where d.client_id = p_client_id;

  select coalesce(array_agg(recorded.bucket), '{}'), coalesce(array_agg(recorded.path), '{}')
  into v_buckets, v_paths
  from (
    select 'documents' as bucket, p as path
    from (
      select r.docx_path from public.document_revisions r where r.document_id = any (v_documents)
      union all select r.pdf_path from public.document_revisions r where r.document_id = any (v_documents)
      union all select s.storage_path from public.document_signed_copies s where s.document_id = any (v_documents)
      union all select s.storage_path from public.signed_sheets s where s.client_id = p_client_id
      union all select s.storage_path from public.test_sheets s where s.client_id = p_client_id
      union all select a.storage_path from public.employee_signing_agreements a where a.client_id = p_client_id
      union all select a.storage_path from public.agreement_signatures a where a.client_id = p_client_id
    ) as rows (p)
    where p is not null
    union all
    select 'client-files', f.storage_path from public.client_files f where f.client_id = p_client_id
    union all
    select 'imports', v.p
    from public.import_files f
    cross join lateral (values (f.storage_path), (f.text_path), (f.derived_path)) as v (p)
    where f.import_id = any (v_imports) and v.p is not null
  ) as recorded;

  -- The evidence of a signature, a finished test and a sheet is never deleted otherwise. The
  -- triggers are disabled inside this transaction only, and the foreign keys still refuse a row
  -- this function forgot.
  alter table public.training_signatures disable trigger training_signatures_written_once;
  alter table public.agreement_signatures disable trigger agreement_signatures_written_once;
  alter table public.test_sheet_signatures disable trigger test_sheet_signatures_written_once;
  alter table public.test_sheets disable trigger test_sheets_kept;
  alter table public.test_attempts disable trigger test_attempts_frozen;
  alter table public.test_attempt_keys disable trigger test_attempt_keys_frozen;
  alter table public.test_results disable trigger test_results_protect_from_attempt;
  alter table public.employee_signing_agreements disable trigger employee_signing_agreements_retain_recorded;

  delete from public.training_signatures where client_id = p_client_id;
  delete from public.test_sheet_signatures where client_id = p_client_id;
  delete from public.agreement_signatures where client_id = p_client_id;
  delete from public.signed_sheet_rows where client_id = p_client_id;
  delete from public.signed_sheets where client_id = p_client_id;
  delete from public.signature_requests where client_id = p_client_id;
  delete from public.test_sheets where client_id = p_client_id;
  delete from public.test_results where client_id = p_client_id;
  delete from public.test_attempts where client_id = p_client_id;
  delete from public.training_records where client_id = p_client_id;
  delete from public.trainings where client_id = p_client_id;
  delete from public.participant_invitations where client_id = p_client_id;
  delete from public.client_participants where client_id = p_client_id;
  delete from public.employee_signing_agreements where client_id = p_client_id;

  delete from public.service_contract_sends where document_id = any (v_documents);
  delete from public.document_signed_copies where document_id = any (v_documents);
  delete from public.document_revisions where document_id = any (v_documents);
  delete from public.client_documents where client_id = p_client_id;
  delete from public.document_generations where client_id = p_client_id;
  delete from public.regeneration_job_items where client_id = p_client_id;

  delete from public.prevention_measures where client_id = p_client_id;
  delete from public.risk_factors where client_id = p_client_id;
  delete from public.risk_evaluations where client_id = p_client_id;
  delete from public.job_position_equipment where client_id = p_client_id;
  delete from public.job_position_instructions where client_id = p_client_id;

  -- Client files first: deleting an import file would clear a page file's link to it, which
  -- client_files_import_page_of_file refuses.
  delete from public.client_files where client_id = p_client_id;
  delete from public.import_files where import_id = any (v_imports);
  delete from public.imports where id = any (v_imports);

  delete from public.client_responsible_persons where client_id = p_client_id;
  update public.clients set legal_representative_employee_id = null where id = p_client_id;
  delete from public.employees where client_id = p_client_id;
  delete from public.fire_buildings where client_id = p_client_id;
  delete from public.fire_equipment where client_id = p_client_id;
  delete from public.fire_installations where client_id = p_client_id;
  delete from public.fire_maintenance_items where client_id = p_client_id;
  delete from public.fire_substances where client_id = p_client_id;
  delete from public.client_fire_safety where client_id = p_client_id;
  delete from public.job_positions where client_id = p_client_id;
  delete from public.client_workplaces where client_id = p_client_id;
  delete from public.client_owner_notes where client_id = p_client_id;
  delete from public.service_contracts where client_id = p_client_id;
  delete from public.clients where id = p_client_id;

  alter table public.training_signatures enable trigger training_signatures_written_once;
  alter table public.agreement_signatures enable trigger agreement_signatures_written_once;
  alter table public.test_sheet_signatures enable trigger test_sheet_signatures_written_once;
  alter table public.test_sheets enable trigger test_sheets_kept;
  alter table public.test_attempts enable trigger test_attempts_frozen;
  alter table public.test_attempt_keys enable trigger test_attempt_keys_frozen;
  alter table public.test_results enable trigger test_results_protect_from_attempt;
  alter table public.employee_signing_agreements enable trigger employee_signing_agreements_retain_recorded;

  -- A signed sheet and a test sheet leave every earlier version in place, which no row names.
  -- Older evidence is under its kind rather than its organization.
  return query
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where (o.bucket_id = 'documents' and (
      o.name like p_organization_id::text || '/' || p_client_id::text || '/%'
      or o.name like p_organization_id::text || '/signed-sheets/' || p_client_id::text || '/%'
      or o.name like p_organization_id::text || '/test-sheets/' || p_client_id::text || '/%'
      or o.name like p_organization_id::text || '/signing-agreements/' || p_client_id::text || '/%'
      or o.name like 'signed-sheets/' || p_client_id::text || '/%'
      or o.name like 'test-sheets/' || p_client_id::text || '/%'
      or o.name like 'signing-agreements/' || p_client_id::text || '/%'
    ))
    or (o.bucket_id = 'client-files' and o.name like p_organization_id::text || '/' || p_client_id::text || '/%')
    or (o.bucket_id = 'imports' and split_part(o.name, '/', 1) = p_organization_id::text
      and split_part(o.name, '/', 2) = any (v_imports::text[]))
    or (o.bucket_id, o.name) in (select * from unnest(v_buckets, v_paths))
  order by 1, 2;
end;
$$;

revoke all on function public.delete_archived_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_archived_client(uuid, uuid) to service_role;
