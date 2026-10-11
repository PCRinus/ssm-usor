-- ADR 018, amended 2026-10-11: a kind of waste may list the materials it holds, up to 240 characters.

alter table public.client_fire_safety
  drop constraint client_fire_safety_waste_kinds_valid,
  add constraint client_fire_safety_waste_kinds_valid
    check (cardinality(waste_kinds) <= 12 and public.text_items_length_between(waste_kinds, 2, 240));
