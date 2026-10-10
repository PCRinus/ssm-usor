-- A view loses columns only by being dropped, so its grants and comments are given again.
drop view public.client_list;

create view public.client_list
with (security_invoker = true)
as
select
  c.id,
  c.legal_name,
  c.cui,
  c.vat_payer,
  c.caen_code,
  c.trade_register_number,
  c.county_code,
  c.locality,
  c.address_line,
  c.legal_representative_name,
  c.declared_employee_count,
  c.stage,
  c.contact_name,
  c.contact_email,
  c.contact_phone,
  c.promoted_at,
  c.created_at,
  c.updated_at,
  c.archived_at,
  coalesce(c.promoted_at, c.created_at) as client_since,
  coalesce(e.employee_count, 0) as current_employee_count,
  coalesce(d.generated_type_keys, '{}') as documentation_generated_type_keys,
  coalesce(d.issued_count, 0) as documentation_issued_count,
  g.last_generated_at as documentation_last_generated_at,
  coalesce(d.fire_safety_generated_type_keys, '{}') as fire_safety_generated_type_keys,
  coalesce(d.fire_safety_issued_count, 0) as fire_safety_issued_count,
  g.fire_safety_last_generated_at
from public.clients c
left join (
  select client_id, count(*)::integer as employee_count
  from public.employees
  where status = 'active' and archived_at is null
  group by client_id
) e on e.client_id = c.id
-- A document without a revision is what a failed generation leaves behind, not a document.
left join (
  select
    cd.client_id,
    array_agg(cd.type_key order by cd.type_key)
      filter (where cd.document_group = 'documentation_set') as generated_type_keys,
    (count(*) filter (where cd.document_group = 'documentation_set' and r.any_issued))::integer
      as issued_count,
    array_agg(cd.type_key order by cd.type_key)
      filter (where cd.document_group = 'fire_safety_set') as fire_safety_generated_type_keys,
    (count(*) filter (where cd.document_group = 'fire_safety_set' and r.any_issued))::integer
      as fire_safety_issued_count
  from public.client_documents cd
  join (
    select document_id, bool_or(status = 'issued') as any_issued
    from public.document_revisions
    group by document_id
  ) r on r.document_id = cd.id
  where cd.document_group in ('documentation_set', 'fire_safety_set')
  group by cd.client_id
) d on d.client_id = c.id
left join (
  select
    client_id,
    max(created_at) filter (where document_group = 'documentation_set') as last_generated_at,
    max(created_at) filter (where document_group = 'fire_safety_set')
      as fire_safety_last_generated_at
  from public.document_generations
  group by client_id
) g on g.client_id = c.id;

comment on view public.client_list is
  'Clients with what each still needs: the progress of both documentation sets, current headcount. Counts only what the caller may read.';
comment on column public.client_list.client_since is
  'When the company became a client: its promotion for a former lead, otherwise its creation.';
comment on column public.client_list.documentation_generated_type_keys is
  'Type keys of the documents of the occupational safety set that have a revision.';
comment on column public.client_list.documentation_last_generated_at is
  'When documents of the occupational safety set were last generated, all of them or one again; null before the first time.';
comment on column public.client_list.fire_safety_generated_type_keys is
  'Type keys of the documents of the fire-safety set that have a revision.';
comment on column public.client_list.fire_safety_last_generated_at is
  'When documents of the fire-safety set were last generated, all of them or one again; null before the first time.';

revoke all on table public.client_list from anon, authenticated;
grant select on table public.client_list to authenticated;
