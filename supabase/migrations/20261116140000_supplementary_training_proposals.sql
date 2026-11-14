-- ADR 042, decision 4: issuing a client's own instructions, IPSSM or IPSU, while the client has
-- current workers with a training recorded in that domain proposes a supplementary training.
-- What the proposal lists, the posts with current workers and which of them have had it, is read
-- live; what is kept is that the issue brought one, and whether a member closed it.
--
-- A table of its own beside the revision, as the signed copies are: an issued revision never
-- changes, and closing the proposal comes after issuing.

create table public.supplementary_training_proposals (
  revision_id uuid primary key references public.document_revisions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null,
  document_id uuid not null,
  domain public.training_domain not null,
  -- The revision's own, so that a training recorded since can be told without a join.
  issued_at timestamptz not null,
  dismissed_at timestamptz,
  -- Null once the account is deleted, which keeps the dismissal.
  dismissed_by uuid references auth.users (id) on delete set null,
  constraint supplementary_training_proposals_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint supplementary_training_proposals_document_fkey
    foreign key (document_id, organization_id) references public.client_documents (id, organization_id) on delete restrict,
  constraint supplementary_training_proposals_dismissed_whole
    check (dismissed_at is not null or dismissed_by is null)
);

create index supplementary_training_proposals_client_id_idx
  on public.supplementary_training_proposals (client_id);
create index supplementary_training_proposals_organization_id_idx
  on public.supplementary_training_proposals (organization_id);

comment on table public.supplementary_training_proposals is
  'An issue of a client''s own instructions that proposes a supplementary training, and whether it was closed (ADR 042).';

-- Runs past the policies, as issuing does: it is the issue that brings the proposal, whoever
-- issues. A client with no trained current worker in the domain has nobody to train again.
create function public.propose_supplementary_training()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_domain public.training_domain;
begin
  select d.client_id,
    case d.type_key
      when 'own_instructions' then 'ssm'::public.training_domain
      when 'fire_own_instructions' then 'su'::public.training_domain
    end
  into v_client_id, v_domain
  from public.client_documents d
  where d.id = new.document_id;
  if v_domain is null then
    return null;
  end if;
  if exists (
    select 1
    from public.training_records r
    join public.trainings t on t.id = r.training_id
    join public.employees e on e.id = r.employee_id
    where r.client_id = v_client_id
      and t.domain = v_domain
      and e.status = 'active'
      and e.archived_at is null
  ) then
    insert into public.supplementary_training_proposals
      (revision_id, organization_id, client_id, document_id, domain, issued_at)
    values (new.id, new.organization_id, v_client_id, new.document_id, v_domain, new.issued_at);
  end if;
  return null;
end;
$$;

revoke all on function public.propose_supplementary_training() from public, anon, authenticated;

create trigger document_revisions_propose_supplementary_training
  after update of status on public.document_revisions
  for each row
  when (old.status = 'draft' and new.status = 'issued')
  execute function public.propose_supplementary_training();

create trigger supplementary_training_proposals_protect_archived_client
  before insert or update or delete on public.supplementary_training_proposals
  for each row execute function public.protect_rows_of_archived_client();

-- A member closes a proposal as themself, once: who closed it is never taken from the request,
-- and a closed proposal is not reopened. The secret key, SQL and the cascade of an account's
-- deletion, a nested trigger, pass.
create function public.close_supplementary_training_proposal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if old.dismissed_at is not null then
    raise exception 'A closed proposal stays closed.' using errcode = '42501';
  end if;
  new.dismissed_by := case when new.dismissed_at is null then null else (select auth.uid()) end;
  return new;
end;
$$;

revoke all on function public.close_supplementary_training_proposal() from public, anon, authenticated;

create trigger supplementary_training_proposals_close
  before update on public.supplementary_training_proposals
  for each row execute function public.close_supplementary_training_proposal();

alter table public.supplementary_training_proposals enable row level security;
revoke all on table public.supplementary_training_proposals from anon;

create policy "members read the proposals of documents they can read"
  on public.supplementary_training_proposals for select to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and public.can_access_document(document_id)
  );

create policy "members close the proposals of documents they can read"
  on public.supplementary_training_proposals for update to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and public.can_access_document(document_id)
  )
  with check (
    organization_id = (select public.current_organization_id())
    and public.can_access_document(document_id)
  );

-- Only the trigger above inserts, and a proposal goes with its revision; a member only closes one.
revoke insert, update, delete on table public.supplementary_training_proposals from authenticated;
grant update (dismissed_at, dismissed_by) on table public.supplementary_training_proposals to authenticated;
