-- The signing agreement is drawn up on demand for the participant it concerns, as the training
-- sheets are (ADR 023), so its template's registry row joins theirs in the participants' policy.

drop policy "participants read the training sheet templates" on public.document_templates;

create policy "participants read the per-employee templates"
  on public.document_templates for select to authenticated
  using (
    organization_id is null
    and type_key in ('training_sheet_ssm', 'training_sheet_psi', 'signing_agreement')
    and cardinality((select public.participant_client_ids())) > 0
  );
