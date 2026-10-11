-- ADR 018, amended 2026-10-11: a workplace is a fixed space or a temporary or mobile site, and
-- a fixed space that annex 6 has no row for declares no norm.

create type public.workplace_kind as enum ('fixed_space', 'mobile_site');

alter table public.client_workplaces
  add column kind public.workplace_kind not null default 'fixed_space';

comment on column public.client_workplaces.kind is
  'A mobile site has no floor area and no annex 6 norm: an area or a norm kept from before is not printed and not asked for (ADR 018).';

alter type public.fire_extinguisher_norm add value 'none';
