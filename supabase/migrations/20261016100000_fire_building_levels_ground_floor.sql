-- "P" alone is how a ground-floor building's levels are written.
alter table public.fire_buildings
  drop constraint fire_buildings_levels_length,
  add constraint fire_buildings_levels_length check (char_length(btrim(levels)) between 1 and 40);
