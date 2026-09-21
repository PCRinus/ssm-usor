-- ADR 007, step 6: an owner sends the issued contract to the company's contact from the app.
-- Each send is kept, so that the app can say when it went out, to whom, and which revision:
-- "sent" is about the contract in force, not about one that a later revision replaced.

create table public.service_contract_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  document_id uuid not null,
  -- One foreign key to the revision, not also a composite one: PostgREST embeds through it,
  -- and two would make the relationship ambiguous.
  revision_id uuid not null references public.document_revisions (id) on delete restrict,
  sent_to text not null
    constraint service_contract_sends_sent_to_format check (sent_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(sent_to) <= 254),
  note text constraint service_contract_sends_note_length check (char_length(note) <= 1000),
  -- The provider's message id; null where email is only logged.
  provider_message_id text,
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  constraint service_contract_sends_document_fkey
    foreign key (document_id, organization_id) references public.client_documents (id, organization_id) on delete restrict
);

create index service_contract_sends_document_idx
  on public.service_contract_sends (document_id, sent_at desc);

comment on table public.service_contract_sends is 'Each time an owner emailed an issued service contract: to whom, which revision, when.';

alter table public.service_contract_sends enable row level security;
revoke all on table public.service_contract_sends from anon;
-- A send is a fact: written once, never changed.
revoke update, delete, truncate on table public.service_contract_sends from authenticated;

create policy "owners read the sends of contracts they can reach"
  on public.service_contract_sends for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_access_document(document_id));

-- Only an issued revision is sent: it is the one with a PDF and a file that no longer changes.
create policy "owners record the sends of their issued contracts"
  on public.service_contract_sends for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and (select public.is_organization_owner())
    and public.can_access_document(document_id)
    and exists (
      select 1 from public.document_revisions r
      where r.id = revision_id and r.document_id = service_contract_sends.document_id and r.status = 'issued'
    )
  );
