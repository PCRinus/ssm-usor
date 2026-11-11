-- ADR 007, amended 2026-11-11: a provider always sells occupational safety and fire safety
-- together, so every contract covers both.

alter table public.service_contracts
  drop constraint service_contracts_covers_something,
  drop column covers_occupational_safety,
  drop column covers_fire_safety;

comment on table public.service_contracts is 'What the app reads about a service contract: its number and dates. It always covers both services. Owners only.';
