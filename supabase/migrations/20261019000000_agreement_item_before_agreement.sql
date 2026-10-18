-- The employee signs their agreement from their first sign-in, before any member or signature
-- records it (ADR 023, amended 2026-10-18), so a session item may name an employee whose
-- agreement row does not exist yet. On hosted the first such session failed with 23503.
alter table public.signing_session_items
  drop constraint signing_session_items_agreement_employee_id_fkey,
  add constraint signing_session_items_agreement_employee_id_fkey
    foreign key (agreement_employee_id) references public.employees (id) on delete cascade;
