-- The library list pages and sorts in the database, so the view counts each entry's factors.
-- It counts no risk levels: those come from the method's grid, which only code holds (ADR 015),
-- so the list cannot be sorted by the unacceptable factors or the global level.
create or replace view public.evaluation_profile_list
with (security_invoker = true)
as
select
  p.id,
  p.organization_id,
  p.name,
  p.archived_at,
  p.created_at,
  p.updated_at,
  coalesce(u.client_count, 0) as client_count,
  u.profile_id is not null as in_use,
  p.means_of_production,
  p.work_environment,
  p.exposure,
  coalesce(n.factor_count, 0) as factor_count
from public.evaluation_profiles p
left join (
  select
    pf.profile_id,
    (count(distinct f.client_id) filter (where jp.archived_at is null))::integer as client_count
  from public.risk_factors f
  join public.evaluation_profile_factors pf on pf.id = f.source_profile_factor_id
  join public.risk_evaluations e on e.id = f.evaluation_id
  left join public.job_positions jp on jp.id = e.job_position_id
  group by pf.profile_id
) u on u.profile_id = p.id
left join (
  select profile_id, count(*)::integer as factor_count
  from public.evaluation_profile_factors
  group by profile_id
) n on n.profile_id = p.id;
