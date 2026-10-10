-- ADR 019: the data of the fire-safety set's third stage, two optional texts.

alter table public.client_fire_safety
  add column smoking_place text
    constraint client_fire_safety_smoking_place_length check (char_length(btrim(smoking_place)) between 2 and 240),
  add constraint client_fire_safety_smoking_place_designated
    check (smoking_place is null or smoking_policy is not distinct from 'designated_places');

comment on column public.client_fire_safety.smoking_place is
  'Where the places for smoking are, printed by decision 4; null means the places marked "LOC PENTRU FUMAT". The API clears it when the card is saved with another policy or none (ADR 019).';

grant update (smoking_place) on table public.client_fire_safety to authenticated;


alter table public.organizations
  add column fire_safety_authorization text
    constraint organizations_fire_safety_authorization_length
    check (char_length(btrim(fire_safety_authorization)) between 2 and 200);

comment on column public.organizations.fire_safety_authorization is
  'The inspectorate''s authorization to act as fire-safety technician under contract (Legea 307/2006 art. 12^2), as the provider writes it; printed by decision 6 when set, never required (ADR 019).';

grant update (fire_safety_authorization) on table public.organizations to authenticated;
