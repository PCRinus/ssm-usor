-- A participant's token reads no row of a client's data (ADR 022, amended 2026-11-01). These
-- policies chose the rows a participant read but not the columns, and the publishable key is in
-- every browser, so a client administrator could select every employee's CNP, blood group, home
-- address and the specialist's notes, and the provider's bank account, straight from PostgREST.
-- Members share the `authenticated` role, so column grants cannot tell the two apart. The
-- portal reads through the API instead, which checks the participation and selects, with the
-- secret key, only the columns the portal shows.
--
-- What a participant's token still reads: their own `client_participants` rows, and as a signer
-- the requests addressed to them and their own signatures, whose evidence columns no member
-- reads either. The security definer functions the portal calls answer for the caller's own
-- participation as before.

drop policy "participants read their clients" on public.clients;
drop policy "participants read their clients' organizations" on public.organizations;
drop policy "participants read their own employee row" on public.employees;
drop policy "client administrators read their client's employees" on public.employees;
drop policy "participants read their own training records" on public.training_records;
drop policy "client administrators read their client's training records" on public.training_records;
drop policy "participants read the trainings they attended" on public.trainings;
drop policy "client administrators read their client's trainings" on public.trainings;
drop policy "participants read their own job position" on public.job_positions;
drop policy "client administrators read their client's job positions" on public.job_positions;
drop policy "participants read their clients' workplaces" on public.client_workplaces;
drop policy "participants read their clients' fire safety" on public.client_fire_safety;
drop policy "client administrators read their client's responsible persons" on public.client_responsible_persons;
drop policy "participants read the per-employee templates" on public.document_templates;

drop policy "participants read the requests on their own records" on public.signature_requests;
drop policy "client administrators read their client's signature requests" on public.signature_requests;
drop policy "participants read the requests on their own test sheets" on public.signature_requests;
drop policy "participants read the signatures on their own records" on public.training_signatures;
drop policy "client administrators read their client's training signatures" on public.training_signatures;
drop policy "participants read their own signing agreement" on public.employee_signing_agreements;
drop policy "client administrators read their client's signing agreements" on public.employee_signing_agreements;
drop policy "participants read the signatures on their own agreement" on public.agreement_signatures;
drop policy "client administrators read their client's agreement signatures" on public.agreement_signatures;
drop policy "participants read their own signed sheets" on public.signed_sheets;
drop policy "client administrators read their client's signed sheets" on public.signed_sheets;
drop policy "participants read the rows of their own signed sheets" on public.signed_sheet_rows;
drop policy "client administrators read the rows of their client's signed sheets" on public.signed_sheet_rows;

drop policy "participants read their own test attempts" on public.test_attempts;
drop policy "participants read their own test results" on public.test_results;
drop policy "client administrators read their client's test results" on public.test_results;
drop policy "participants read their own test sheets" on public.test_sheets;
drop policy "client administrators read their client's test sheets" on public.test_sheets;
drop policy "participants read the signatures on their own test sheets" on public.test_sheet_signatures;
drop policy "client administrators read their client's test sheet signatures" on public.test_sheet_signatures;

-- Only the policies above called these; a new participant policy would bring the leak back.
drop function public.participant_client_ids();
drop function public.participant_employee_ids();
drop function public.administered_client_ids();
drop function public.is_client_administrator(uuid);
