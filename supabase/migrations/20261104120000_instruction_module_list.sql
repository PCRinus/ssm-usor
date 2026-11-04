-- The library list in one pass, so PostgREST can page it and sort it by the current version or by
-- where each module is applied as it does by title. Security invoker: each table inside answers
-- to the caller's own policies. A module without a version is left out, as the library hides it.
create view public.instruction_module_list
with (security_invoker = true)
as
select
  m.id,
  m.organization_id,
  m.title,
  m.module_group,
  m.domain,
  m.archived_at,
  m.created_at,
  m.updated_at,
  v.id as version_id,
  v.number as version_number,
  v.text_hash as version_text_hash,
  v.article_count as version_article_count,
  v.created_at as version_created_at,
  coalesce(a.applied_count, 0) as applied_count
from public.instruction_modules m
join (
  select distinct on (module_id) id, module_id, number, text_hash, article_count, created_at
  from public.instruction_module_versions
  order by module_id, number desc
) v on v.module_id = m.id
left join (
  select i.module_id, count(*)::integer as applied_count
  from public.job_position_instructions i
  join public.job_positions p on p.id = i.job_position_id
  where p.archived_at is null
  group by i.module_id
) a on a.module_id = m.id;

comment on view public.instruction_module_list is
  'The instruction modules that have a version, each with its current version and how many current job positions apply it.';

revoke all on table public.instruction_module_list from anon, authenticated;
grant select on table public.instruction_module_list to authenticated;
