-- Representatives are chosen by and from among the workers (ADR 010), so the role needs an
-- employee behind it.
alter table public.client_responsible_persons
  drop constraint client_responsible_persons_roles_not_empty,
  add constraint client_responsible_persons_roles_not_empty check (cardinality(roles) between 1 and 5),
  add constraint client_responsible_persons_workers_representative_employee
    check (not ('workers_representative' = any (roles)) or employee_id is not null);
