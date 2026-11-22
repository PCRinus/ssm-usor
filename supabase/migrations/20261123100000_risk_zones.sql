-- The record of high and specific risk zones (ADR 045). A zone is the specialist's call: the app
-- suggests some from the unacceptable factors but never writes one by itself.
--   RZN01  the risk zones state follows the zones
--   RZN02  a zone needs a linked factor or measures of its own
--   RZN03  the workplace is not a current one of the zone's client
--   RZN04  a factor is not one of the zone's client

create table public.risk_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null constraint risk_zones_name_length check (char_length(btrim(name)) between 2 and 160),
  workplace_id uuid,
  location text constraint risk_zones_location_length check (char_length(btrim(location)) between 1 and 300),
  measures text constraint risk_zones_measures_length check (char_length(btrim(measures)) between 1 and 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Workplaces are archived, never deleted, so a zone keeps the one it named.
  constraint risk_zones_workplace_in_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict,
  constraint risk_zones_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint risk_zones_id_client unique (id, client_id)
);

create unique index risk_zones_name_key on public.risk_zones (client_id, lower(btrim(name)));
create index risk_zones_organization_id_idx on public.risk_zones (organization_id, updated_at);

comment on table public.risk_zones is
  'A zone of high and specific risk the specialist names for a client, printed in document 9.2 (ADR 045).';

create trigger risk_zones_set_updated_at before update on public.risk_zones
  for each row execute function public.set_updated_at();

create trigger risk_zones_protect_archived_client
  before insert or update or delete on public.risk_zones
  for each row execute function public.protect_rows_of_archived_client();

create trigger risk_zones_protect_lead before insert on public.risk_zones
  for each row execute function public.protect_rows_of_lead();

-- Linked, not copied, so the record prints the factor's current level and measures. Deleting a
-- factor is never refused for a zone: its link goes, and a zone may be left with neither
-- factors nor measures.
create table public.risk_zone_factors (
  zone_id uuid not null,
  factor_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (zone_id, factor_id),
  constraint risk_zone_factors_zone_in_client
    foreign key (zone_id, client_id) references public.risk_zones (id, client_id) on delete cascade,
  constraint risk_zone_factors_factor_in_client
    foreign key (factor_id, client_id) references public.risk_factors (id, client_id) on delete cascade,
  constraint risk_zone_factors_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create index risk_zone_factors_factor_id_idx on public.risk_zone_factors (factor_id);
create index risk_zone_factors_organization_id_idx on public.risk_zone_factors (organization_id);

comment on table public.risk_zone_factors is
  'The risk factors a risk zone is linked to, of the same client (ADR 045).';

create trigger risk_zone_factors_protect_archived_client
  before insert or update or delete on public.risk_zone_factors
  for each row execute function public.protect_rows_of_archived_client();

create type public.risk_zones_state as enum ('undecided', 'none', 'listed');

alter table public.clients
  add column risk_zones_state public.risk_zones_state not null default 'undecided';

comment on column public.clients.risk_zones_state is
  'Undecided blocks document 9.2; none is the client''s declaration that it has no zones of high and specific risk; listed follows its zones (ADR 045).';

-- `listed` exactly while the client has a zone, so a declaration never sits beside a zone and
-- nobody writes `listed` by hand.
create function public.protect_risk_zones_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.risk_zones_state is not distinct from old.risk_zones_state then
    return new;
  end if;
  if (new.risk_zones_state = 'listed') <> exists (
    select 1 from public.risk_zones z where z.client_id = new.id
  ) then
    raise exception 'The risk zones state follows the zones.' using errcode = 'RZN01';
  end if;
  return new;
end;
$$;

create trigger clients_protect_risk_zones_state before update on public.clients
  for each row execute function public.protect_risk_zones_state();

-- Runs as its owner: the member who adds or deletes a zone need not hold the right to change the
-- client's row. After the statement, so deleting several zones at once sees what is left.
create function public.sync_risk_zones_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.clients set risk_zones_state = 'listed'
    where id = new.client_id and risk_zones_state <> 'listed';
  else
    update public.clients set risk_zones_state = 'undecided'
    where id = old.client_id and risk_zones_state = 'listed'
      and not exists (select 1 from public.risk_zones z where z.client_id = old.client_id);
  end if;
  return null;
end;
$$;

create trigger risk_zones_sync_state
  after insert or delete on public.risk_zones
  for each row execute function public.sync_risk_zones_state();

revoke all on function public.protect_risk_zones_state() from public, anon;
revoke all on function public.sync_risk_zones_state() from public, anon;

-- A zone and its links in one transaction, as the caller, so the policies and the
-- archived-client triggers decide. Without p_zone_id it adds a zone; with it, it replaces the
-- zone's fields and links. Returns null when the client, or the zone within it, is not the
-- caller's to see.
create function public.save_risk_zone(
  p_client_id uuid,
  p_name text,
  p_factor_ids uuid[],
  p_zone_id uuid default null,
  p_workplace_id uuid default null,
  p_location text default null,
  p_measures text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_client public.clients;
  v_previous_workplace_id uuid;
  v_factor_ids uuid[] := array(select distinct f from unnest(coalesce(p_factor_ids, '{}')) as f where f is not null);
  v_saved_id uuid;
begin
  select * into v_client from public.clients c where c.id = p_client_id;
  if not found then
    return null;
  end if;
  if p_zone_id is not null then
    select z.workplace_id into v_previous_workplace_id
    from public.risk_zones z where z.id = p_zone_id and z.client_id = p_client_id;
    if not found then
      return null;
    end if;
  end if;

  if cardinality(v_factor_ids) = 0 and nullif(btrim(p_measures), '') is null then
    raise exception 'A zone needs a linked factor or measures of its own.' using errcode = 'RZN02';
  end if;
  -- A workplace archived after the zone named it stays, so the zone saves again unchanged.
  if p_workplace_id is not null and not exists (
    select 1 from public.client_workplaces w
    where w.id = p_workplace_id and w.client_id = p_client_id
      and (w.archived_at is null or w.id = v_previous_workplace_id)
  ) then
    raise exception 'The workplace is not a current one of the client.' using errcode = 'RZN03';
  end if;
  if exists (
    select 1 from unnest(v_factor_ids) as f (id)
    where not exists (
      select 1 from public.risk_factors r where r.id = f.id and r.client_id = p_client_id
    )
  ) then
    raise exception 'A linked factor is not one of the client''s.' using errcode = 'RZN04';
  end if;

  if p_zone_id is null then
    insert into public.risk_zones (
      organization_id, client_id, name, workplace_id, location, measures, created_by
    )
    values (
      v_client.organization_id, p_client_id, p_name, p_workplace_id, p_location, p_measures,
      (select auth.uid())
    )
    returning id into v_saved_id;
  else
    update public.risk_zones set
      name = p_name,
      workplace_id = p_workplace_id,
      location = p_location,
      measures = p_measures
    where id = p_zone_id and client_id = p_client_id
    returning id into v_saved_id;
    delete from public.risk_zone_factors
    where zone_id = v_saved_id and factor_id <> all (v_factor_ids);
  end if;

  insert into public.risk_zone_factors (zone_id, factor_id, organization_id, client_id, created_by)
  select v_saved_id, f, v_client.organization_id, p_client_id, (select auth.uid())
  from unnest(v_factor_ids) as f
  on conflict (zone_id, factor_id) do nothing;

  return v_saved_id;
end;
$$;

revoke all on function public.save_risk_zone(uuid, text, uuid[], uuid, uuid, text, text) from public, anon;
grant execute on function public.save_risk_zone(uuid, text, uuid[], uuid, uuid, text, text) to authenticated;

alter table public.risk_zones enable row level security;
alter table public.risk_zone_factors enable row level security;
revoke all on table public.risk_zones from anon;
revoke all on table public.risk_zone_factors from anon;

create policy "members read their risk zones"
  on public.risk_zones for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members create risk zones for their active clients"
  on public.risk_zones for insert to authenticated
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = risk_zones.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

create policy "members update their risk zones"
  on public.risk_zones for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

create policy "members delete their risk zones"
  on public.risk_zones for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

revoke update on table public.risk_zones from authenticated;
grant update (name, workplace_id, location, measures) on table public.risk_zones to authenticated;

create policy "members read their risk zone factors"
  on public.risk_zone_factors for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members link risk zone factors for their active clients"
  on public.risk_zone_factors for insert to authenticated
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = risk_zone_factors.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

create policy "members unlink their risk zone factors"
  on public.risk_zone_factors for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

revoke update on table public.risk_zone_factors from authenticated;

-- Its zones go before the factors and workplaces they name.
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

  -- The client's legal name and CUI name the company, not a person, and nothing else will once
  -- its row is gone.
  insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
  select 'client_deleted', 'clients', v_client.id, v_client.organization_id,
    jsonb_build_object('legal_name', v_client.legal_name, 'cui', v_client.cui),
    a.actor_id, a.impersonating_user_id, a.source
  from audit.current_actor() as a;
  perform set_config('audit.suppressed', 'delete_archived_client', true);

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

  delete from public.risk_zones where client_id = p_client_id;
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

  perform set_config('audit.suppressed', '', true);

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
