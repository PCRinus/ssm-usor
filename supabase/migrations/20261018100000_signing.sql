-- The advanced electronic signature on training records (ADR 023): who signs with what key, the
-- acts of signing, the requests, the evidence, the employees' signing agreements and the stored
-- sheets the signatures go in. A record with a live electronic signature is frozen.
--
-- Errors the API translates, raised with these SQLSTATEs:
--   42501  the caller is not a member of an organization
--   P0002  the training record is not the caller's: record_not_found
--   CLA01  the client is archived
--   SIG01  the record is signed: record_signed for a change to what it prints,
--          record_has_signatures for a delete
--   SIG02  the slot already has a live signature: slot_signed
--   SIG03  the slot is not on the record: no verifier on the training, no admission on the record
--   SIG04  the request does not hold together; the message is reason_required or
--          signer_name_required
--   SIG05  the signer cannot sign this slot: signer_not_of_client, signer_not_addressed
--   SIG06  a signature is written once: signature_written_once
--   SIG07  only the signing flow sets or undoes an electronic agreement:
--          agreement_signed_electronically

create type public.signer_slot as enum ('trainee', 'trainer', 'verifier', 'admitter');

-- No policy for anyone: the API signs with the secret key, and the private key, even
-- encrypted, never reaches a member or a participant.
create table public.signing_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references auth.users (id) on delete cascade,
  subject_name text not null
    constraint signing_identities_subject_name_length check (char_length(btrim(subject_name)) between 1 and 200),
  certificate_pem text not null,
  certificate_serial text not null unique,
  -- Encrypted under the API Worker's key-encryption key; key_version names which one.
  private_key_encrypted bytea not null,
  key_version smallint not null default 1,
  not_before timestamptz not null,
  not_after timestamptz not null,
  created_at timestamptz not null default now(),
  constraint signing_identities_validity check (not_after > not_before)
);

comment on table public.signing_identities is
  'A signer''s key pair and certificate from the app''s own authority (ADR 023). Secret key only.';

-- Not Supabase's one-time passcode: its verification issues a session and keeps its own record,
-- and the evidence of the code belongs to the signature (ADR 023). Secret key only.
create table public.signing_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  channel text not null constraint signing_sessions_channel_valid check (channel in ('email', 'sms')),
  address text not null,
  code_hash text not null,
  code_sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  attempts smallint not null default 0 constraint signing_sessions_attempts_range check (attempts >= 0),
  verified_at timestamptz,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint signing_sessions_address_of_channel check (
    case channel
      when 'email' then address = lower(btrim(address)) and char_length(address) between 3 and 254
      else address ~ '^\+[1-9][0-9]{7,14}$'
    end
  )
);

create index signing_sessions_account_sent_idx on public.signing_sessions (account_id, code_sent_at desc);

comment on table public.signing_sessions is
  'One act of signing: a code sent to the signer''s address and its verification (ADR 023). Secret key only.';

-- The composite keys below keep a request, a signature or a sheet row on its own record's client.
create unique index training_records_id_client_key on public.training_records (id, client_id);
create unique index client_files_id_client_key on public.client_files (id, client_id);

create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  training_record_id uuid not null,
  slot public.signer_slot not null,
  -- Null for a paper slot: its person has no account and signs by hand.
  signer_account_id uuid references auth.users (id) on delete cascade,
  issued_by uuid default auth.uid() references auth.users (id) on delete set null,
  issued_at timestamptz not null default now(),
  notified_at timestamptz,
  state text not null default 'pending'
    constraint signature_requests_state_valid check (state in ('pending', 'signed', 'void')),
  void_reason text
    constraint signature_requests_void_reason_length check (char_length(btrim(void_reason)) between 1 and 500),
  voided_at timestamptz,
  signing_session_id uuid references public.signing_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_requests_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint signature_requests_record_of_client
    foreign key (training_record_id, client_id) references public.training_records (id, client_id)
    on delete cascade,
  constraint signature_requests_void_whole
    check ((state = 'void') = (voided_at is not null) and (voided_at is null) = (void_reason is null))
);

create unique index signature_requests_live_slot_key
  on public.signature_requests (training_record_id, slot) where state <> 'void';
create unique index signature_requests_id_record_slot_key
  on public.signature_requests (id, training_record_id, slot);
create index signature_requests_pending_signer_idx
  on public.signature_requests (signer_account_id) where state = 'pending';
create index signature_requests_client_id_idx on public.signature_requests (client_id);
create index signature_requests_organization_id_idx on public.signature_requests (organization_id);

comment on table public.signature_requests is
  'One slot of one training record addressed to one signer: pending, signed or void (ADR 023).';

create table public.training_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  training_record_id uuid not null,
  slot public.signer_slot not null,
  request_id uuid not null unique,
  method text not null constraint training_signatures_method_valid check (method in ('electronic', 'paper')),
  -- Restrict: an account the evidence names is not deleted from under it.
  signer_account_id uuid references auth.users (id) on delete restrict,
  signer_name text not null
    constraint training_signatures_signer_name_length check (char_length(btrim(signer_name)) between 1 and 160),
  signer_job_title text
    constraint training_signatures_signer_job_title_length check (char_length(btrim(signer_job_title)) between 1 and 160),
  channel text constraint training_signatures_channel_valid check (channel in ('email', 'sms')),
  address text,
  code_sent_at timestamptz,
  code_verified_at timestamptz,
  -- The API's clock: no trusted timestamp yet (#486).
  signed_at timestamptz not null default now(),
  digest_before text,
  digest_after text,
  certificate_serial text,
  client_ip inet,
  user_agent text,
  signing_session_id uuid references public.signing_sessions (id) on delete restrict,
  marked_by uuid references auth.users (id) on delete restrict,
  voided_at timestamptz,
  void_reason text
    constraint training_signatures_void_reason_length check (char_length(btrim(void_reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint training_signatures_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint training_signatures_record_of_client
    foreign key (training_record_id, client_id) references public.training_records (id, client_id)
    on delete restrict,
  constraint training_signatures_request_of_slot
    foreign key (request_id, training_record_id, slot)
    references public.signature_requests (id, training_record_id, slot) on delete restrict,
  constraint training_signatures_evidence_of_method check (
    case method
      when 'electronic' then
        num_nulls(signer_account_id, channel, address, code_sent_at, code_verified_at,
          digest_before, digest_after, certificate_serial, signing_session_id) = 0
        and marked_by is null
      else
        marked_by is not null
        and num_nonnulls(signer_account_id, channel, address, code_sent_at, code_verified_at,
          digest_before, digest_after, certificate_serial, client_ip, user_agent,
          signing_session_id) = 0
    end
  ),
  constraint training_signatures_void_whole check ((voided_at is null) = (void_reason is null))
);

create unique index training_signatures_live_slot_key
  on public.training_signatures (training_record_id, slot) where voided_at is null;
create index training_signatures_client_id_idx on public.training_signatures (client_id);
create index training_signatures_organization_id_idx on public.training_signatures (organization_id);
create index training_signatures_signer_account_id_idx on public.training_signatures (signer_account_id);

comment on table public.training_signatures is
  'The evidence of one signature of one slot, electronic or marked as signed on paper (ADR 023). Written once: only voided afterwards.';

create table public.employee_signing_agreements (
  employee_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  state text not null default 'generated'
    constraint employee_signing_agreements_state_valid
    check (state in ('generated', 'signed_electronically', 'signed_on_paper')),
  generated_at timestamptz not null default now(),
  signed_at timestamptz,
  marked_by uuid references auth.users (id) on delete set null,
  client_file_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_signing_agreements_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint employee_signing_agreements_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete cascade,
  constraint employee_signing_agreements_scan_of_client
    foreign key (client_file_id, client_id) references public.client_files (id, client_id)
    on delete set null (client_file_id),
  constraint employee_signing_agreements_signed_when_signed
    check ((state = 'generated') = (signed_at is null)),
  constraint employee_signing_agreements_marked_on_paper
    check (state = 'signed_on_paper' or marked_by is null)
);

create index employee_signing_agreements_client_id_idx on public.employee_signing_agreements (client_id);
create index employee_signing_agreements_organization_id_idx
  on public.employee_signing_agreements (organization_id);

comment on table public.employee_signing_agreements is
  'The act adițional by which an employee agrees to sign training records electronically, and how it was signed (ADR 023).';

create table public.signed_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  employee_id uuid not null,
  domain public.training_domain not null,
  -- A continuation sheet counts up, as a second paper form would.
  sequence smallint not null default 1 constraint signed_sheets_sequence_positive check (sequence >= 1),
  storage_path text not null unique,
  -- SHA-256 of the current bytes, hex.
  digest text not null constraint signed_sheets_digest_format check (digest ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 constraint signed_sheets_version_positive check (version >= 1),
  -- Periodic rows the page holds.
  row_capacity smallint not null constraint signed_sheets_row_capacity_positive check (row_capacity >= 1),
  rows_used smallint not null default 0,
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signed_sheets_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint signed_sheets_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint signed_sheets_employee_domain_sequence_key unique (employee_id, domain, sequence),
  constraint signed_sheets_rows_used_range check (rows_used between 0 and row_capacity)
);

create index signed_sheets_client_id_idx on public.signed_sheets (client_id);
create index signed_sheets_organization_id_idx on public.signed_sheets (organization_id);

comment on table public.signed_sheets is
  'An individual training sheet stored as a PDF form for signing, one per employee, domain and continuation (ADR 023). Secret key writes.';

create table public.signed_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  signed_sheet_id uuid not null references public.signed_sheets (id) on delete restrict,
  -- The field-name prefix on the form: h1 and h2 for the hiring trainings, adm for the
  -- admission block, p1 to pN for the periodic rows.
  row_key text not null constraint signed_sheet_rows_row_key_format check (row_key ~ '^(h1|h2|adm|p[1-9][0-9]*)$'),
  training_record_id uuid not null references public.training_records (id) on delete restrict,
  filled_at timestamptz not null default now(),
  -- Set when the row is marked anulat on the sheet; the corrected record takes another row.
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint signed_sheet_rows_sheet_row_key unique (signed_sheet_id, row_key)
);

create unique index signed_sheet_rows_live_record_key
  on public.signed_sheet_rows (training_record_id) where voided_at is null;

comment on table public.signed_sheet_rows is
  'Which training record fills which row of a signed sheet (ADR 023). Secret key writes.';

create trigger signature_requests_set_updated_at before update on public.signature_requests
  for each row execute function public.set_updated_at();
create trigger employee_signing_agreements_set_updated_at before update on public.employee_signing_agreements
  for each row execute function public.set_updated_at();
create trigger signed_sheets_set_updated_at before update on public.signed_sheets
  for each row execute function public.set_updated_at();

create trigger signature_requests_protect_archived_client
  before insert or update or delete on public.signature_requests
  for each row execute function public.protect_rows_of_archived_client();
create trigger training_signatures_protect_archived_client
  before insert or update on public.training_signatures
  for each row execute function public.protect_rows_of_archived_client();
create trigger employee_signing_agreements_protect_archived_client
  before insert or update or delete on public.employee_signing_agreements
  for each row execute function public.protect_rows_of_archived_client();

create function public.training_record_has_slot(p_record_id uuid, p_slot public.signer_slot)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_slot
    when 'verifier' then t.verifier_name is not null
    when 'admitter' then r.admitted_on is not null
    else true
  end
  from public.training_records r
  join public.trainings t on t.id = r.training_id
  where r.id = p_record_id;
$$;

-- The trainee is the employee's own participant; anyone else is a member of the organization or
-- a participant of the client, a workplace manager being an employee participant.
create function public.check_signature_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.training_record_has_slot(new.training_record_id, new.slot), false) then
    raise exception 'slot_not_on_record' using errcode = 'SIG03';
  end if;
  if new.signer_account_id is null then
    return new;
  end if;
  if new.slot = 'trainee' then
    if not exists (
      select 1
      from public.client_participants p
      join public.training_records r on r.employee_id = p.employee_id
      where r.id = new.training_record_id
        and p.client_id = new.client_id
        and p.user_id = new.signer_account_id
        and p.revoked_at is null
    ) then
      raise exception 'signer_not_of_client' using errcode = 'SIG05';
    end if;
  elsif not exists (
    select 1 from public.organization_members m
    where m.user_id = new.signer_account_id and m.organization_id = new.organization_id
  ) and not exists (
    select 1 from public.client_participants p
    where p.user_id = new.signer_account_id and p.client_id = new.client_id and p.revoked_at is null
  ) then
    raise exception 'signer_not_of_client' using errcode = 'SIG05';
  end if;
  return new;
end;
$$;

create trigger signature_requests_check before insert on public.signature_requests
  for each row execute function public.check_signature_request();

create function public.check_training_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.signature_requests q
    where q.id = new.request_id and q.signer_account_id is distinct from new.signer_account_id
  ) then
    raise exception 'signer_not_addressed' using errcode = 'SIG05';
  end if;
  return new;
end;
$$;

create trigger training_signatures_check before insert on public.training_signatures
  for each row execute function public.check_training_signature();

-- Truncate included: a withdrawn signature is a fact of the record's history (ADR 023).
create function public.protect_training_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.voided_at is null
    and to_jsonb(new) - 'voided_at' - 'void_reason' = to_jsonb(old) - 'voided_at' - 'void_reason'
  then
    return new;
  end if;
  raise exception 'signature_written_once' using errcode = 'SIG06';
end;
$$;

create trigger training_signatures_written_once
  before update or delete on public.training_signatures
  for each row execute function public.protect_training_signature();
create trigger training_signatures_never_truncated
  before truncate on public.training_signatures
  for each statement execute function public.protect_training_signature();

create function public.training_record_is_signed(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.training_signatures s
    where s.training_record_id = p_record_id and s.method = 'electronic' and s.voided_at is null
  );
$$;

-- A paper signature does not freeze: its evidence is the paper, not the row's content. Domain
-- and phase are frozen with the rest, since they decide which sheet and row the record is on.
create function public.freeze_signed_training()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.training_records r
      join public.training_signatures s on s.training_record_id = r.id
      where r.training_id = old.id
    ) then
      raise exception 'record_has_signatures' using errcode = 'SIG01';
    end if;
    return old;
  end if;
  if exists (
    select 1 from public.training_records r
    where r.training_id = old.id and public.training_record_is_signed(r.id)
  ) then
    raise exception 'record_signed' using errcode = 'SIG01';
  end if;
  return new;
end;
$$;

create function public.freeze_signed_training_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.training_signatures s where s.training_record_id = old.id) then
      raise exception 'record_has_signatures' using errcode = 'SIG01';
    end if;
    return old;
  end if;
  if public.training_record_is_signed(old.id) then
    raise exception 'record_signed' using errcode = 'SIG01';
  end if;
  return new;
end;
$$;

create function public.void_requests_of_changed_training()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'record_changed'
  where q.state = 'pending'
    and q.training_record_id in (select r.id from public.training_records r where r.training_id = new.id);
  return null;
end;
$$;

create function public.void_requests_of_changed_training_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'record_changed'
  where q.state = 'pending' and q.training_record_id = new.id;
  return null;
end;
$$;

create trigger trainings_freeze_signed
  before update on public.trainings
  for each row
  when ((
    old.domain, old.phase, old.held_on, old.duration_minutes, old.material, old.trainer_name,
    old.trainer_job_title, old.verifier_name, old.verifier_job_title, old.supplementary_reason
  ) is distinct from (
    new.domain, new.phase, new.held_on, new.duration_minutes, new.material, new.trainer_name,
    new.trainer_job_title, new.verifier_name, new.verifier_job_title, new.supplementary_reason
  ))
  execute function public.freeze_signed_training();
create trigger trainings_freeze_signed_delete
  before delete on public.trainings
  for each row execute function public.freeze_signed_training();
create trigger trainings_void_pending_requests
  after update on public.trainings
  for each row
  when ((
    old.domain, old.phase, old.held_on, old.duration_minutes, old.material, old.trainer_name,
    old.trainer_job_title, old.verifier_name, old.verifier_job_title, old.supplementary_reason
  ) is distinct from (
    new.domain, new.phase, new.held_on, new.duration_minutes, new.material, new.trainer_name,
    new.trainer_job_title, new.verifier_name, new.verifier_job_title, new.supplementary_reason
  ))
  execute function public.void_requests_of_changed_training();

create trigger training_records_freeze_signed
  before update on public.training_records
  for each row
  when ((old.occupation, old.admitted_on, old.admitted_by_name, old.admitted_by_job_title)
    is distinct from (new.occupation, new.admitted_on, new.admitted_by_name, new.admitted_by_job_title))
  execute function public.freeze_signed_training_record();
create trigger training_records_freeze_signed_delete
  before delete on public.training_records
  for each row execute function public.freeze_signed_training_record();
create trigger training_records_void_pending_requests
  after update on public.training_records
  for each row
  when ((old.occupation, old.admitted_on, old.admitted_by_name, old.admitted_by_job_title)
    is distinct from (new.occupation, new.admitted_on, new.admitted_by_name, new.admitted_by_job_title))
  execute function public.void_requests_of_changed_training_record();

create function public.protect_signing_agreement_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    (tg_op <> 'INSERT' and old.state = 'signed_electronically'
      and (tg_op = 'DELETE' or new.state <> 'signed_electronically'))
    or (tg_op <> 'DELETE' and new.state = 'signed_electronically'
      and (tg_op = 'INSERT' or old.state <> 'signed_electronically'))
  ) then
    raise exception 'agreement_signed_electronically' using errcode = 'SIG07';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger employee_signing_agreements_protect_state
  before insert or update or delete on public.employee_signing_agreements
  for each row execute function public.protect_signing_agreement_state();

-- Signed requests are voided too, so that the slots can be requested again.
create function public.void_training_signatures(p_record_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  record public.training_records;
  reason text := nullif(btrim(p_reason), '');
  voided integer;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  select * into record from public.training_records r
  where r.id = p_record_id and r.organization_id = organization;
  if not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  elsif exists (
    select 1 from public.clients c where c.id = record.client_id and c.archived_at is not null
  ) then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  elsif reason is null then
    raise exception 'reason_required' using errcode = 'SIG04';
  end if;

  update public.training_signatures s
  set voided_at = now(), void_reason = reason
  where s.training_record_id = record.id and s.voided_at is null;
  get diagnostics voided = row_count;

  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = reason
  where q.training_record_id = record.id and q.state <> 'void';

  return voided;
end;
$$;

-- A pending request of the slot gives way to the paper: the person signed by hand instead.
create function public.mark_paper_signature(
  p_record_id uuid,
  p_slot public.signer_slot,
  p_signer_name text,
  p_signer_job_title text default null
)
returns public.training_signatures
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  record public.training_records;
  signer_name text := nullif(btrim(p_signer_name), '');
  request uuid;
  saved public.training_signatures;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  select * into record from public.training_records r
  where r.id = p_record_id and r.organization_id = organization;
  if not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  elsif exists (
    select 1 from public.clients c where c.id = record.client_id and c.archived_at is not null
  ) then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  elsif signer_name is null then
    raise exception 'signer_name_required' using errcode = 'SIG04';
  elsif not public.training_record_has_slot(record.id, p_slot) then
    raise exception 'slot_not_on_record' using errcode = 'SIG03';
  elsif exists (
    select 1 from public.training_signatures s
    where s.training_record_id = record.id and s.slot = p_slot and s.voided_at is null
  ) then
    raise exception 'slot_signed' using errcode = 'SIG02';
  end if;

  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'signed_on_paper'
  where q.training_record_id = record.id and q.slot = p_slot and q.state = 'pending';

  insert into public.signature_requests (
    organization_id, client_id, training_record_id, slot, signer_account_id, issued_by, state
  )
  values (record.organization_id, record.client_id, record.id, p_slot, null, auth.uid(), 'signed')
  returning id into request;

  insert into public.training_signatures (
    organization_id, client_id, training_record_id, slot, request_id, method, signer_name,
    signer_job_title, marked_by
  )
  values (
    record.organization_id, record.client_id, record.id, p_slot, request, 'paper', signer_name,
    nullif(btrim(p_signer_job_title), ''), auth.uid()
  )
  returning * into saved;

  return saved;
end;
$$;

-- Only the facts that changed reach the records: an admission cleared and set again on every
-- save would void the pending requests of an unchanged workplace training and refuse a signed one.
create or replace function public.save_training(
  p_client_id uuid,
  p_domain public.training_domain,
  p_phase public.training_phase,
  p_held_on date,
  p_duration_minutes smallint,
  p_material text,
  p_trainer_name text,
  p_trainer_job_title text,
  p_source public.training_source,
  p_attendees jsonb,
  p_training_id uuid default null,
  p_verifier_name text default null,
  p_verifier_job_title text default null,
  p_supplementary_reason public.supplementary_training_reason default null,
  p_themes_revision_id uuid default null,
  p_notes text default null,
  p_admitted_on date default null,
  p_admitted_by_name text default null,
  p_admitted_by_job_title text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  client_organization_id uuid;
  saved_id uuid;
begin
  select c.organization_id into client_organization_id from public.clients c where c.id = p_client_id;
  if not found then
    return null;
  end if;
  if p_training_id is null then
    insert into public.trainings (
      organization_id, client_id, domain, phase, held_on, duration_minutes, material,
      trainer_name, trainer_job_title, verifier_name, verifier_job_title, supplementary_reason,
      source, themes_revision_id, notes, created_by
    )
    values (
      client_organization_id, p_client_id, p_domain, p_phase, p_held_on, p_duration_minutes,
      p_material, p_trainer_name, p_trainer_job_title, p_verifier_name, p_verifier_job_title,
      p_supplementary_reason, p_source, p_themes_revision_id, p_notes, (select auth.uid())
    )
    returning id into saved_id;
  else
    if not exists (
      select 1 from public.trainings t where t.id = p_training_id and t.client_id = p_client_id
    ) then
      return null;
    end if;
    delete from public.training_records r
    where r.training_id = p_training_id
      and r.employee_id not in (
        select (a.value ->> 'employee_id')::uuid from jsonb_array_elements(p_attendees) as a (value)
      );
    -- The new phase reaches the records through the foreign key, and an admission left on them
    -- would fail its check when the training stops being a workplace one.
    update public.training_records r
    set admitted_on = null, admitted_by_name = null, admitted_by_job_title = null
    where r.training_id = p_training_id and r.admitted_on is not null and p_phase <> 'workplace';
    update public.trainings t set
      domain = p_domain,
      phase = p_phase,
      held_on = p_held_on,
      duration_minutes = p_duration_minutes,
      material = p_material,
      trainer_name = p_trainer_name,
      trainer_job_title = p_trainer_job_title,
      verifier_name = p_verifier_name,
      verifier_job_title = p_verifier_job_title,
      supplementary_reason = p_supplementary_reason,
      source = p_source,
      themes_revision_id = p_themes_revision_id,
      notes = p_notes
    where t.id = p_training_id
    returning t.id into saved_id;
  end if;
  insert into public.training_records (
    organization_id, client_id, training_id, phase, employee_id, occupation, admitted_on,
    admitted_by_name, admitted_by_job_title, created_by
  )
  select
    client_organization_id, p_client_id, saved_id, p_phase, (a.value ->> 'employee_id')::uuid,
    a.value ->> 'occupation', p_admitted_on, p_admitted_by_name, p_admitted_by_job_title,
    (select auth.uid())
  from jsonb_array_elements(p_attendees) as a (value)
  on conflict (training_id, employee_id) do update set
    admitted_on = excluded.admitted_on,
    admitted_by_name = excluded.admitted_by_name,
    admitted_by_job_title = excluded.admitted_by_job_title;
  return saved_id;
end;
$$;

revoke all on function public.training_record_has_slot(uuid, public.signer_slot) from public, anon, authenticated;
revoke all on function public.check_signature_request() from public, anon, authenticated;
revoke all on function public.check_training_signature() from public, anon, authenticated;
revoke all on function public.protect_training_signature() from public, anon, authenticated;
revoke all on function public.training_record_is_signed(uuid) from public, anon, authenticated;
revoke all on function public.freeze_signed_training() from public, anon, authenticated;
revoke all on function public.freeze_signed_training_record() from public, anon, authenticated;
revoke all on function public.void_requests_of_changed_training() from public, anon, authenticated;
revoke all on function public.void_requests_of_changed_training_record() from public, anon, authenticated;
revoke all on function public.protect_signing_agreement_state() from public, anon, authenticated;
revoke all on function public.void_training_signatures(uuid, text) from public, anon;
revoke all on function public.mark_paper_signature(uuid, public.signer_slot, text, text) from public, anon;
grant execute on function public.training_record_is_signed(uuid) to service_role;
grant execute on function public.void_training_signatures(uuid, text) to authenticated, service_role;
grant execute on function public.mark_paper_signature(uuid, public.signer_slot, text, text) to authenticated, service_role;

alter table public.signing_identities enable row level security;
alter table public.signing_sessions enable row level security;
alter table public.signature_requests enable row level security;
alter table public.training_signatures enable row level security;
alter table public.employee_signing_agreements enable row level security;
alter table public.signed_sheets enable row level security;
alter table public.signed_sheet_rows enable row level security;

revoke all on table public.signing_identities from anon, authenticated;
revoke all on table public.signing_sessions from anon, authenticated;
revoke all on table public.signature_requests from anon;
revoke all on table public.training_signatures from anon;
revoke all on table public.employee_signing_agreements from anon;
revoke all on table public.signed_sheets from anon;
revoke all on table public.signed_sheet_rows from anon;

-- Members issue requests; signing, notifying and voiding are the API's and the functions'.
revoke update, delete, truncate on table public.signature_requests from authenticated;
revoke insert, update, delete, truncate on table public.training_signatures from authenticated;
revoke insert, update, delete, truncate on table public.signed_sheets from authenticated;
revoke insert, update, delete, truncate on table public.signed_sheet_rows from authenticated;

create policy "members read their signature requests"
  on public.signature_requests for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members issue signature requests for their active clients"
  on public.signature_requests for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and state = 'pending'
    and signing_session_id is null
    and issued_by = (select auth.uid())
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
    )
  );

-- The real signed-in user, as in the other participant policies: impersonation is for members.
create policy "signers read the requests addressed to them"
  on public.signature_requests for select to authenticated
  using (signer_account_id = (select auth.uid()));

create policy "participants read the requests on their own records"
  on public.signature_requests for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and training_record_id in (
      select r.id from public.training_records r
      where r.employee_id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "client administrators read their client's signature requests"
  on public.signature_requests for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

create policy "members read their training signatures"
  on public.training_signatures for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "signers read their own signatures"
  on public.training_signatures for select to authenticated
  using (signer_account_id = (select auth.uid()));

create policy "participants read the signatures on their own records"
  on public.training_signatures for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and training_record_id in (
      select r.id from public.training_records r
      where r.employee_id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "client administrators read their client's training signatures"
  on public.training_signatures for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

create policy "members read their signing agreements"
  on public.employee_signing_agreements for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members record signing agreements for their active clients"
  on public.employee_signing_agreements for insert to authenticated
  with check (
    organization_id = (select public.current_organization_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = (select public.current_organization_id())
        and c.archived_at is null
    )
  );

create policy "members update their signing agreements"
  on public.employee_signing_agreements for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));

create policy "members delete their signing agreements"
  on public.employee_signing_agreements for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their own signing agreement"
  on public.employee_signing_agreements for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's signing agreements"
  on public.employee_signing_agreements for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

-- An agreement never moves to another employee or client.
revoke update on table public.employee_signing_agreements from authenticated;
grant update (state, generated_at, signed_at, marked_by, client_file_id)
  on table public.employee_signing_agreements to authenticated;

create policy "members read their signed sheets"
  on public.signed_sheets for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their own signed sheets"
  on public.signed_sheets for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's signed sheets"
  on public.signed_sheets for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

create policy "members read the rows of their signed sheets"
  on public.signed_sheet_rows for select to authenticated
  using (
    signed_sheet_id in (
      select s.id from public.signed_sheets s
      where s.organization_id = (select public.current_organization_id())
    )
  );

create policy "participants read the rows of their own signed sheets"
  on public.signed_sheet_rows for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and signed_sheet_id in (
      select s.id from public.signed_sheets s
      where s.employee_id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "client administrators read the rows of their client's signed sheets"
  on public.signed_sheet_rows for select to authenticated
  using (
    signed_sheet_id in (
      select s.id from public.signed_sheets s
      where s.client_id = any ((select public.administered_client_ids())::uuid[])
    )
  );
