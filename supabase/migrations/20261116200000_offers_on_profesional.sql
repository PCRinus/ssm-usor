-- Offers (leads, ADR 007) are a Profesional feature (ADR 029, amended 2026-11-14). On Start an
-- organization keeps reading and downloading its leads and their contracts, archives, restores
-- and promotes them, and changes nothing else about them.
--
-- Triggers, as for an archived client, so that the reason has a name. Without a user the caller
-- holds the secret key: seeds, maintenance and the client's upload through the return link.
--   CLL03  the organization's plan has no offers

-- A trial has Profesional's features until it ends, a plan chosen during it included. An
-- organization without a subscription row has everything, as it has full access.
create function public.organization_has_offers(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.plan <> 'start' or (s.status = 'trialing' and s.trial_ends_at > now())
      from public.subscriptions s
      where s.organization_id = p_organization_id
    ),
    true
  );
$$;

revoke all on function public.organization_has_offers(uuid) from public, anon, authenticated;

create function public.current_organization_has_offers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.organization_has_offers(public.current_organization_id());
$$;

revoke all on function public.current_organization_has_offers() from public, anon;
grant execute on function public.current_organization_has_offers() to authenticated, service_role;

create function public.refuse_lead_without_offers(p_client_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.stage = 'lead'
      and not public.organization_has_offers(c.organization_id)
  ) then
    raise exception 'Offers are part of the Profesional plan.' using errcode = 'CLL03';
  end if;
end;
$$;

revoke all on function public.refuse_lead_without_offers(uuid) from public, anon, authenticated;

create function public.protect_lead_without_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stage = 'lead' and not public.organization_has_offers(new.organization_id) then
      raise exception 'Offers are part of the Profesional plan.' using errcode = 'CLL03';
    end if;
    return new;
  end if;
  -- Archiving, restoring and promoting stay open; any other change to a lead does not.
  if old.stage = 'lead'
    and not public.organization_has_offers(old.organization_id)
    and (to_jsonb(new) - array['archived_at', 'updated_at', 'stage', 'promoted_at', 'promoted_by'])
      is distinct from
      (to_jsonb(old) - array['archived_at', 'updated_at', 'stage', 'promoted_at', 'promoted_by'])
  then
    raise exception 'Offers are part of the Profesional plan.' using errcode = 'CLL03';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_lead_without_offers() from public, anon;

create trigger clients_protect_lead_without_offers before insert or update on public.clients
  for each row execute function public.protect_lead_without_offers();

create function public.protect_rows_of_lead_without_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refuse_lead_without_offers(coalesce(new.client_id, old.client_id));
  return coalesce(new, old);
end;
$$;

revoke all on function public.protect_rows_of_lead_without_offers() from public, anon;

create trigger client_documents_protect_lead_without_offers
  before insert or update or delete on public.client_documents
  for each row execute function public.protect_rows_of_lead_without_offers();

create trigger service_contracts_protect_lead_without_offers
  before insert or update or delete on public.service_contracts
  for each row execute function public.protect_rows_of_lead_without_offers();

create trigger client_owner_notes_protect_lead_without_offers
  before insert or update or delete on public.client_owner_notes
  for each row execute function public.protect_rows_of_lead_without_offers();

create trigger client_files_protect_lead_without_offers
  before insert or update or delete on public.client_files
  for each row execute function public.protect_rows_of_lead_without_offers();

-- This also stops issuing, which runs as its function's owner and so past every policy.
create function public.protect_document_rows_of_lead_without_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refuse_lead_without_offers(
    (select d.client_id from public.client_documents d
     where d.id = coalesce(new.document_id, old.document_id))
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.protect_document_rows_of_lead_without_offers() from public, anon;

create trigger document_revisions_protect_lead_without_offers
  before insert or update or delete on public.document_revisions
  for each row execute function public.protect_document_rows_of_lead_without_offers();

create trigger document_signed_copies_protect_lead_without_offers
  before insert or update or delete on public.document_signed_copies
  for each row execute function public.protect_document_rows_of_lead_without_offers();

create trigger service_contract_sends_protect_lead_without_offers
  before insert or update or delete on public.service_contract_sends
  for each row execute function public.protect_document_rows_of_lead_without_offers();
