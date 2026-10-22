-- The test sheet (ADR 024): the PDF a passing attempt renders, with the questions as the sitting
-- showed them, the answers chosen, the score and the grade, stored beside the signing agreements
-- and signed through the pipeline of ADR 023 by the trainee and the examiner. A signature request
-- now names one slot of either a training record or a test sheet; a test sheet's signatures have
-- their own evidence, never voided, since the attempt behind the sheet is frozen.
--
-- Errors added to those of the signing migrations:
--   P0002  test_sheet_not_found: the test sheet is not the caller's
--   SIG03  also for a slot a test sheet does not have
--   SIG04  also examiner_required: the result names no examiner to mark as signed on paper
--   TST07  examiner_signed: the examiner has signed the test sheet, so the result's examiner stays
--   TST08  test_sheet_kept: a test sheet is not deleted, and only its file moves on
--   23514  test_sheet_not_of_attempt: a test sheet is drawn from a portal result of its employee

-- Not columns of test_results: the sheet is a file that every signature moves to a new version,
-- written by the secret key only, while members update a result's examiner; and a paper result
-- has none. Its state is not stored either: the evidence rows say which slot is signed.
create table public.test_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  employee_id uuid not null,
  test_result_id uuid not null unique,
  storage_path text not null unique
    constraint test_sheets_storage_path_length check (char_length(storage_path) between 1 and 1024),
  -- SHA-256 of the current bytes, hex.
  digest text not null constraint test_sheets_digest_format check (digest ~ '^[0-9a-f]{64}$'),
  version integer not null default 1 constraint test_sheets_version_positive check (version >= 1),
  generated_at timestamptz not null default now(),
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_sheets_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint test_sheets_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint test_sheets_result_of_client
    foreign key (test_result_id, client_id) references public.test_results (id, client_id) on delete restrict
);

create unique index test_sheets_id_client_key on public.test_sheets (id, client_id);
create index test_sheets_client_id_idx on public.test_sheets (client_id);
create index test_sheets_organization_id_idx on public.test_sheets (organization_id);
create index test_sheets_employee_id_idx on public.test_sheets (employee_id);

comment on table public.test_sheets is
  'The test sheet of a passing attempt, stored as a PDF form for the trainee''s and the examiner''s signatures (ADR 024). Secret key writes.';

create trigger test_sheets_set_updated_at before update on public.test_sheets
  for each row execute function public.set_updated_at();
create trigger test_sheets_protect_archived_client
  before insert or update on public.test_sheets
  for each row execute function public.protect_rows_of_archived_client();

create function public.check_test_sheet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.test_results x
    where x.id = new.test_result_id
      and x.employee_id = new.employee_id
      and x.source = 'portal'
  ) then
    raise exception 'test_sheet_not_of_attempt' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger test_sheets_check before insert on public.test_sheets
  for each row execute function public.check_test_sheet();

-- The attempt is frozen, so the sheet is never drawn up again: each write is the next version of
-- the same file, and the earlier ones stay for the evidence's digests.
create function public.protect_test_sheet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and (new.organization_id, new.client_id, new.employee_id, new.test_result_id, new.generated_at, new.created_at)
      is not distinct from
      (old.organization_id, old.client_id, old.employee_id, old.test_result_id, old.generated_at, old.created_at)
    and new.version = old.version + 1
    and (old.certified_at is null or new.certified_at = old.certified_at)
  then
    return new;
  end if;
  raise exception 'test_sheet_kept' using errcode = 'TST08';
end;
$$;

create trigger test_sheets_kept
  before update or delete on public.test_sheets
  for each row execute function public.protect_test_sheet();
create trigger test_sheets_never_truncated
  before truncate on public.test_sheets
  for each statement execute function public.protect_test_sheet();

-- A request names one slot of one document: a training record's, or a test sheet's trainee or
-- examiner. The trainee keeps its value on both, since it is the same person signing as the one
-- tested or trained, and the lists and the app's place rule treat them alike.
alter table public.signature_requests
  alter column training_record_id drop not null,
  add column test_sheet_id uuid,
  add constraint signature_requests_sheet_of_client
    foreign key (test_sheet_id, client_id) references public.test_sheets (id, client_id) on delete restrict,
  add constraint signature_requests_one_document
    check (num_nonnulls(training_record_id, test_sheet_id) = 1),
  add constraint signature_requests_slot_of_document check (
    case when test_sheet_id is null then slot <> 'examiner' else slot in ('trainee', 'examiner') end
  );

create unique index signature_requests_live_sheet_slot_key
  on public.signature_requests (test_sheet_id, slot) where state <> 'void' and test_sheet_id is not null;
create unique index signature_requests_id_sheet_slot_key
  on public.signature_requests (id, test_sheet_id, slot);
create index signature_requests_test_sheet_id_idx on public.signature_requests (test_sheet_id);

comment on table public.signature_requests is
  'One slot of one training record or test sheet addressed to one signer: pending, signed or void (ADR 023, ADR 024).';

create or replace function public.training_record_has_slot(p_record_id uuid, p_slot public.signer_slot)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_slot
    when 'verifier' then t.verifier_name is not null
    when 'admitter' then r.admitted_on is not null
    when 'examiner' then false
    else true
  end
  from public.training_records r
  join public.trainings t on t.id = r.training_id
  where r.id = p_record_id;
$$;

create function public.test_sheet_signer_has_standing(
  p_account_id uuid,
  p_organization_id uuid,
  p_client_id uuid,
  p_test_sheet_id uuid,
  p_slot public.signer_slot
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_slot = 'trainee' then exists (
      select 1
      from public.client_participants p
      join public.test_sheets s on s.employee_id = p.employee_id
      where s.id = p_test_sheet_id
        and p.client_id = p_client_id
        and p.user_id = p_account_id
        and p.revoked_at is null
    )
    when p_slot = 'examiner' then exists (
      select 1 from public.organization_members m
      where m.user_id = p_account_id and m.organization_id = p_organization_id
    ) or exists (
      select 1 from public.client_participants p
      where p.user_id = p_account_id and p.client_id = p_client_id and p.revoked_at is null
    )
    else false
  end;
$$;

create or replace function public.check_signature_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.test_sheet_id is not null then
    if new.slot not in ('trainee', 'examiner') then
      raise exception 'slot_not_on_sheet' using errcode = 'SIG03';
    end if;
    if new.signer_account_id is null then
      return new;
    end if;
    if not public.test_sheet_signer_has_standing(
      new.signer_account_id, new.organization_id, new.client_id, new.test_sheet_id, new.slot
    ) then
      raise exception 'signer_not_of_client' using errcode = 'SIG05';
    end if;
    if new.slot = 'trainee' and new.state = 'pending' and exists (
      select 1
      from public.employee_signing_agreements a
      join public.test_sheets s on s.employee_id = a.employee_id
      where s.id = new.test_sheet_id and a.state = 'withdrawn'
    ) then
      raise exception 'agreement_withdrawn' using errcode = 'SIG05';
    end if;
    return new;
  end if;

  if not coalesce(public.training_record_has_slot(new.training_record_id, new.slot), false) then
    raise exception 'slot_not_on_record' using errcode = 'SIG03';
  end if;
  if new.signer_account_id is null then
    return new;
  end if;
  if not public.signer_has_standing(
    new.signer_account_id, new.organization_id, new.client_id, new.training_record_id, new.slot
  ) then
    raise exception 'signer_not_of_client' using errcode = 'SIG05';
  end if;
  if new.slot = 'trainee' and new.state = 'pending' and exists (
    select 1
    from public.employee_signing_agreements a
    join public.training_records r on r.employee_id = a.employee_id
    where r.id = new.training_record_id and a.state = 'withdrawn'
  ) then
    raise exception 'agreement_withdrawn' using errcode = 'SIG05';
  end if;
  return new;
end;
$$;

drop trigger signature_requests_check on public.signature_requests;
create trigger signature_requests_check
  before insert or update of signer_account_id, slot, training_record_id, test_sheet_id, client_id
  on public.signature_requests
  for each row execute function public.check_signature_request();

create or replace function public.void_requests_without_standing(
  p_account_id uuid,
  p_organization_id uuid,
  p_client_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'signer_left'
  where q.state = 'pending'
    and q.signer_account_id = p_account_id
    and (p_organization_id is null or q.organization_id = p_organization_id)
    and (p_client_id is null or q.client_id = p_client_id)
    and not case
      when q.test_sheet_id is not null then public.test_sheet_signer_has_standing(
        q.signer_account_id, q.organization_id, q.client_id, q.test_sheet_id, q.slot
      )
      else public.signer_has_standing(
        q.signer_account_id, q.organization_id, q.client_id, q.training_record_id, q.slot
      )
    end;
$$;

create or replace function public.void_trainee_requests_of_withdrawn_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'withdrawn'
  where q.state = 'pending'
    and q.slot = 'trainee'
    and (
      q.training_record_id in (
        select r.id from public.training_records r where r.employee_id = new.employee_id
      )
      or q.test_sheet_id in (
        select s.id from public.test_sheets s where s.employee_id = new.employee_id
      )
    );
  return null;
end;
$$;

-- As training_signatures, without a void: the trainee's and the examiner's signatures on a frozen
-- attempt are never withdrawn, and the examiner's fixes the result's examiner.
create table public.test_sheet_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  test_sheet_id uuid not null,
  slot public.signer_slot not null
    constraint test_sheet_signatures_slot_valid check (slot in ('trainee', 'examiner')),
  request_id uuid not null unique,
  method text not null constraint test_sheet_signatures_method_valid check (method in ('electronic', 'paper')),
  -- Restrict: an account the evidence names is not deleted from under it.
  signer_account_id uuid references auth.users (id) on delete restrict,
  signer_name text not null
    constraint test_sheet_signatures_signer_name_length check (char_length(btrim(signer_name)) between 1 and 160),
  signer_job_title text
    constraint test_sheet_signatures_signer_job_title_length check (char_length(btrim(signer_job_title)) between 1 and 160),
  channel text constraint test_sheet_signatures_channel_valid check (channel in ('email', 'sms')),
  address text,
  code_sent_at timestamptz,
  code_verified_at timestamptz,
  -- The database's clock: no trusted timestamp yet (#486).
  signed_at timestamptz not null default now(),
  digest_before text,
  digest_after text,
  certificate_serial text,
  client_ip inet,
  user_agent text,
  signing_session_id uuid references public.signing_sessions (id) on delete restrict,
  marked_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint test_sheet_signatures_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint test_sheet_signatures_sheet_of_client
    foreign key (test_sheet_id, client_id) references public.test_sheets (id, client_id) on delete restrict,
  constraint test_sheet_signatures_request_of_slot
    foreign key (request_id, test_sheet_id, slot)
    references public.signature_requests (id, test_sheet_id, slot) on delete restrict,
  constraint test_sheet_signatures_sheet_slot_key unique (test_sheet_id, slot),
  constraint test_sheet_signatures_evidence_of_method check (
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
  )
);

create index test_sheet_signatures_client_id_idx on public.test_sheet_signatures (client_id);
create index test_sheet_signatures_organization_id_idx on public.test_sheet_signatures (organization_id);
create index test_sheet_signatures_signer_account_id_idx on public.test_sheet_signatures (signer_account_id);
create index test_sheet_signatures_signing_session_id_idx on public.test_sheet_signatures (signing_session_id);

comment on table public.test_sheet_signatures is
  'The evidence of one signature of a test sheet''s slot, electronic or marked as signed on paper (ADR 024). Written once.';

create function public.check_test_sheet_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.signature_requests;
  session public.signing_sessions;
begin
  select * into request from public.signature_requests q where q.id = new.request_id for update;
  if not found then
    return new;
  end if;
  if request.signer_account_id is distinct from new.signer_account_id then
    raise exception 'signer_not_addressed' using errcode = 'SIG05';
  end if;
  if request.state <> 'pending' then
    raise exception 'request_not_pending' using errcode = 'SIG08';
  end if;
  if new.method <> 'electronic' then
    return new;
  end if;

  select * into session from public.signing_sessions s where s.id = new.signing_session_id;
  if not found
    or session.account_id <> new.signer_account_id
    or session.verified_at is null
    or session.channel <> new.channel
    or session.address <> new.address
    or not exists (
      select 1 from public.signing_session_items i
      where i.session_id = session.id and i.request_id = new.request_id
    )
  then
    raise exception 'session_mismatch' using errcode = 'SIG09';
  end if;
  if not public.test_sheet_signer_has_standing(
    new.signer_account_id, new.organization_id, new.client_id, new.test_sheet_id, new.slot
  ) then
    raise exception 'signer_not_of_client' using errcode = 'SIG05';
  end if;
  new.code_sent_at := session.code_sent_at;
  new.code_verified_at := session.verified_at;
  return new;
end;
$$;

create trigger test_sheet_signatures_check before insert on public.test_sheet_signatures
  for each row execute function public.check_test_sheet_signature();

create function public.settle_test_sheet_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.signature_requests q
  set state = 'signed', signing_session_id = new.signing_session_id
  where q.id = new.request_id;
  return null;
end;
$$;

create trigger test_sheet_signatures_settle_request after insert on public.test_sheet_signatures
  for each row execute function public.settle_test_sheet_request();

create function public.protect_test_sheet_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'signature_written_once' using errcode = 'SIG06';
end;
$$;

create trigger test_sheet_signatures_written_once
  before update or delete on public.test_sheet_signatures
  for each row execute function public.protect_test_sheet_signature();
create trigger test_sheet_signatures_never_truncated
  before truncate on public.test_sheet_signatures
  for each statement execute function public.protect_test_sheet_signature();
create trigger test_sheet_signatures_protect_archived_client
  before insert on public.test_sheet_signatures
  for each row execute function public.protect_rows_of_archived_client();

-- The paper signature names whom the sheet prints in the slot: the employee, or the result's
-- examiner, so that the evidence and the printed sheet never disagree. A pending request of the
-- slot gives way to it, as on a training record.
create function public.mark_test_sheet_paper_signature(p_test_sheet_id uuid, p_slot public.signer_slot)
returns public.test_sheet_signatures
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  sheet public.test_sheets;
  signer_name text;
  signer_job_title text;
  request uuid;
  saved public.test_sheet_signatures;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  select * into sheet from public.test_sheets s
  where s.id = p_test_sheet_id and s.organization_id = organization;
  if not found then
    raise exception 'test_sheet_not_found' using errcode = 'P0002';
  elsif exists (
    select 1 from public.clients c where c.id = sheet.client_id and c.archived_at is not null
  ) then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  elsif p_slot not in ('trainee', 'examiner') then
    raise exception 'slot_not_on_sheet' using errcode = 'SIG03';
  elsif exists (
    select 1 from public.test_sheet_signatures s
    where s.test_sheet_id = sheet.id and s.slot = p_slot
  ) then
    raise exception 'slot_signed' using errcode = 'SIG02';
  end if;

  if p_slot = 'trainee' then
    select e.last_name || ' ' || e.first_name, e.job_title into signer_name, signer_job_title
    from public.employees e where e.id = sheet.employee_id;
  else
    select x.examiner_name, x.examiner_job_title into signer_name, signer_job_title
    from public.test_results x where x.id = sheet.test_result_id;
    if signer_name is null then
      raise exception 'examiner_required' using errcode = 'SIG04';
    end if;
  end if;

  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'signed_on_paper', voided_by = auth.uid()
  where q.test_sheet_id = sheet.id and q.slot = p_slot and q.state = 'pending';

  insert into public.signature_requests (
    organization_id, client_id, test_sheet_id, slot, signer_account_id, issued_by
  )
  values (sheet.organization_id, sheet.client_id, sheet.id, p_slot, null, auth.uid())
  returning id into request;

  insert into public.test_sheet_signatures (
    organization_id, client_id, test_sheet_id, slot, request_id, method, signer_name,
    signer_job_title, marked_by
  )
  values (
    sheet.organization_id, sheet.client_id, sheet.id, p_slot, request, 'paper', btrim(signer_name),
    nullif(btrim(signer_job_title), ''), auth.uid()
  )
  returning * into saved;

  return saved;
end;
$$;

-- The examiner's name and function print on the sheet as fields the API fills again when the
-- result's examiner changes, until the examiner signs, whose signature locks them.
create function public.protect_signed_examiner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.test_sheet_signatures s
    join public.test_sheets t on t.id = s.test_sheet_id
    where t.test_result_id = old.id and s.slot = 'examiner'
  ) then
    raise exception 'examiner_signed' using errcode = 'TST07';
  end if;
  return new;
end;
$$;

create trigger test_results_protect_signed_examiner
  before update on public.test_results
  for each row
  when ((old.examiner_name, old.examiner_job_title) is distinct from (new.examiner_name, new.examiner_job_title))
  execute function public.protect_signed_examiner();

create function public.void_examiner_request_of_changed_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'signer_changed'
  where q.state = 'pending'
    and q.slot = 'examiner'
    and q.test_sheet_id in (select s.id from public.test_sheets s where s.test_result_id = new.id);
  return null;
end;
$$;

create trigger test_results_void_examiner_request
  after update on public.test_results
  for each row
  when ((old.examiner_name, old.examiner_job_title) is distinct from (new.examiner_name, new.examiner_job_title))
  execute function public.void_examiner_request_of_changed_result();

revoke all on function public.check_test_sheet() from public, anon, authenticated;
revoke all on function public.protect_test_sheet() from public, anon, authenticated;
revoke all on function public.test_sheet_signer_has_standing(uuid, uuid, uuid, uuid, public.signer_slot) from public, anon, authenticated;
revoke all on function public.check_test_sheet_signature() from public, anon, authenticated;
revoke all on function public.settle_test_sheet_request() from public, anon, authenticated;
revoke all on function public.protect_test_sheet_signature() from public, anon, authenticated;
revoke all on function public.protect_signed_examiner() from public, anon, authenticated;
revoke all on function public.void_examiner_request_of_changed_result() from public, anon, authenticated;
revoke all on function public.mark_test_sheet_paper_signature(uuid, public.signer_slot) from public, anon;
grant execute on function public.mark_test_sheet_paper_signature(uuid, public.signer_slot) to authenticated, service_role;

alter table public.test_sheets enable row level security;
alter table public.test_sheet_signatures enable row level security;

revoke all on table public.test_sheets from anon;
revoke all on table public.test_sheet_signatures from anon;
revoke insert, update, delete, truncate on table public.test_sheets from authenticated;
revoke insert, update, delete, truncate on table public.test_sheet_signatures from authenticated;

create policy "members read their test sheets"
  on public.test_sheets for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their own test sheets"
  on public.test_sheets for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's test sheets"
  on public.test_sheets for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

create policy "participants read the requests on their own test sheets"
  on public.signature_requests for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and test_sheet_id in (
      select s.id from public.test_sheets s
      where s.employee_id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "members read their test sheet signatures"
  on public.test_sheet_signatures for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "signers read their own test sheet signatures"
  on public.test_sheet_signatures for select to authenticated
  using (signer_account_id = (select auth.uid()));

create policy "participants read the signatures on their own test sheets"
  on public.test_sheet_signatures for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and test_sheet_id in (
      select s.id from public.test_sheets s
      where s.employee_id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "client administrators read their client's test sheet signatures"
  on public.test_sheet_signatures for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

-- As on training_signatures: the code's address, the client's address and agent, the digests,
-- the certificate and the session stay with the secret key.
revoke select on table public.test_sheet_signatures from authenticated;
grant select (
  id, organization_id, client_id, test_sheet_id, slot, request_id, method, signer_account_id,
  signer_name, signer_job_title, signed_at, marked_by, created_at
) on table public.test_sheet_signatures to authenticated;
