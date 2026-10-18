-- The signing schema's guarantees (ADR 023): the evidence and the request it answers are one
-- write, a signer's standing is checked again when they sign and lost when they leave, the
-- agreement's evidence moves it on, voids name who made them, the evidence's columns participants
-- do not need are the secret key's, and a sheet row stays on its client, employee and domain.
--
-- Errors added to those of 20261018100000_signing.sql:
--   SIG05  also agreement_withdrawn: no trainee request for an employee who returned to paper
--   SIG08  request_not_pending: evidence for a request that is signed or void
--   SIG09  session_mismatch: the signing session is not the signer's, not verified, not for this
--          item, or its address is not the one recorded; session_used: a verified session changed
--   SIG10  the agreement: agreement_not_awaiting, agreement_signer_not_party, agreement_recorded
--   23514  row_not_of_sheet: a sheet row of another employee or domain

-- The signer of a slot, as the request names them: the employee's own active participant for the
-- trainee, else a member of the organization or an active participant of the client.
create function public.signer_has_standing(
  p_account_id uuid,
  p_organization_id uuid,
  p_client_id uuid,
  p_record_id uuid,
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
      join public.training_records r on r.employee_id = p.employee_id
      where r.id = p_record_id
        and p.client_id = p_client_id
        and p.user_id = p_account_id
        and p.revoked_at is null
    )
    else exists (
      select 1 from public.organization_members m
      where m.user_id = p_account_id and m.organization_id = p_organization_id
    ) or exists (
      select 1 from public.client_participants p
      where p.user_id = p_account_id and p.client_id = p_client_id and p.revoked_at is null
    )
  end;
$$;

create or replace function public.check_signature_request()
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
  before insert or update of signer_account_id, slot, training_record_id, client_id
  on public.signature_requests
  for each row execute function public.check_signature_request();

-- The void's actor. Null on a void made with the secret key: a save that changed the record, a
-- signer who left, an archived client.
alter table public.signature_requests
  add column voided_by uuid references auth.users (id) on delete set null,
  add constraint signature_requests_voided_by_when_void check (voided_by is null or state = 'void');

alter table public.training_signatures
  add column voided_by uuid references auth.users (id) on delete restrict,
  add constraint training_signatures_voided_by_when_void check (voided_by is null or voided_at is not null);

create function public.stamp_signature_request_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'void' and old.state <> 'void' then
    new.voided_by := coalesce(new.voided_by, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger signature_requests_stamp_void before update on public.signature_requests
  for each row execute function public.stamp_signature_request_void();

-- Truncate included: a withdrawn signature is a fact of the record's history (ADR 023).
create or replace function public.protect_training_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.voided_at is null
    and new.voided_at is not null
    and to_jsonb(new) - 'voided_at' - 'void_reason' - 'voided_by'
      = to_jsonb(old) - 'voided_at' - 'void_reason' - 'voided_by'
  then
    new.voided_by := coalesce(new.voided_by, (select auth.uid()));
    return new;
  end if;
  raise exception 'signature_written_once' using errcode = 'SIG06';
end;
$$;

-- A verified session has been spent: nothing about it changes afterwards.
create function public.protect_signing_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.verified_at is not null then
    raise exception 'session_used' using errcode = 'SIG09';
  end if;
  return new;
end;
$$;

create trigger signing_sessions_used_once before update on public.signing_sessions
  for each row execute function public.protect_signing_session();

alter table public.signing_sessions
  add column place text not null constraint signing_sessions_place_valid check (place in ('app', 'portal')),
  add column participant_id uuid references public.client_participants (id) on delete cascade,
  add constraint signing_sessions_participant_of_portal check ((place = 'portal') = (participant_id is not null));

create index signing_sessions_participant_id_idx on public.signing_sessions (participant_id);

-- What the agreement said when the code was asked for: refused at signing if it says otherwise.
alter table public.signing_session_items
  add column agreement_digest text
    constraint signing_session_items_agreement_digest_format check (agreement_digest ~ '^[0-9a-f]{64}$'),
  add constraint signing_session_items_digest_of_agreement
    check (agreement_digest is null or agreement_employee_id is not null);

-- One code a minute per account, decided by the database: the advisory lock serializes two
-- requests of the same account, which a read-then-insert in the API would let both through.
create function public.create_signing_session(
  p_id uuid,
  p_account_id uuid,
  p_place text,
  p_channel text,
  p_address text,
  p_code_hash text,
  p_valid_minutes integer,
  p_interval_seconds integer,
  p_participant_id uuid default null,
  p_client_ip inet default null,
  p_user_agent text default null
)
returns table (retry_after_seconds integer, code_sent_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  interval_length interval := make_interval(secs => p_interval_seconds);
  last_sent timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('signing_session:' || p_account_id::text, 0));
  insert into public.signing_sessions (
    id, account_id, place, participant_id, channel, address, code_hash, code_sent_at, expires_at,
    client_ip, user_agent
  )
  select
    p_id, p_account_id, p_place, p_participant_id, p_channel, p_address, p_code_hash, now(),
    now() + make_interval(mins => p_valid_minutes), p_client_ip, p_user_agent
  where not exists (
    select 1 from public.signing_sessions s
    where s.account_id = p_account_id and s.code_sent_at > now() - interval_length
  );
  if found then
    return query select 0, now(), now() + make_interval(mins => p_valid_minutes);
    return;
  end if;
  select max(s.code_sent_at) into last_sent
  from public.signing_sessions s
  where s.account_id = p_account_id;
  return query select
    greatest(1, ceil(extract(epoch from last_sent + interval_length - now())))::integer,
    null::timestamptz,
    null::timestamptz;
end;
$$;

-- The evidence and its request are one write: the request is locked while the evidence goes in,
-- must still be pending, and becomes signed by the trigger below, never by a separate update.
create or replace function public.check_training_signature()
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
  if not public.signer_has_standing(
    new.signer_account_id, new.organization_id, new.client_id, new.training_record_id, new.slot
  ) then
    raise exception 'signer_not_of_client' using errcode = 'SIG05';
  end if;
  new.code_sent_at := session.code_sent_at;
  new.code_verified_at := session.verified_at;
  return new;
end;
$$;

create function public.settle_signature_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.signature_requests q
    set state = 'signed', signing_session_id = new.signing_session_id
    where q.id = new.request_id;
  elsif new.voided_at is not null and old.voided_at is null then
    update public.signature_requests q
    set state = 'void', voided_at = new.voided_at, void_reason = new.void_reason, voided_by = new.voided_by
    where q.id = new.request_id and q.state <> 'void';
  end if;
  return null;
end;
$$;

create trigger training_signatures_settle_request
  after insert or update of voided_at on public.training_signatures
  for each row execute function public.settle_signature_request();

-- A paper mark goes in as a pending request without a signer, which its evidence then signs, so
-- that every signature passes the same check.
create or replace function public.mark_paper_signature(
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
  set state = 'void', voided_at = now(), void_reason = 'signed_on_paper', voided_by = auth.uid()
  where q.training_record_id = record.id and q.slot = p_slot and q.state = 'pending';

  insert into public.signature_requests (
    organization_id, client_id, training_record_id, slot, signer_account_id, issued_by
  )
  values (record.organization_id, record.client_id, record.id, p_slot, null, auth.uid())
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

-- A void of an electronic signature strikes the record's row on its sheet as well: the API writes
-- "anulat" into the row's note on the sheet's next write, and the corrected record takes a new row.
create or replace function public.void_training_signatures(p_record_id uuid, p_reason text)
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
  electronic integer;
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

  select count(*) filter (where s.method = 'electronic') into electronic
  from public.training_signatures s
  where s.training_record_id = record.id and s.voided_at is null;

  update public.training_signatures s
  set voided_at = now(), void_reason = reason, voided_by = auth.uid()
  where s.training_record_id = record.id and s.voided_at is null;
  get diagnostics voided = row_count;

  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = reason, voided_by = auth.uid()
  where q.training_record_id = record.id and q.state <> 'void';

  if electronic > 0 then
    update public.signed_sheet_rows w
    set voided_at = now()
    where w.training_record_id = record.id and w.voided_at is null;
  end if;

  return voided;
end;
$$;

alter table public.employee_signing_agreements
  drop constraint employee_signing_agreements_state_valid,
  add constraint employee_signing_agreements_state_valid
    check (state in ('generated', 'signed_electronically', 'signed_on_paper', 'withdrawn', 'in_contract')),
  drop constraint employee_signing_agreements_signed_when_signed,
  add constraint employee_signing_agreements_signed_when_signed
    check ((state in ('signed_electronically', 'signed_on_paper')) = (signed_at is not null)),
  drop constraint employee_signing_agreements_marked_on_paper,
  add constraint employee_signing_agreements_marked_by_member
    check (state in ('signed_on_paper', 'withdrawn', 'in_contract') or marked_by is null),
  add constraint employee_signing_agreements_electronic_only_signed
    check (state in ('generated', 'signed_electronically') or (employee_signed_at is null and employer_signed_at is null)),
  add constraint employee_signing_agreements_signed_by_employer
    check ((state = 'signed_electronically') = (employer_signed_at is not null));

comment on column public.employee_signing_agreements.state is
  'generated, signed_electronically, signed_on_paper, withdrawn (the employee returned to signing by hand) or in_contract (a new hire whose contract carries the clause).';

-- The member who set a state is the signed-in one, whatever the request said.
create function public.stamp_signing_agreement_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.state is distinct from old.state then
    new.marked_by := case
      when new.state in ('signed_on_paper', 'withdrawn', 'in_contract') then (select auth.uid())
    end;
  else
    new.marked_by := old.marked_by;
  end if;
  return new;
end;
$$;

create trigger employee_signing_agreements_stamp_member
  before insert or update on public.employee_signing_agreements
  for each row execute function public.stamp_signing_agreement_member();

-- An agreement recorded as anything but generated is a fact of the employee's file; it goes only
-- with the employee.
create function public.keep_recorded_signing_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state <> 'generated'
    and exists (select 1 from public.employees e where e.id = old.employee_id)
  then
    raise exception 'agreement_recorded' using errcode = 'SIG10';
  end if;
  return old;
end;
$$;

create trigger employee_signing_agreements_retain_recorded
  before delete on public.employee_signing_agreements
  for each row execute function public.keep_recorded_signing_agreement();

create function public.void_trainee_requests_of_withdrawn_agreement()
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
    and q.training_record_id in (
      select r.id from public.training_records r where r.employee_id = new.employee_id
    );
  return null;
end;
$$;

create trigger employee_signing_agreements_withdrawn_voids_requests
  after insert or update of state on public.employee_signing_agreements
  for each row
  when (new.state = 'withdrawn')
  execute function public.void_trainee_requests_of_withdrawn_agreement();

revoke truncate on table public.employee_signing_agreements from authenticated;

alter table public.agreement_signatures
  add column storage_path text not null
    constraint agreement_signatures_storage_path_length check (char_length(storage_path) between 1 and 1024);

create function public.check_agreement_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  agreement public.employee_signing_agreements;
  session public.signing_sessions;
begin
  select * into agreement from public.employee_signing_agreements a
  where a.employee_id = new.employee_id for update;
  if not found or agreement.state <> 'generated' or (
    case new.party
      when 'employee' then agreement.employee_signed_at is not null
      else agreement.employee_signed_at is null
        or agreement.employer_signed_at is not null
        or not exists (
          select 1 from public.agreement_signatures s
          where s.employee_id = new.employee_id and s.party = 'employee'
        )
    end
  ) then
    raise exception 'agreement_not_awaiting' using errcode = 'SIG10';
  end if;

  if not exists (
    select 1 from public.client_participants p
    where p.client_id = new.client_id
      and p.user_id = new.signer_account_id
      and p.revoked_at is null
      and case new.party
        when 'employee' then p.employee_id = new.employee_id
        else p.kind = 'client_administrator'
      end
  ) then
    raise exception 'agreement_signer_not_party' using errcode = 'SIG10';
  end if;

  select * into session from public.signing_sessions s where s.id = new.signing_session_id;
  if not found
    or session.account_id <> new.signer_account_id
    or session.verified_at is null
    or session.channel <> new.channel
    or session.address <> new.address
    or not exists (
      select 1 from public.signing_session_items i
      where i.session_id = session.id
        and i.agreement_employee_id = new.employee_id
        and i.agreement_party = new.party
    )
  then
    raise exception 'session_mismatch' using errcode = 'SIG09';
  end if;
  new.code_sent_at := session.code_sent_at;
  new.code_verified_at := session.verified_at;
  return new;
end;
$$;

create trigger agreement_signatures_check before insert on public.agreement_signatures
  for each row execute function public.check_agreement_signature();

create function public.settle_signing_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.party = 'employee' then
    update public.employee_signing_agreements a
    set storage_path = new.storage_path, employee_signed_at = new.signed_at
    where a.employee_id = new.employee_id;
  else
    update public.employee_signing_agreements a
    set storage_path = new.storage_path, employer_signed_at = new.signed_at,
      state = 'signed_electronically', signed_at = new.signed_at
    where a.employee_id = new.employee_id;
  end if;
  return null;
end;
$$;

create trigger agreement_signatures_settle_agreement after insert on public.agreement_signatures
  for each row execute function public.settle_signing_agreement();

-- Participants and administrators read who signed and when; the code's address, the client's
-- address and agent, the digests, the certificate and the session stay with the secret key.
revoke select on table public.training_signatures from authenticated;
grant select (
  id, organization_id, client_id, training_record_id, slot, request_id, method, signer_account_id,
  signer_name, signer_job_title, signed_at, marked_by, voided_at, void_reason, voided_by, created_at
) on table public.training_signatures to authenticated;

revoke select on table public.agreement_signatures from authenticated;
grant select (
  id, organization_id, client_id, employee_id, party, signer_account_id, signer_name, signed_at,
  created_at
) on table public.agreement_signatures to authenticated;

create function public.void_requests_without_standing(
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
    and not public.signer_has_standing(
      q.signer_account_id, q.organization_id, q.client_id, q.training_record_id, q.slot
    );
$$;

create function public.void_requests_of_departed_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.void_requests_without_standing(old.user_id, null, old.client_id);
  return null;
end;
$$;

create trigger client_participants_void_requests
  after update of revoked_at or delete on public.client_participants
  for each row
  when (old.revoked_at is null)
  execute function public.void_requests_of_departed_participant();

create function public.void_requests_of_departed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.void_requests_without_standing(old.user_id, old.organization_id, null);
  return null;
end;
$$;

create trigger organization_members_void_requests
  after delete on public.organization_members
  for each row execute function public.void_requests_of_departed_member();

-- Before the update, while the client is not archived yet and its requests may still change;
-- named to fire before clients_protect_archiving.
create function public.void_requests_of_archived_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.signature_requests q
  set state = 'void', voided_at = now(), void_reason = 'archived'
  where q.client_id = new.id and q.state = 'pending';
  return new;
end;
$$;

create trigger clients_archiving_voids_signature_requests
  before update of archived_at on public.clients
  for each row
  when (old.archived_at is null and new.archived_at is not null)
  execute function public.void_requests_of_archived_client();

-- A record from paper is printed on its sheet as text, which cannot change once the sheet is
-- certified.

create function public.training_record_is_printed(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.signed_sheet_rows w
    join public.signed_sheets s on s.id = w.signed_sheet_id
    join public.training_records r on r.id = w.training_record_id
    join public.trainings t on t.id = r.training_id
    where w.training_record_id = p_record_id
      and w.voided_at is null
      and s.certified_at is not null
      and t.source = 'paper'
  );
$$;

-- A row on a sheet is kept like a signature: the delete names it rather than fail on the key.
create or replace function public.freeze_signed_training()
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
    ) or exists (
      select 1 from public.training_records r
      join public.signed_sheet_rows w on w.training_record_id = r.id
      where r.training_id = old.id
    ) then
      raise exception 'record_has_signatures' using errcode = 'SIG01';
    end if;
    return old;
  end if;
  if exists (
    select 1 from public.training_records r
    where r.training_id = old.id
      and (public.training_record_is_signed(r.id) or public.training_record_is_printed(r.id))
  ) then
    raise exception 'record_signed' using errcode = 'SIG01';
  end if;
  return new;
end;
$$;

create or replace function public.freeze_signed_training_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.training_signatures s where s.training_record_id = old.id)
      or exists (select 1 from public.signed_sheet_rows w where w.training_record_id = old.id)
    then
      raise exception 'record_has_signatures' using errcode = 'SIG01';
    end if;
    return old;
  end if;
  if public.training_record_is_signed(old.id) or public.training_record_is_printed(old.id) then
    raise exception 'record_signed' using errcode = 'SIG01';
  end if;
  return new;
end;
$$;

drop trigger trainings_freeze_signed on public.trainings;
drop trigger trainings_void_pending_requests on public.trainings;
drop trigger training_records_freeze_signed on public.training_records;
drop trigger training_records_void_pending_requests on public.training_records;

create trigger trainings_freeze_signed
  before update on public.trainings
  for each row
  when ((
    old.domain, old.phase, old.held_on, old.duration_minutes, old.material, old.trainer_name,
    old.trainer_job_title, old.verifier_name, old.verifier_job_title, old.supplementary_reason,
    old.source
  ) is distinct from (
    new.domain, new.phase, new.held_on, new.duration_minutes, new.material, new.trainer_name,
    new.trainer_job_title, new.verifier_name, new.verifier_job_title, new.supplementary_reason,
    new.source
  ))
  execute function public.freeze_signed_training();
create trigger trainings_void_pending_requests
  after update on public.trainings
  for each row
  when ((
    old.domain, old.phase, old.held_on, old.duration_minutes, old.material, old.trainer_name,
    old.trainer_job_title, old.verifier_name, old.verifier_job_title, old.supplementary_reason,
    old.source
  ) is distinct from (
    new.domain, new.phase, new.held_on, new.duration_minutes, new.material, new.trainer_name,
    new.trainer_job_title, new.verifier_name, new.verifier_job_title, new.supplementary_reason,
    new.source
  ))
  execute function public.void_requests_of_changed_training();

create trigger training_records_freeze_signed
  before update on public.training_records
  for each row
  when ((
    old.occupation, old.admitted_on, old.admitted_by_name, old.admitted_by_job_title,
    old.employee_id, old.training_id, old.client_id
  ) is distinct from (
    new.occupation, new.admitted_on, new.admitted_by_name, new.admitted_by_job_title,
    new.employee_id, new.training_id, new.client_id
  ))
  execute function public.freeze_signed_training_record();
create trigger training_records_void_pending_requests
  after update on public.training_records
  for each row
  when ((
    old.occupation, old.admitted_on, old.admitted_by_name, old.admitted_by_job_title,
    old.employee_id, old.training_id, old.client_id
  ) is distinct from (
    new.occupation, new.admitted_on, new.admitted_by_name, new.admitted_by_job_title,
    new.employee_id, new.training_id, new.client_id
  ))
  execute function public.void_requests_of_changed_training_record();

create unique index signed_sheets_id_client_key on public.signed_sheets (id, client_id);

alter table public.signed_sheet_rows add column client_id uuid;
update public.signed_sheet_rows w set client_id = s.client_id
from public.signed_sheets s where s.id = w.signed_sheet_id;
alter table public.signed_sheet_rows
  alter column client_id set not null,
  drop constraint signed_sheet_rows_signed_sheet_id_fkey,
  drop constraint signed_sheet_rows_training_record_id_fkey,
  add constraint signed_sheet_rows_sheet_of_client
    foreign key (signed_sheet_id, client_id) references public.signed_sheets (id, client_id)
    on delete restrict,
  add constraint signed_sheet_rows_record_of_client
    foreign key (training_record_id, client_id) references public.training_records (id, client_id)
    on delete restrict,
  -- SHA-256 of the values last filled into the row's fields, for the API to tell a row that a
  -- failed fill left behind its record.
  add column filled_digest text
    constraint signed_sheet_rows_filled_digest_format check (filled_digest ~ '^[0-9a-f]{64}$'),
  -- A record from paper that the sheet printed as text when it was drawn up: the row has no fields
  -- to fill, and its note says it was signed on paper.
  add column printed_as_text boolean not null default false,
  -- When "anulat" was written into the voided row's note on the PDF.
  add column void_noted_at timestamptz,
  add constraint signed_sheet_rows_noted_when_void check (void_noted_at is null or voided_at is not null),
  add constraint signed_sheet_rows_text_unfilled check (not printed_as_text or filled_digest is null);

create function public.check_signed_sheet_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.signed_sheets s
    join public.training_records r on r.employee_id = s.employee_id
    join public.trainings t on t.id = r.training_id and t.domain = s.domain
    where s.id = new.signed_sheet_id and r.id = new.training_record_id
  ) then
    raise exception 'row_not_of_sheet' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger signed_sheet_rows_check
  before insert or update of signed_sheet_id, training_record_id, client_id on public.signed_sheet_rows
  for each row execute function public.check_signed_sheet_row();

-- The identities are a history: a reissue supersedes the account's identity and inserts the new
-- one, so the certificate an old signature names stays readable.

alter table public.signing_identities
  drop constraint signing_identities_account_id_key,
  add column superseded_at timestamptz;

create unique index signing_identities_live_account_key
  on public.signing_identities (account_id) where superseded_at is null;
create index signing_identities_account_id_idx on public.signing_identities (account_id);

create function public.protect_signing_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from auth.users u where u.id = old.account_id) then
      raise exception 'identity_kept' using errcode = 'SIG06';
    end if;
    return old;
  end if;
  if old.superseded_at is null
    and new.superseded_at is not null
    and to_jsonb(new) - 'superseded_at' = to_jsonb(old) - 'superseded_at'
  then
    return new;
  end if;
  raise exception 'identity_kept' using errcode = 'SIG06';
end;
$$;

create trigger signing_identities_insert_only
  before update or delete on public.signing_identities
  for each row execute function public.protect_signing_identity();

create index training_signatures_training_record_id_idx on public.training_signatures (training_record_id);
create index training_signatures_signing_session_id_idx on public.training_signatures (signing_session_id);
create index signed_sheet_rows_training_record_id_idx on public.signed_sheet_rows (training_record_id);
create index signed_sheet_rows_client_id_idx on public.signed_sheet_rows (client_id);
create index signature_requests_training_record_id_idx on public.signature_requests (training_record_id);
create index signature_requests_signer_account_id_idx on public.signature_requests (signer_account_id);
create index signature_requests_signing_session_id_idx on public.signature_requests (signing_session_id);

-- Members issue a request by naming its slot and signer; the rest is the defaults' and the API's.
revoke insert on table public.signature_requests from authenticated;
grant insert (organization_id, client_id, training_record_id, slot, signer_account_id)
  on table public.signature_requests to authenticated;

-- A save's requests in one transaction: a pending request that gives way to another signer, or
-- to the pen, is voided only together with the insert that replaces it, which the one live
-- request per slot would otherwise refuse before the void. Each element is
-- { training_record_id, slot, signer_account_id (null: none), replaces (a pending request's id
-- or null), reason (the replaced request's void reason) }.
create function public.issue_signature_requests(p_requests jsonb)
returns table (id uuid, training_record_id uuid, slot public.signer_slot, signer_account_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  item jsonb;
  record public.training_records;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;
  for item in select value from jsonb_array_elements(p_requests) loop
    select * into record from public.training_records r
    where r.id = (item ->> 'training_record_id')::uuid and r.organization_id = organization;
    if not found then
      raise exception 'record_not_found' using errcode = 'P0002';
    end if;
    if item ->> 'replaces' is not null then
      update public.signature_requests q
      set state = 'void', voided_at = now(), void_reason = item ->> 'reason'
      where q.id = (item ->> 'replaces')::uuid
        and q.training_record_id = record.id
        and q.slot = (item ->> 'slot')::public.signer_slot
        and q.state = 'pending';
    end if;
    if item ->> 'signer_account_id' is not null then
      return query
      insert into public.signature_requests as q (
        organization_id, client_id, training_record_id, slot, signer_account_id, issued_by
      )
      values (
        record.organization_id, record.client_id, record.id,
        (item ->> 'slot')::public.signer_slot, (item ->> 'signer_account_id')::uuid, auth.uid()
      )
      returning q.id, q.training_record_id, q.slot, q.signer_account_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.issue_signature_requests(jsonb) from public, anon;
grant execute on function public.issue_signature_requests(jsonb) to authenticated, service_role;

revoke all on function public.signer_has_standing(uuid, uuid, uuid, uuid, public.signer_slot) from public, anon, authenticated;
revoke all on function public.stamp_signature_request_void() from public, anon, authenticated;
revoke all on function public.protect_signing_session() from public, anon, authenticated;
revoke all on function public.create_signing_session(uuid, uuid, text, text, text, text, integer, integer, uuid, inet, text) from public, anon, authenticated;
revoke all on function public.settle_signature_request() from public, anon, authenticated;
revoke all on function public.stamp_signing_agreement_member() from public, anon, authenticated;
revoke all on function public.keep_recorded_signing_agreement() from public, anon, authenticated;
revoke all on function public.void_trainee_requests_of_withdrawn_agreement() from public, anon, authenticated;
revoke all on function public.check_agreement_signature() from public, anon, authenticated;
revoke all on function public.settle_signing_agreement() from public, anon, authenticated;
revoke all on function public.void_requests_without_standing(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.void_requests_of_departed_participant() from public, anon, authenticated;
revoke all on function public.void_requests_of_departed_member() from public, anon, authenticated;
revoke all on function public.void_requests_of_archived_client() from public, anon, authenticated;
revoke all on function public.training_record_is_printed(uuid) from public, anon, authenticated;
revoke all on function public.check_signed_sheet_row() from public, anon, authenticated;
revoke all on function public.protect_signing_identity() from public, anon, authenticated;
grant execute on function public.create_signing_session(uuid, uuid, text, text, text, text, integer, integer, uuid, inet, text) to service_role;
