-- Both library lists search, filter, count and sort in the database, by where each entry is used
-- at the active clients: an archived client's copy no longer counts, so an entry only such a
-- client holds reads as unused.

create or replace view public.instruction_module_list
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
  coalesce(a.applied_count, 0) as applied_count,
  coalesce(a.position_count, 0) as position_count,
  coalesce(a.client_count, 0) as client_count,
  lower(public.unaccent_immutable(m.title)) as search_text
from public.instruction_modules m
join (
  select distinct on (module_id) id, module_id, number, text_hash, article_count, created_at
  from public.instruction_module_versions
  order by module_id, number desc
) v on v.module_id = m.id
left join (
  select
    i.module_id,
    count(*)::integer as applied_count,
    (count(*) filter (where c.active))::integer as position_count,
    (count(distinct i.client_id) filter (where c.active))::integer as client_count
  from public.job_position_instructions i
  join public.job_positions p on p.id = i.job_position_id
  left join (select id, archived_at is null as active from public.clients) c on c.id = i.client_id
  where p.archived_at is null
  group by i.module_id
) a on a.module_id = m.id;

comment on view public.instruction_module_list is
  'The instruction modules that have a version, each with its current version and where current job positions apply it.';
comment on column public.instruction_module_list.applied_count is
  'Current job positions applying the module, archived clients'' included: archiving the module waits for every one.';
comment on column public.instruction_module_list.position_count is
  'Current job positions of active clients applying the module, as the list''s "Folosită la" counts them.';
comment on column public.instruction_module_list.client_count is
  'The active clients those positions belong to.';
comment on column public.instruction_module_list.search_text is
  'The title as the list search matches it, lowercase and without diacritics.';

revoke all on table public.instruction_module_list from anon, authenticated;
grant select on table public.instruction_module_list to authenticated;

-- A sheet is a post's risk evaluation or one of the client's sheets outside the posts.
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
  coalesce(n.factor_count, 0) as factor_count,
  coalesce(u.sheet_count, 0) as sheet_count,
  p.global_risk_level,
  p.unacceptable_factor_count,
  lower(public.unaccent_immutable(p.name)) as search_text
from public.evaluation_profiles p
left join (
  select
    pf.profile_id,
    (count(distinct e.id) filter (where c.active and jp.archived_at is null))::integer
      as sheet_count,
    (count(distinct e.client_id) filter (where c.active and jp.archived_at is null))::integer
      as client_count
  from public.risk_factors f
  join public.evaluation_profile_factors pf on pf.id = f.source_profile_factor_id
  join public.risk_evaluations e on e.id = f.evaluation_id
  left join (select id, archived_at is null as active from public.clients) c on c.id = e.client_id
  left join public.job_positions jp on jp.id = e.job_position_id
  group by pf.profile_id
) u on u.profile_id = p.id
left join (
  select profile_id, count(*)::integer as factor_count
  from public.evaluation_profile_factors
  group by profile_id
) n on n.profile_id = p.id;

comment on view public.evaluation_profile_list is
  'The risk library''s entries with their factor counts, stored levels and where active clients use them.';
comment on column public.evaluation_profile_list.in_use is
  'Whether any client''s factor points at one of the entry''s, archived posts and clients included: one in use is never deleted.';
comment on column public.evaluation_profile_list.sheet_count is
  'Sheets of active clients holding a factor copied from the entry, leaving out archived posts'' sheets.';
comment on column public.evaluation_profile_list.client_count is
  'The active clients those sheets belong to.';
comment on column public.evaluation_profile_list.search_text is
  'The name as the list search matches it, lowercase and without diacritics.';

revoke all on table public.evaluation_profile_list from anon, authenticated;
grant select on table public.evaluation_profile_list to authenticated;
