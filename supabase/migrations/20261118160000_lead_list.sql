-- The list of leads filters, counts and sorts by where each lead's contract stands, so that is
-- computed here, once per query, rather than in the API for one page.

-- Declared in the order the list sorts them: the contract least far along first.
create type public.service_contract_state as enum (
  'none', 'draft', 'issued', 'sent', 'received', 'signed'
);

-- Sent and signed are about the revision in force (ADR 007): a send or a copy of a revision that
-- a later one replaced no longer counts, and a draft beside an issued revision is a correction in
-- progress, so the contract is issued.
create view public.lead_list
with (security_invoker = true)
as
select
  c.id,
  c.legal_name,
  c.cui,
  c.vat_payer,
  c.caen_code,
  c.trade_register_number,
  c.county_code,
  c.locality,
  c.address_line,
  c.legal_representative_name,
  c.declared_employee_count,
  c.stage,
  c.contact_name,
  c.contact_email,
  c.contact_phone,
  c.promoted_at,
  c.created_at,
  c.updated_at,
  c.archived_at,
  coalesce(e.employee_count, 0) as current_employee_count,
  lower(public.unaccent_immutable(c.legal_name || ' ' || c.cui || ' ' || coalesce(c.locality, '')))
    as search_text,
  case
    when k.signed_at is not null then 'signed'
    when k.received_at is not null then 'received'
    when k.sent_at is not null then 'sent'
    when k.issued_at is not null then 'issued'
    when k.has_draft then 'draft'
    else 'none'
  end::public.service_contract_state as service_contract_state,
  coalesce(k.signed_at, k.received_at, k.sent_at, k.issued_at) as service_contract_state_at,
  case when k.received_at is null then k.return_expires_at end as service_contract_return_expires_at
from public.clients c
left join (
  select client_id, count(*)::integer as employee_count
  from public.employees
  where status = 'active' and archived_at is null
  group by client_id
) e on e.client_id = c.id
-- Owners only: for anyone else the policies hide every contract, and the state reads none.
left join (
  select
    d.client_id,
    bool_or(r.status = 'draft') as has_draft,
    min(r.issued_at) filter (where r.status = 'issued') as issued_at,
    max(s.sent_at) as sent_at,
    -- Every send's link works until its own expiry, so the latest one says when none is left.
    max(s.return_expires_at) as return_expires_at,
    min(sc.uploaded_at) as received_at,
    min(sc.confirmed_at) as signed_at
  from public.client_documents d
  join public.document_revisions r
    on r.document_id = d.id and r.status in ('draft', 'issued')
  left join public.service_contract_sends s
    on s.document_id = d.id and s.revision_id = r.id and r.status = 'issued'
  left join public.document_signed_copies sc
    on sc.revision_id = r.id and r.status = 'issued'
  where d.type_key = 'service_contract'
  group by d.client_id
) k on k.client_id = c.id
where c.stage = 'lead';

comment on view public.lead_list is
  'Every lead with where its service contract stands, as the list of leads shows, filters and sorts it. Owners only, as leads are.';
comment on column public.lead_list.search_text is
  'The text the list search matches, as client_search_text: name, CUI and locality, lowercase and without diacritics.';
comment on column public.lead_list.service_contract_state_at is
  'When the contract reached its state: issued, last sent, its copy received, that copy confirmed. Null for no contract and for a draft.';
comment on column public.lead_list.service_contract_return_expires_at is
  'When the last return link sent for the contract in force stops working; null once a copy came back or with no link sent.';

revoke all on table public.lead_list from anon, authenticated;
grant select on table public.lead_list to authenticated, service_role;
