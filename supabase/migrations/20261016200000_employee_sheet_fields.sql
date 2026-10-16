-- ADR 021: the facts the two individual training sheets print that the app did not hold.
-- All optional here: the sheet asks for the commute and the workplace when it is printed.

alter table public.employees
  add column workplace_id uuid,
  add column qualification text
    constraint employees_qualification_length check (char_length(btrim(qualification)) between 1 and 160),
  add column education text
    constraint employees_education_length check (char_length(btrim(education)) between 1 and 160),
  add column authorizations text
    constraint employees_authorizations_length check (char_length(btrim(authorizations)) between 1 and 500),
  add column commute_route text
    constraint employees_commute_route_length check (char_length(btrim(commute_route)) between 1 and 1000),
  add column commute_minutes smallint
    constraint employees_commute_minutes_range check (commute_minutes between 1 and 600),
  add constraint employees_workplace_in_client
    foreign key (workplace_id, client_id) references public.client_workplaces (id, client_id) on delete restrict;

create index employees_workplace_id_idx on public.employees (workplace_id);

comment on column public.employees.workplace_id is
  'The workplace the person works at (ADR 021); null while not known.';
comment on column public.employees.commute_route is
  'The route between home and work (traseul de deplasare); an accident on it is a work accident (Legea 319/2006 art. 30).';
comment on column public.employees.commute_minutes is 'The normal duration of the commute, in minutes.';
