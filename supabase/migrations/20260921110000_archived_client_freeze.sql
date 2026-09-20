-- An archived client is read-only: nothing under it is added, changed or removed until an
-- owner restores it. The insert policies already asked for an active client; updates and
-- deletes did not, on purpose at the time, so that a leaver of an archived client could still
-- be recorded. With restoring one click away, that exception is gone.
--
-- Triggers, not update policies: a policy that fails its `using` matches no row, and the API
-- would answer "not found" for a row the caller can plainly read. A trigger names the reason.
-- Without a user the caller holds the secret key: seeds and maintenance pass.

create function public.refuse_archived_client(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and exists (
    select 1 from public.clients c where c.id = p_client_id and c.archived_at is not null
  ) then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  end if;
end;
$$;

create function public.protect_rows_of_archived_client()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.refuse_archived_client(coalesce(old.client_id, new.client_id));
  return coalesce(new, old);
end;
$$;

create trigger employees_protect_archived_client
  before insert or update or delete on public.employees
  for each row execute function public.protect_rows_of_archived_client();

create trigger job_positions_protect_archived_client
  before insert or update or delete on public.job_positions
  for each row execute function public.protect_rows_of_archived_client();

create trigger client_workplaces_protect_archived_client
  before insert or update or delete on public.client_workplaces
  for each row execute function public.protect_rows_of_archived_client();

create trigger client_responsible_persons_protect_archived_client
  before insert or update or delete on public.client_responsible_persons
  for each row execute function public.protect_rows_of_archived_client();

create trigger client_documents_protect_archived_client
  before insert or update or delete on public.client_documents
  for each row execute function public.protect_rows_of_archived_client();

-- A revision reaches its client through its document. This also stops issuing, which runs as
-- its function's owner and so past every policy.
create function public.protect_revisions_of_archived_client()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.refuse_archived_client(
    (select d.client_id from public.client_documents d
     where d.id = coalesce(old.document_id, new.document_id))
  );
  return coalesce(new, old);
end;
$$;

create trigger document_revisions_protect_archived_client
  before insert or update or delete on public.document_revisions
  for each row execute function public.protect_revisions_of_archived_client();

-- The client's own row: only restoring changes it while it is archived.
create or replace function public.protect_client_archiving()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at and not public.is_organization_owner() then
    raise exception 'Only an owner archives or restores a client.' using errcode = '42501';
  end if;
  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  end if;
  return new;
end;
$$;

-- Files follow their draft row, and now also the client it belongs to.
create or replace function public.is_draft_document_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_revisions r
    join public.client_documents d on d.id = r.document_id
    join public.clients c on c.id = d.client_id
    where (r.docx_path = p_path or regexp_replace(r.docx_path, '\.docx$', '.pdf') = p_path)
      and r.status = 'draft'
      and r.organization_id = public.current_organization_id()
      and c.archived_at is null
  );
$$;

revoke all on function public.refuse_archived_client(uuid) from public, anon;
revoke all on function public.protect_rows_of_archived_client() from public, anon;
revoke all on function public.protect_revisions_of_archived_client() from public, anon;
grant execute on function public.refuse_archived_client(uuid) to authenticated, service_role;
