-- ADR 015, amendment of 2026-10-22: the organization's risk evaluator, whom decision 1.2 and the
-- risk assessment name as the coordinator of the evaluation. Text, not a member, as the
-- fire-safety technician is: the person may not use the app. All optional; when the name is
-- missing the documents name the member who generates, with the title from their profile.

alter table public.organizations
  add column risk_evaluator_name text
    constraint organizations_risk_evaluator_name_length
    check (char_length(btrim(risk_evaluator_name)) between 2 and 160),
  add column risk_evaluator_title text
    constraint organizations_risk_evaluator_title_length
    check (char_length(btrim(risk_evaluator_title)) between 2 and 160),
  add column risk_evaluator_certificate text
    constraint organizations_risk_evaluator_certificate_length
    check (char_length(btrim(risk_evaluator_certificate)) between 1 and 80);

comment on column public.organizations.risk_evaluator_title is
  'The qualification printed beside the evaluator''s name, "evaluator de riscuri atestat"; takes the place of the generating member''s professional title.';
comment on column public.organizations.risk_evaluator_certificate is
  'The evaluator''s certificate or attestation, as the provider writes it; printed after the title when set, never required.';

grant update (risk_evaluator_name, risk_evaluator_title, risk_evaluator_certificate)
  on table public.organizations to authenticated;
