-- Each also serves the foreign key to auth.users, which sets the column to null when an account
-- is deleted.
create index clients_created_by_idx on public.clients (created_by);
create index client_workplaces_created_by_idx on public.client_workplaces (created_by);
create index job_positions_created_by_idx on public.job_positions (created_by);
create index employees_created_by_idx on public.employees (created_by);
create index client_responsible_persons_created_by_idx on public.client_responsible_persons (created_by);
create index client_fire_safety_created_by_idx on public.client_fire_safety (created_by);
create index risk_evaluations_created_by_idx on public.risk_evaluations (created_by);
create index document_generations_created_by_idx on public.document_generations (created_by, document_group);
create index document_revisions_issued_by_idx on public.document_revisions (issued_by);
create index participant_invitations_invited_by_idx on public.participant_invitations (invited_by);
create index trainings_created_by_idx on public.trainings (created_by);
create index signature_requests_issued_by_idx on public.signature_requests (issued_by);

create table public.setup_step_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  step text not null
    constraint setup_step_skips_member_step check (step in (
      'client',
      'workplaces-positions',
      'employees',
      'responsible-persons',
      'risk-evaluation',
      'fire-safety-data',
      'generate-sets',
      'issue-document',
      'portal-invitation',
      'training',
      'signature'
    )),
  skipped_at timestamptz not null default now(),
  primary key (user_id, step)
);

comment on table public.setup_step_skips is
  'The member steps of the setup guide a person marked Știu deja (ADR 031). A skip counts as done; undoing it deletes the row.';

alter table public.setup_step_skips enable row level security;

revoke all on table public.setup_step_skips from anon, authenticated;
grant select, delete on table public.setup_step_skips to authenticated;
grant insert (user_id, step) on table public.setup_step_skips to authenticated;

create policy "users read their own skipped steps"
  on public.setup_step_skips for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users skip their own steps"
  on public.setup_step_skips for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users undo their own skips"
  on public.setup_step_skips for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.profiles
  add column setup_guide_closed_at timestamptz,
  add column setup_guide_finished_at timestamptz;

comment on column public.profiles.setup_guide_closed_at is
  'When the person closed the setup guide to the header pill; null while it shows (ADR 031).';
comment on column public.profiles.setup_guide_finished_at is
  'When the setup guide showed Gata with every step done or skipped; null until then, and again after Arată ghidul.';

grant update (setup_guide_closed_at, setup_guide_finished_at) on table public.profiles to authenticated;

-- The locks read active clients only, since a step on a client leads to one (ADR 031).
-- The fire-safety card's facts are the API's holdsCardFacts: declaring the substances alone
-- creates the row, and must not tick the step.
create function public.setup_progress()
returns table (
  organization_id uuid,
  legal_name_filled boolean,
  cui_filled boolean,
  address_filled boolean,
  representative_name_filled boolean,
  representative_role_filled boolean,
  certificate_filled boolean,
  fire_safety_technician_filled boolean,
  company_done boolean,
  authorizations_done boolean,
  professional_title_done boolean,
  client_done boolean,
  workplaces_positions_done boolean,
  employees_done boolean,
  responsible_persons_done boolean,
  risk_evaluation_done boolean,
  fire_safety_data_done boolean,
  generate_sets_done boolean,
  issue_document_done boolean,
  portal_invitation_done boolean,
  training_done boolean,
  signature_done boolean,
  has_client boolean,
  has_client_with_workplace_and_position boolean,
  has_client_with_position boolean,
  has_client_with_basic_data boolean,
  has_draft_revision boolean,
  has_client_with_employee boolean,
  has_training_record boolean,
  furthest_client_id uuid,
  owner_count integer,
  owner_names text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    o.id,
    company.legal_name_filled,
    company.cui_filled,
    company.address_filled,
    company.representative_name_filled,
    company.representative_role_filled,
    authorizations.certificate_filled,
    authorizations.fire_safety_technician_filled,
    company.legal_name_filled and company.cui_filled and company.address_filled
      and company.representative_name_filled and company.representative_role_filled,
    authorizations.certificate_filled and authorizations.fire_safety_technician_filled,
    exists (
      select 1 from public.profiles p
      where p.user_id = me.id and coalesce(btrim(p.professional_title), '') <> ''
    ),
    exists (
      select 1 from public.clients c
      where c.organization_id = o.id and c.created_by = me.id and c.stage = 'client'
    ),
    exists (
      select 1 from public.client_workplaces w
      where w.organization_id = o.id and w.created_by = me.id
    ) and exists (
      select 1 from public.job_positions p
      where p.organization_id = o.id and p.created_by = me.id
    ),
    exists (
      select 1 from public.employees e
      where e.organization_id = o.id and e.created_by = me.id
    ),
    exists (
      select 1 from public.client_responsible_persons p
      where p.organization_id = o.id and p.created_by = me.id
    ),
    exists (
      select 1 from public.risk_evaluations r
      where r.organization_id = o.id and r.created_by = me.id
    ),
    exists (
      select 1 from public.client_fire_safety f
      where f.organization_id = o.id and f.created_by = me.id
        and (
          num_nonnulls(
            f.periodic_training_hours, f.administrative_training_interval_months, f.worker_training_interval_months,
            f.training_first_month, f.training_day_from, f.training_day_to, f.smoking_policy, f.waste_contractor,
            f.waste_collectors
          ) > 0
          or cardinality(f.waste_kinds) > 0
          or f.has_third_parties
        )
    ),
    exists (
      select 1 from public.document_generations g
      where g.organization_id = o.id and g.created_by = me.id and g.document_group = 'documentation_set'
    ) and exists (
      select 1 from public.document_generations g
      where g.organization_id = o.id and g.created_by = me.id and g.document_group = 'fire_safety_set'
    ),
    exists (
      select 1
      from public.document_revisions r
      join public.client_documents d on d.id = r.document_id
      where r.organization_id = o.id and r.issued_by = me.id and d.document_group <> 'other'
    ),
    exists (
      select 1 from public.participant_invitations i
      where i.organization_id = o.id and i.invited_by = me.id and i.kind = 'employee'
    ),
    exists (
      select 1 from public.trainings t
      where t.organization_id = o.id and t.created_by = me.id and t.source = 'app'
    ),
    exists (
      select 1 from public.signature_requests r
      where r.organization_id = o.id and r.issued_by = me.id and r.state = 'signed'
        and r.signer_account_id is not null
    ),
    exists (
      select 1 from public.clients c
      where c.organization_id = o.id and c.stage = 'client' and c.archived_at is null
    ),
    exists (
      select 1 from public.clients c
      where c.organization_id = o.id and c.stage = 'client' and c.archived_at is null
        and exists (
          select 1 from public.client_workplaces w
          where w.client_id = c.id and w.archived_at is null
        )
        and exists (
          select 1 from public.job_positions p
          where p.client_id = c.id and p.archived_at is null
        )
    ),
    exists (
      select 1 from public.clients c
      where c.organization_id = o.id and c.stage = 'client' and c.archived_at is null
        and exists (
          select 1 from public.job_positions p
          where p.client_id = c.id and p.archived_at is null
        )
    ),
    exists (
      select 1 from public.clients c
      where c.organization_id = o.id and c.stage = 'client' and c.archived_at is null
        and not exists (
          select 1 from public.clients_missing_basic_data m where m.client_id = c.id
        )
    ),
    exists (
      select 1
      from public.document_revisions r
      join public.client_documents d on d.id = r.document_id
      join public.clients c on c.id = d.client_id
      where r.organization_id = o.id and r.status = 'draft' and d.document_group <> 'other'
        and c.stage = 'client' and c.archived_at is null
    ),
    exists (
      select 1
      from public.employees e
      join public.clients c on c.id = e.client_id
      where e.organization_id = o.id and e.status = 'active' and e.archived_at is null
        and c.stage = 'client' and c.archived_at is null
    ),
    exists (
      select 1
      from public.training_records r
      join public.clients c on c.id = r.client_id
      where r.organization_id = o.id and c.stage = 'client' and c.archived_at is null
    ),
    (
      select c.id
      from public.clients c
      cross join lateral (
        select
          (exists (select 1 from public.client_workplaces w where w.client_id = c.id and w.archived_at is null)
            and exists (select 1 from public.job_positions p where p.client_id = c.id and p.archived_at is null))::integer
          + exists (select 1 from public.employees e where e.client_id = c.id and e.archived_at is null)::integer
          + exists (select 1 from public.client_responsible_persons p where p.client_id = c.id and p.archived_at is null)::integer
          + exists (select 1 from public.risk_evaluations r where r.client_id = c.id)::integer
          + exists (
              select 1 from public.client_fire_safety f
              where f.client_id = c.id
                and (
                  num_nonnulls(
                    f.periodic_training_hours, f.administrative_training_interval_months, f.worker_training_interval_months,
                    f.training_first_month, f.training_day_from, f.training_day_to, f.smoking_policy, f.waste_contractor,
                    f.waste_collectors
                  ) > 0
                  or cardinality(f.waste_kinds) > 0
                  or f.has_third_parties
                )
            )::integer
          + (exists (select 1 from public.document_generations g where g.client_id = c.id and g.document_group = 'documentation_set')
            and exists (select 1 from public.document_generations g where g.client_id = c.id and g.document_group = 'fire_safety_set'))::integer
          + exists (
              select 1
              from public.client_documents d
              join public.document_revisions r on r.document_id = d.id
              where d.client_id = c.id and d.document_group <> 'other' and r.status <> 'draft'
            )::integer
          + exists (select 1 from public.participant_invitations i where i.client_id = c.id and i.kind = 'employee')::integer
          + exists (select 1 from public.trainings t where t.client_id = c.id and t.source = 'app')::integer
          + exists (
              select 1 from public.signature_requests r
              where r.client_id = c.id and r.state = 'signed' and r.signer_account_id is not null
            )::integer
          as steps
      ) as progress
      where c.organization_id = o.id and c.stage = 'client' and c.archived_at is null
      order by progress.steps desc, c.created_at desc, c.id desc
      limit 1
    ),
    (
      select count(*)::integer
      from public.organization_members m
      where m.organization_id = o.id and m.role = 'owner'
    ),
    coalesce((
      select array_agg(p.full_name order by p.full_name)
      from public.organization_members m
      join public.profiles p on p.user_id = m.user_id
      where m.organization_id = o.id and m.role = 'owner'
    ), '{}')
  from public.organizations o
  cross join (select auth.uid() as id) as me
  cross join lateral (
    select
      coalesce(btrim(o.legal_name), '') <> '' as legal_name_filled,
      coalesce(btrim(o.cui), '') <> '' as cui_filled,
      coalesce(btrim(o.county_code), '') <> ''
        and coalesce(btrim(o.locality), '') <> ''
        and coalesce(btrim(o.address_line), '') <> '' as address_filled,
      coalesce(btrim(o.legal_representative_name), '') <> '' as representative_name_filled,
      coalesce(btrim(o.legal_representative_role), '') <> '' as representative_role_filled
  ) as company
  cross join lateral (
    select
      coalesce(btrim(o.authorization_certificate_number), '') <> ''
        and o.authorization_certificate_date is not null
        and coalesce(btrim(o.authorization_certificate_issuer), '') <> '' as certificate_filled,
      coalesce(btrim(o.fire_safety_technician_name), '') <> ''
        and coalesce(btrim(o.fire_safety_technician_certificate), '') <> '' as fire_safety_technician_filled
  ) as authorizations
  where o.id = public.current_organization_id();
$$;

comment on function public.setup_progress() is
  'The setup guide''s facts for the caller in their organization (ADR 031): each step done by the caller, or by an owner for the two organization steps; which fields of those two are filled; what each lock needs; the active client furthest along; and how many owners there are, with the names of those who have a profile. No row for an account without an organization.';

revoke all on function public.setup_progress() from public, anon;
grant execute on function public.setup_progress() to authenticated, service_role;
