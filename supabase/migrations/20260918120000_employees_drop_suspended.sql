-- Employees are either current or former. A paused contract (parental or medical leave,
-- unpaid leave, technical unemployment) is an absence with a start and a return date that
-- drives supplementary training on return; it will be modelled as a dated event, not as a
-- flat status. The 'suspended' value is removed before anything relies on it.

alter table public.employees drop constraint employees_terminated_at_matches_status;
alter table public.employees alter column status drop default;

alter type public.employee_status rename to employee_status_old;
create type public.employee_status as enum ('active', 'terminated');

-- Only fake seed rows can carry 'suspended' at this point; they count as active.
alter table public.employees
  alter column status type public.employee_status
  using (case when status::text = 'suspended' then 'active' else status::text end)::public.employee_status;

alter table public.employees alter column status set default 'active';
alter table public.employees
  add constraint employees_terminated_at_matches_status
  check ((status = 'terminated') = (terminated_at is not null));

drop type public.employee_status_old;
