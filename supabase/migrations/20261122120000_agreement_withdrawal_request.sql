-- The withdrawal still takes effect when a member registers it (ADR 023): the request's date is a
-- recorded fact only.

alter table public.employee_signing_agreements
  add column withdrawal_requested_on date,
  add column withdrawal_file_id uuid,
  add column withdrawn_at timestamptz,
  add constraint employee_signing_agreements_withdrawal_request_of_client
    foreign key (withdrawal_file_id, client_id) references public.client_files (id, client_id)
    on delete set null (withdrawal_file_id),
  add constraint employee_signing_agreements_withdrawal_when_withdrawn
    check (state = 'withdrawn' or (withdrawal_requested_on is null and withdrawal_file_id is null)),
  add constraint employee_signing_agreements_withdrawn_at_when_withdrawn
    check (state = 'withdrawn' or withdrawn_at is null);

create index employee_signing_agreements_withdrawal_file_id_idx
  on public.employee_signing_agreements (withdrawal_file_id)
  where withdrawal_file_id is not null;

comment on column public.employee_signing_agreements.withdrawal_requested_on is
  'The day of the employee''s written request to sign by hand again; null on agreements withdrawn before it was recorded.';
comment on column public.employee_signing_agreements.withdrawal_file_id is
  'The scan of that request, a file of the client.';
comment on column public.employee_signing_agreements.withdrawn_at is
  'When a member recorded the withdrawal, from which the employee signs by hand; null on agreements withdrawn before it was recorded.';

revoke insert on table public.employee_signing_agreements from authenticated;
grant insert (
  employee_id, organization_id, client_id, state, generated_at, signed_at, marked_by, client_file_id,
  withdrawal_requested_on, withdrawal_file_id
) on table public.employee_signing_agreements to authenticated;
revoke update on table public.employee_signing_agreements from authenticated;
grant update (
  state, generated_at, signed_at, marked_by, client_file_id, withdrawal_requested_on, withdrawal_file_id
) on table public.employee_signing_agreements to authenticated;

create or replace function public.stamp_signing_agreement_member()
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
    new.withdrawn_at := case when new.state = 'withdrawn' then now() end;
  else
    new.marked_by := old.marked_by;
    new.withdrawn_at := old.withdrawn_at;
  end if;
  return new;
end;
$$;

create or replace function public.protect_signing_agreement_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  -- Deleting a scan's file sets its link null through this trigger, as the member who deleted it,
  -- on an agreement that would otherwise refuse any change.
  if tg_op = 'UPDATE'
    and ((old.withdrawal_file_id is not null
        and new.withdrawal_file_id is null
        and to_jsonb(new) - array['withdrawal_file_id', 'updated_at']
          = to_jsonb(old) - array['withdrawal_file_id', 'updated_at']
        and not exists (select 1 from public.client_files f where f.id = old.withdrawal_file_id))
      or (old.client_file_id is not null
        and new.client_file_id is null
        and to_jsonb(new) - array['client_file_id', 'updated_at']
          = to_jsonb(old) - array['client_file_id', 'updated_at']
        and not exists (select 1 from public.client_files f where f.id = old.client_file_id)))
  then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.state = 'withdrawn' and new.state = 'withdrawn' then
    -- An agreement withdrawn before the request was recorded takes it once.
    if old.withdrawal_requested_on is null
      and new.withdrawal_requested_on is not null
      and to_jsonb(new) - array['withdrawal_requested_on', 'withdrawal_file_id', 'marked_by', 'updated_at']
        = to_jsonb(old) - array['withdrawal_requested_on', 'withdrawal_file_id', 'marked_by', 'updated_at']
    then
      return new;
    end if;
    -- What the agreement was when withdrawn, a paper signature included, is its record.
    if new.generated_at is distinct from old.generated_at
      or new.signed_at is distinct from old.signed_at
      or new.client_file_id is distinct from old.client_file_id
      or new.withdrawal_requested_on is distinct from old.withdrawal_requested_on
      or new.withdrawal_file_id is distinct from old.withdrawal_file_id
    then
      raise exception 'agreement_withdrawal_recorded' using errcode = 'SIG10';
    end if;
  end if;
  if tg_op = 'UPDATE'
    and new.state = 'withdrawn'
    and old.state <> 'withdrawn'
    and (old.state = 'signed_electronically' or old.employee_signed_at is not null)
  then
    -- On a signed agreement these are the record of the signature and stay.
    new.generated_at := old.generated_at;
    new.signed_at := old.signed_at;
    new.client_file_id := old.client_file_id;
    if to_jsonb(new) - array['state', 'marked_by', 'updated_at', 'withdrawal_requested_on', 'withdrawal_file_id']
      <> to_jsonb(old) - array['state', 'marked_by', 'updated_at', 'withdrawal_requested_on', 'withdrawal_file_id']
    then
      raise exception 'agreement_signed_electronically' using errcode = 'SIG07';
    end if;
    return new;
  end if;
  if (tg_op <> 'INSERT' and (
      old.state = 'signed_electronically'
      or old.employee_signed_at is not null
      or old.employer_signed_at is not null
    ) and (tg_op = 'DELETE' or to_jsonb(new) - 'updated_at' <> to_jsonb(old) - 'updated_at'))
    or (tg_op <> 'DELETE' and new.state = 'signed_electronically'
      and (tg_op = 'INSERT' or old.state <> 'signed_electronically'))
  then
    raise exception 'agreement_signed_electronically' using errcode = 'SIG07';
  end if;
  return coalesce(new, old);
end;
$$;
