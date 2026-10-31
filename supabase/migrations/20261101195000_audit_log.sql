-- The audit log (ADR 033): who changed what, when, under which organization, for every table
-- that holds personal data or a legally binding record. Our own table fed by triggers: supa_audit
-- stores whole rows, CNPs included, and pgaudit writes to logs the app cannot read and the
-- hosted plan keeps for days.
--
-- An event names the changed columns, never their values. A table may name a few columns whose
-- values say what happened without saying anything about a person (a state, a role, a stage);
-- those are kept as [old, new] in `details`.
--
-- The schema is not exposed by PostgREST and no API role has a privilege on it: support reads it
-- with SQL.
--   AUD01  an audit event is changed, deleted or truncated

create schema audit;

comment on schema audit is
  'The audit log (ADR 033). Not exposed by PostgREST; read with SQL by support.';

create table audit.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  action text not null constraint events_action_known check (
    action in ('insert', 'update', 'delete', 'impersonation_started', 'impersonation_ended', 'client_deleted')
  ),
  table_name text not null,
  row_id uuid,
  organization_id uuid,
  -- Null on a delete, or on an event that is not a row's change.
  changed_columns text[],
  details jsonb,
  -- No foreign keys: the log outlives the accounts, organizations and rows it names.
  actor_id uuid,
  impersonating_user_id uuid,
  -- `user`: a signed-in user's own token; `api`: the API with the secret key, acting for actor_id;
  -- `service`: the secret key acting for nobody signed in; `database`: no request at all.
  source text not null constraint events_source_known check (source in ('user', 'api', 'service', 'database')),
  transaction_id bigint not null default txid_current()
);

create index events_row_idx on audit.events (table_name, row_id, occurred_at);
create index events_actor_idx on audit.events (actor_id, occurred_at) where actor_id is not null;
create index events_organization_idx on audit.events (organization_id, occurred_at);

comment on table audit.events is
  'One event per row written in an audited table, with the names of the changed columns and never the values of personal ones (ADR 033).';

create function audit.refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The audit log is append-only.' using errcode = 'AUD01';
end;
$$;

create trigger events_append_only before update or delete on audit.events
  for each row execute function audit.refuse_change();
create trigger events_never_truncated before truncate on audit.events
  for each statement execute function audit.refuse_change();

-- Who a write is for. PostgREST switches to the role the verified JWT names, so `role` is
-- `service_role` only for the secret key, and only then is the API's header believed: a user's
-- token sending the header is still the user.
create function audit.current_actor(out actor_id uuid, out impersonating_user_id uuid, out source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := current_setting('role', true);
  v_header text;
begin
  if v_role = 'service_role' then
    v_header := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-audit-actor';
    if v_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      actor_id := v_header::uuid;
      source := 'api';
      select i.target_user_id into impersonating_user_id
      from public.impersonations i
      where i.admin_user_id = actor_id and i.ended_at is null and i.expires_at > now()
      limit 1;
    else
      source := 'service';
    end if;
  elsif v_role in ('authenticated', 'anon') then
    actor_id := auth.uid();
    source := 'user';
    if actor_id is not null and public.effective_user_id() <> actor_id then
      impersonating_user_id := public.effective_user_id();
    end if;
  else
    source := 'database';
  end if;
end;
$$;

-- Set by delete_archived_client for its own transaction, which records one event for the client
-- instead of one per row under it. Only a definer function sets it: PostgREST runs no SET.
create function audit.suppressed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('audit.suppressed', true), '') <> ''
    and coalesce(current_setting('role', true), '') not in ('authenticated', 'anon');
$$;

create function audit.kept_values(p_columns text[], p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(c, jsonb_build_array(p_old -> c, p_new -> c))
  from unnest(p_columns) as c
  where (p_old -> c) is distinct from (p_new -> c);
$$;

-- Statement-level, with transition tables, so a bulk insert writes its events in one statement.
-- The first argument is the row's key column; the rest are the columns whose values are kept.
create function audit.record_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := tg_argv[0];
  v_kept text[] := coalesce(tg_argv[1:tg_nargs - 1], '{}');
  v_skipped text[];
  v_actor record;
begin
  if audit.suppressed() then
    return null;
  end if;

  select coalesce(array_agg(a.attname::text), '{}') || array['updated_at'] into v_skipped
  from pg_catalog.pg_attribute a
  where a.attrelid = tg_relid and a.attgenerated <> '' and not a.attisdropped;

  select * into v_actor from audit.current_actor();

  -- The CTEs are materialized: inlined, each row's to_jsonb runs again for every column compared.
  if tg_op = 'INSERT' then
    with r as materialized (select to_jsonb(n) as n from new_rows n)
    insert into audit.events
      (action, table_name, row_id, organization_id, changed_columns, details, actor_id, impersonating_user_id, source)
    select 'insert', tg_table_name, (r.n ->> v_key)::uuid,
      coalesce((r.n ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (r.n ->> 'id')::uuid end),
      array(select e.key from jsonb_each(r.n) as e where e.value <> 'null'::jsonb and e.key <> all (v_skipped) order by e.key),
      audit.kept_values(v_kept, null, r.n),
      v_actor.actor_id, v_actor.impersonating_user_id, v_actor.source
    from r;
  elsif tg_op = 'UPDATE' then
    with o as materialized (select to_jsonb(o) as o from old_rows o),
      n as materialized (select to_jsonb(n) as n from new_rows n),
      r as materialized (
        select o.o, n.n,
          array(
            select e.key from jsonb_each(n.n) as e
            where e.value is distinct from (o.o -> e.key) and e.key <> all (v_skipped)
            order by e.key
          ) as changed
        from o join n on (n.n ->> v_key) = (o.o ->> v_key)
      )
    insert into audit.events
      (action, table_name, row_id, organization_id, changed_columns, details, actor_id, impersonating_user_id, source)
    select 'update', tg_table_name, (r.n ->> v_key)::uuid,
      coalesce((r.n ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (r.n ->> 'id')::uuid end),
      r.changed,
      audit.kept_values(v_kept, r.o, r.n),
      v_actor.actor_id, v_actor.impersonating_user_id, v_actor.source
    from r
    where cardinality(r.changed) > 0;
  else
    with r as materialized (select to_jsonb(o) as o from old_rows o)
    insert into audit.events
      (action, table_name, row_id, organization_id, changed_columns, details, actor_id, impersonating_user_id, source)
    select 'delete', tg_table_name, (r.o ->> v_key)::uuid,
      coalesce((r.o ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (r.o ->> 'id')::uuid end),
      null,
      audit.kept_values(v_kept, r.o, null),
      v_actor.actor_id, v_actor.impersonating_user_id, v_actor.source
    from r;
  end if;
  return null;
end;
$$;

-- The table, its key, and the columns whose values are kept: none of them about a person.
do $$
declare
  v_table record;
  v_arguments text;
begin
  for v_table in
    select * from (values
      ('organizations', 'id', '{}'::text[]),
      ('organization_members', 'user_id', '{role}'),
      ('organization_invitations', 'id', '{role}'),
      ('clients', 'id', '{stage,archived_at}'),
      ('client_participants', 'id', '{kind,revoked_at}'),
      ('participant_invitations', 'id', '{kind,channel,revoked_at}'),
      ('client_responsible_persons', 'id', '{roles,archived_at}'),
      ('client_files', 'id', '{owners_only}'),
      ('client_documents', 'id', '{type_key}'),
      ('document_revisions', 'id', '{status,revision}'),
      ('document_signed_copies', 'revision_id', '{source}'),
      ('service_contracts', 'id', '{}'),
      ('employees', 'id', '{status}'),
      ('trainings', 'id', '{domain,phase}'),
      ('training_records', 'id', '{phase}'),
      ('signature_requests', 'id', '{slot,state}'),
      ('training_signatures', 'id', '{slot,method}'),
      ('employee_signing_agreements', 'employee_id', '{state}'),
      ('agreement_signatures', 'id', '{party}'),
      ('signing_identities', 'id', '{}'),
      ('signed_sheets', 'id', '{domain,sequence,version}'),
      ('test_attempts', 'id', '{domain,test,passed}'),
      ('test_results', 'id', '{domain,test,source}'),
      ('test_sheets', 'id', '{version}'),
      ('test_sheet_signatures', 'id', '{slot,method}')
    ) as t (name, key, kept)
  loop
    v_arguments := (
      select string_agg(quote_literal(a), ', ')
      from unnest(array[v_table.key] || v_table.kept) as a
    );
    execute format(
      'create trigger audit_insert after insert on public.%I referencing new table as new_rows for each statement execute function audit.record_changes(%s)',
      v_table.name, v_arguments
    );
    execute format(
      'create trigger audit_update after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function audit.record_changes(%s)',
      v_table.name, v_arguments
    );
    execute format(
      'create trigger audit_delete after delete on public.%I referencing old table as old_rows for each statement execute function audit.record_changes(%s)',
      v_table.name, v_arguments
    );
  end loop;
end;
$$;

-- Both users are named on the impersonation's own events too, with the impersonated user's
-- organization, so support finds them beside what was done during it.
create function audit.record_impersonation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := (select a.source from audit.current_actor() as a);
  v_organization_id uuid := (
    select m.organization_id from public.organization_members m where m.user_id = new.target_user_id
  );
begin
  if tg_op = 'INSERT' then
    insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
    values ('impersonation_started', 'impersonations', new.id, v_organization_id,
      jsonb_build_object('reason', new.reason, 'expires_at', new.expires_at),
      new.admin_user_id, new.target_user_id, v_source);
  elsif old.ended_at is null and new.ended_at is not null then
    insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
    values ('impersonation_ended', 'impersonations', new.id, v_organization_id,
      jsonb_build_object('ended_at', new.ended_at),
      new.admin_user_id, new.target_user_id, v_source);
  end if;
  return null;
end;
$$;

create trigger impersonations_audit after insert or update of ended_at on public.impersonations
  for each row execute function audit.record_impersonation();

-- One event for the run: the rows it deletes under the client record none.
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

revoke all on schema audit from public, anon, authenticated, service_role;
revoke all on all tables in schema audit from public, anon, authenticated, service_role;
revoke all on all sequences in schema audit from public, anon, authenticated, service_role;
revoke all on all functions in schema audit from public, anon, authenticated, service_role;
