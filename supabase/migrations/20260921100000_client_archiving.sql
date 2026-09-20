-- Archiving a client ends the work for it and hides it from the whole team; restoring brings
-- it back. Both are an owner's decision. The update policy on clients lets every member
-- correct a client's data, so the role is checked here, for this one column.

create function public.protect_client_archiving()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Without a user the caller holds the secret key: seeds and maintenance.
  if new.archived_at is distinct from old.archived_at
    and (select auth.uid()) is not null
    and not public.is_organization_owner()
  then
    raise exception 'Only an owner archives or restores a client.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_protect_archiving before update on public.clients
  for each row execute function public.protect_client_archiving();

revoke all on function public.protect_client_archiving() from public, anon;

create index clients_organization_archived_idx
  on public.clients (organization_id, legal_name) where archived_at is not null;
