-- The risk library's list sorts and filters by each entry's global level before it pages, so the
-- level and the count of unacceptable factors are kept on the entry. The API writes them whenever
-- the entry's factors change, worked out by the method's code in the contracts package, which
-- holds the method's grid (ADR 015); the database never computes them.

alter table public.evaluation_profiles
  add column global_risk_level numeric(3, 2)
    constraint evaluation_profiles_global_risk_level_range check (global_risk_level between 1 and 7),
  add column unacceptable_factor_count integer not null default 0
    constraint evaluation_profiles_unacceptable_factor_count_range check (unacceptable_factor_count >= 0),
  add constraint evaluation_profiles_unacceptable_needs_level
    check (unacceptable_factor_count = 0 or global_risk_level is not null);

comment on column public.evaluation_profiles.global_risk_level is
  'Σ R² / Σ R over the entry''s factors, to two decimals, as the API last worked it out when they changed; null without factors.';
comment on column public.evaluation_profiles.unacceptable_factor_count is
  'The entry''s factors whose level is above the acceptable one, as the API last worked it out when they changed.';

grant update (global_risk_level, unacceptable_factor_count)
  on table public.evaluation_profiles to authenticated;

-- A one-off copy of the method's grid, for the entries saved before the API kept their level; a
-- test holds it equal to riskLevelGrid. The backfill is no edit, so it keeps each entry's date.
alter table public.evaluation_profiles disable trigger evaluation_profiles_set_updated_at;

with levels as (
  select
    f.profile_id,
    (array[
      [1, 1, 1, 1, 1, 1],
      [1, 2, 2, 2, 3, 3],
      [2, 2, 3, 3, 4, 4],
      [2, 3, 4, 4, 5, 5],
      [3, 4, 4, 5, 5, 6],
      [3, 4, 5, 6, 6, 7],
      [3, 4, 5, 6, 7, 7]
    ]::integer[])[f.gravity_class][f.probability_class] as level
  from public.evaluation_profile_factors f
),
totals as (
  select
    profile_id,
    round(sum(level * level) * 100.0 / sum(level)) / 100 as global_risk_level,
    (count(*) filter (where level > 3))::integer as unacceptable_factor_count
  from levels
  group by profile_id
)
update public.evaluation_profiles p
set
  global_risk_level = t.global_risk_level,
  unacceptable_factor_count = t.unacceptable_factor_count
from totals t
where t.profile_id = p.id;

alter table public.evaluation_profiles enable trigger evaluation_profiles_set_updated_at;
