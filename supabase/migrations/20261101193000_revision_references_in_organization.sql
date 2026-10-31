-- A foreign key check ignores row-level security, so a reference by id alone lets a member name
-- another organization's row wherever a policy lets them write the column.

create unique index document_revisions_id_organization_key
  on public.document_revisions (id, organization_id);
create unique index document_revisions_id_document_key
  on public.document_revisions (id, document_id);
create unique index document_generations_id_organization_key
  on public.document_generations (id, organization_id);
create unique index client_files_id_organization_key
  on public.client_files (id, organization_id);
create unique index import_files_id_organization_key
  on public.import_files (id, organization_id);
create unique index import_files_id_import_key
  on public.import_files (id, import_id);

-- A column list on SET NULL: organization_id is not null and stays.
alter table public.trainings
  drop constraint trainings_themes_revision_id_fkey,
  add constraint trainings_themes_revision_in_organization
    foreign key (themes_revision_id, organization_id)
    references public.document_revisions (id, organization_id)
    on delete set null (themes_revision_id);

alter table public.test_attempts
  drop constraint test_attempts_material_revision_id_fkey,
  add constraint test_attempts_material_revision_in_organization
    foreign key (material_revision_id, organization_id)
    references public.document_revisions (id, organization_id)
    on delete set null (material_revision_id);

alter table public.service_contract_sends
  drop constraint service_contract_sends_revision_id_fkey,
  add constraint service_contract_sends_revision_of_document
    foreign key (revision_id, document_id)
    references public.document_revisions (id, document_id)
    on delete restrict;

alter table public.document_revisions
  drop constraint document_revisions_generation_id_fkey,
  add constraint document_revisions_generation_in_organization
    foreign key (generation_id, organization_id)
    references public.document_generations (id, organization_id)
    on delete restrict;

alter table public.imports
  drop constraint imports_source_import_id_fkey,
  add constraint imports_source_import_in_organization
    foreign key (source_import_id, organization_id)
    references public.imports (id, organization_id)
    on delete set null (source_import_id);

-- The keys between client files and import files keep their names: the API embeds through them
-- by name, as two relationships join the same tables.
alter table public.import_files
  drop constraint import_files_client_file_id_fkey,
  add constraint import_files_client_file_id_fkey
    foreign key (client_file_id, organization_id)
    references public.client_files (id, organization_id)
    on delete set null (client_file_id);

alter table public.client_files
  drop constraint client_files_import_file_id_fkey,
  add constraint client_files_import_file_id_fkey
    foreign key (import_file_id, import_id)
    references public.import_files (id, import_id)
    on delete set null (import_file_id);

alter table public.import_files
  drop constraint import_files_source_file_id_fkey,
  add constraint import_files_source_file_in_organization
    foreign key (source_file_id, organization_id)
    references public.import_files (id, organization_id)
    on delete set null (source_file_id);
