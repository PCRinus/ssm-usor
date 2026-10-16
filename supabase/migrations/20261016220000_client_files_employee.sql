-- A client file can belong to one of the client's employees (ADR 021), such as the photograph
-- of a paper training sheet. Set at upload only: the column grants leave it out of updates.

alter table public.client_files
  add column employee_id uuid,
  add constraint client_files_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict;

create index client_files_employee_id_idx on public.client_files (employee_id, created_at desc);

comment on column public.client_files.employee_id is
  'The employee the file is about, of the same client; null for a file about the client itself.';
