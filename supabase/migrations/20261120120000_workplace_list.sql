-- The count links to the Lucrători tab filtered by the workplace, so it counts the employees
-- that list shows.

create or replace view public.client_workplace_list
with (security_invoker = true)
as
select
  w.id,
  w.organization_id,
  w.client_id,
  w.name,
  w.is_registered_office,
  w.office_has_activity,
  w.county_code,
  w.locality,
  w.address_line,
  w.activity,
  w.kind,
  w.floor_area_m2,
  w.extinguisher_norm,
  w.assembly_point,
  w.combustible_materials,
  w.ignition_sources,
  w.fire_risk_equipment,
  w.specific_measures,
  w.archived_at,
  w.created_at,
  w.updated_at,
  coalesce(e.current_employee_count, 0) as current_employee_count
from public.client_workplaces w
left join (
  select workplace_id, client_id, count(*)::integer as current_employee_count
  from public.employees
  where workplace_id is not null and status = 'active' and archived_at is null
  group by workplace_id, client_id
) e on e.workplace_id = w.id and e.client_id = w.client_id;

comment on view public.client_workplace_list is
  'Each workplace with the number of current employees who work there.';
comment on column public.client_workplace_list.current_employee_count is
  'Active, unarchived employees whose workplace this is, as the workers list filtered by it counts them.';

revoke all on table public.client_workplace_list from anon, authenticated;
grant select on table public.client_workplace_list to authenticated;
