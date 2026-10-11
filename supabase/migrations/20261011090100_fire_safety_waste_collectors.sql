-- ADR 018, amended 2026-10-11: who collects the waste, an optional text beside the firm that takes it.

alter table public.client_fire_safety
  add column waste_collectors text
    constraint client_fire_safety_waste_collectors_length check (char_length(btrim(waste_collectors)) between 2 and 160);

comment on column public.client_fire_safety.waste_collectors is
  'Who collects the waste at the client, as decision 8 names them ("muncitorii necalificați și șeful de șantier"); null means the workers on duty at the unit.';

grant update (waste_collectors) on table public.client_fire_safety to authenticated;
