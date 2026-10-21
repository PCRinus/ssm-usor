-- A legal representative who is also on the employee list is one person in every document;
-- comparing names, as ADR 010 did, guessed that and missed a namesake.

alter table public.clients
  add column legal_representative_employee_id uuid,
  add constraint clients_legal_representative_employee_of_client
    foreign key (legal_representative_employee_id, id) references public.employees (id, client_id)
    on delete set null (legal_representative_employee_id);

create index clients_legal_representative_employee_id_idx
  on public.clients (legal_representative_employee_id)
  where legal_representative_employee_id is not null;

comment on column public.clients.legal_representative_employee_id is
  'The employee the legal representative also is, of the same client; null when they are not on the employee list.';
