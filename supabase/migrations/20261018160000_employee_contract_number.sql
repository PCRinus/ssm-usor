-- The number of the individual employment contract, printed on the signing agreement
-- (ADR 023) beside the hire date. Optional: often not known when the person is added.

alter table public.employees
  add column contract_number text
    constraint employees_contract_number_trimmed check (contract_number = btrim(contract_number))
    constraint employees_contract_number_length check (char_length(contract_number) between 1 and 50);

comment on column public.employees.contract_number is
  'Number of the individual employment contract (nr. contractului individual de muncă); null while not known.';
