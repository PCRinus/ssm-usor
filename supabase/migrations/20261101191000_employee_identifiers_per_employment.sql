-- A row is one employment and a rehire after a gap is a new row, so a former employment keeps
-- its CNP and employee number without blocking the person's current one.

drop index public.employees_client_cnp_key;
drop index public.employees_client_employee_number_key;

create unique index employees_client_cnp_key
  on public.employees (client_id, cnp)
  where cnp is not null and archived_at is null and status = 'active';
create unique index employees_client_employee_number_key
  on public.employees (client_id, employee_number)
  where employee_number is not null and archived_at is null and status = 'active';
