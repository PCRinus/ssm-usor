-- ADR 041: an imported substance carries its name only, since no document holds what is read off
-- the product and counted on site. Readiness asks for both before the set is generated.
alter table public.fire_substances
  alter column classification drop not null,
  alter column quantity drop not null;

comment on column public.fire_substances.classification is
  'Null until a member reads it off the product; the entry is then incomplete and blocks the set (ADR 041).';

comment on column public.fire_substances.quantity is
  'Null until a member counts it on site; the entry is then incomplete and blocks the set (ADR 041).';
