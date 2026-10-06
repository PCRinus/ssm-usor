-- ADR 016: the fire-safety set.

alter table public.document_generations
  add column document_group public.document_group not null default 'documentation_set',
  add constraint document_generations_group_is_a_set check (document_group <> 'other'),
  -- The fire-safety set has no decisions yet, so nothing to number; its own numbering arrives
  -- with its first decision (ADR 016).
  alter column first_decision_number drop not null,
  add constraint document_generations_first_decision_number_of_set
    check (document_group <> 'documentation_set' or first_decision_number is not null);

drop index public.document_generations_client_idx;
create index document_generations_client_idx
  on public.document_generations (client_id, document_group, created_at desc);

-- A lead has neither set, and does have other documents: its contract.
create or replace function public.protect_documents_of_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_group <> 'other' and exists (
    select 1 from public.clients c where c.id = new.client_id and c.stage = 'lead'
  ) then
    raise exception 'A lead has no safety records; promote it first.' using errcode = 'CLL01';
  end if;
  return new;
end;
$$;

-- The clients list keeps showing the occupational safety set only (ADR 016): its counts
-- already read that group, and its last generation now does too.
create or replace view public.client_list
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
  coalesce(p.position_count, 0) as job_position_count,
  coalesce(p.needing_work_count, 0) as job_positions_needing_work_count,
  coalesce(d.generated_type_keys, '{}') as documentation_generated_type_keys,
  coalesce(d.issued_count, 0) as documentation_issued_count,
  g.last_generated_at as documentation_last_generated_at
from public.clients c
left join (
  select client_id, count(*)::integer as employee_count
  from public.employees
  where status = 'active' and archived_at is null
  group by client_id
) e on e.client_id = c.id
-- Only whether an evaluation exists: whether it is complete depends on the risk levels, which
-- the API computes.
left join (
  select
    jp.client_id,
    count(*)::integer as position_count,
    (count(*) filter (
      where jp.needs_protective_equipment is null
        or jp.needs_instructions is null
        or not exists (select 1 from public.risk_evaluations ev where ev.job_position_id = jp.id)
    ))::integer as needing_work_count
  from public.job_positions jp
  where jp.archived_at is null
  group by jp.client_id
) p on p.client_id = c.id
-- A document without a revision is what a failed generation leaves behind, not a document.
left join (
  select
    cd.client_id,
    array_agg(cd.type_key order by cd.type_key) as generated_type_keys,
    (count(*) filter (where r.any_issued))::integer as issued_count
  from public.client_documents cd
  join (
    select document_id, bool_or(status = 'issued') as any_issued
    from public.document_revisions
    group by document_id
  ) r on r.document_id = cd.id
  where cd.document_group = 'documentation_set'
  group by cd.client_id
) d on d.client_id = c.id
left join (
  select client_id, max(created_at) as last_generated_at
  from public.document_generations
  where document_group = 'documentation_set'
  group by client_id
) g on g.client_id = c.id;

comment on column public.document_generations.document_group is
  'The documentation set the generation ran for; never other.';
comment on column public.client_list.documentation_generated_type_keys is
  'Type keys of the documents of the occupational safety set that have a revision.';
comment on column public.client_list.documentation_last_generated_at is
  'When documents of the occupational safety set were last generated, all of them or one again; null before the first time.';
