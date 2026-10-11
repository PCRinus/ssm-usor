-- ADR 019, amended 2026-10-11: whether other firms work on the client's premises, which decision 9
-- then controls quarterly (OMAI 163/2007 art. 149).

alter table public.client_fire_safety
  add column has_third_parties boolean not null default false;

comment on column public.client_fire_safety.has_third_parties is
  'Other legal persons (tenants, contractors) work on the client''s premises; decision 9 then adds their quarterly control (ADR 019).';

grant update (has_third_parties) on table public.client_fire_safety to authenticated;
