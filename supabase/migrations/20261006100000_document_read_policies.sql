-- Read policies ask about the document with a join, not with can_access_document: a function
-- call is a query of its own for every row read, which made reading revisions cost as much
-- as everything else on a page. The subquery runs under the caller's policy on
-- client_documents, which is the same rule (same organization, owners only for owners), and
-- that policy reads no table that reads back. Writes keep the function: one row at a time.

alter policy "members read the revisions of documents they can read"
  on public.document_revisions
  using (
    organization_id = (select public.current_organization_id())
    and exists (select 1 from public.client_documents d where d.id = document_revisions.document_id)
  );

alter policy "members read the signed copies of documents they can read"
  on public.document_signed_copies
  using (
    organization_id = (select public.current_organization_id())
    and exists (select 1 from public.client_documents d where d.id = document_signed_copies.document_id)
  );

alter policy "owners read the sends of contracts they can reach"
  on public.service_contract_sends
  using (
    organization_id = (select public.current_organization_id())
    and exists (select 1 from public.client_documents d where d.id = service_contract_sends.document_id)
  );
