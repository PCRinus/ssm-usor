-- The act of signing (ADR 023): what one signing session covers, the signing agreement signed in
-- the portal by the employee and then the client administrator, and the agreement's evidence.

-- Secret key only, like the session itself: the API writes the items when it sends the code and
-- reads them back when the code is typed.
create table public.signing_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.signing_sessions (id) on delete cascade,
  position smallint not null constraint signing_session_items_position_range check (position >= 0),
  request_id uuid references public.signature_requests (id) on delete cascade,
  agreement_employee_id uuid references public.employee_signing_agreements (employee_id) on delete cascade,
  agreement_party text
    constraint signing_session_items_party_valid check (agreement_party in ('employee', 'employer')),
  created_at timestamptz not null default now(),
  constraint signing_session_items_one_kind check (
    (request_id is null) <> (agreement_employee_id is null)
    and (agreement_employee_id is null) = (agreement_party is null)
  ),
  constraint signing_session_items_session_position_key unique (session_id, position),
  constraint signing_session_items_session_request_key unique (session_id, request_id),
  constraint signing_session_items_session_agreement_key unique (session_id, agreement_employee_id)
);

create index signing_session_items_request_id_idx on public.signing_session_items (request_id);
create index signing_session_items_agreement_employee_id_idx
  on public.signing_session_items (agreement_employee_id);

comment on table public.signing_session_items is
  'The requests and agreements one signing session signs, in the order shown (ADR 023). Secret key only.';

alter table public.signing_session_items enable row level security;
revoke all on table public.signing_session_items from anon, authenticated;

-- The employee signs first and certifies the stored PDF; the administrator signs that file.
alter table public.employee_signing_agreements
  add column storage_path text,
  add column employee_signed_at timestamptz,
  add column employer_signed_at timestamptz,
  add constraint employee_signing_agreements_stored_when_signed
    check ((employee_signed_at is null and employer_signed_at is null) or storage_path is not null),
  add constraint employee_signing_agreements_employee_signs_first
    check (employer_signed_at is null or employee_signed_at is not null);

-- Members insert only what they may update, so the electronic columns stay the secret key's.
revoke insert on table public.employee_signing_agreements from authenticated;
grant insert (employee_id, organization_id, client_id, state, generated_at, signed_at, marked_by, client_file_id)
  on table public.employee_signing_agreements to authenticated;

-- An agreement either party has signed electronically is the signing flow's from then on: a member
-- marking it on paper would leave a signed file the state denies.
create or replace function public.protect_signing_agreement_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    (tg_op <> 'INSERT' and (
      old.state = 'signed_electronically'
      or old.employee_signed_at is not null
      or old.employer_signed_at is not null
    ) and (tg_op = 'DELETE' or to_jsonb(new) - 'updated_at' <> to_jsonb(old) - 'updated_at'))
    or (tg_op <> 'DELETE' and new.state = 'signed_electronically'
      and (tg_op = 'INSERT' or old.state <> 'signed_electronically'))
  ) then
    raise exception 'agreement_signed_electronically' using errcode = 'SIG07';
  end if;
  return coalesce(new, old);
end;
$$;

create table public.agreement_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  employee_id uuid not null references public.employee_signing_agreements (employee_id) on delete restrict,
  party text not null constraint agreement_signatures_party_valid check (party in ('employee', 'employer')),
  -- Restrict: an account the evidence names is not deleted from under it.
  signer_account_id uuid not null references auth.users (id) on delete restrict,
  signer_name text not null
    constraint agreement_signatures_signer_name_length check (char_length(btrim(signer_name)) between 1 and 160),
  channel text not null constraint agreement_signatures_channel_valid check (channel in ('email', 'sms')),
  address text not null,
  code_sent_at timestamptz not null,
  code_verified_at timestamptz not null,
  -- The API's clock: no trusted timestamp yet (#486).
  signed_at timestamptz not null default now(),
  digest_before text not null,
  digest_after text not null,
  certificate_serial text not null,
  client_ip inet,
  user_agent text,
  signing_session_id uuid not null references public.signing_sessions (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint agreement_signatures_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint agreement_signatures_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  -- One signature per party: two sessions racing for the same signature are settled here.
  constraint agreement_signatures_employee_party_key unique (employee_id, party)
);

create index agreement_signatures_client_id_idx on public.agreement_signatures (client_id);
create index agreement_signatures_organization_id_idx on public.agreement_signatures (organization_id);
create index agreement_signatures_signer_account_id_idx on public.agreement_signatures (signer_account_id);
create index agreement_signatures_signing_session_id_idx on public.agreement_signatures (signing_session_id);

comment on table public.agreement_signatures is
  'The evidence of one party''s electronic signature on an employee''s signing agreement (ADR 023). Written once.';

create function public.protect_agreement_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'signature_written_once' using errcode = 'SIG06';
end;
$$;

create trigger agreement_signatures_written_once
  before update or delete on public.agreement_signatures
  for each row execute function public.protect_agreement_signature();
create trigger agreement_signatures_never_truncated
  before truncate on public.agreement_signatures
  for each statement execute function public.protect_agreement_signature();
create trigger agreement_signatures_protect_archived_client
  before insert on public.agreement_signatures
  for each row execute function public.protect_rows_of_archived_client();

revoke all on function public.protect_agreement_signature() from public, anon, authenticated;

alter table public.agreement_signatures enable row level security;
revoke all on table public.agreement_signatures from anon;
revoke insert, update, delete, truncate on table public.agreement_signatures from authenticated;

create policy "members read their agreement signatures"
  on public.agreement_signatures for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "signers read their own agreement signatures"
  on public.agreement_signatures for select to authenticated
  using (signer_account_id = (select auth.uid()));

create policy "participants read the signatures on their own agreement"
  on public.agreement_signatures for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's agreement signatures"
  on public.agreement_signatures for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));
