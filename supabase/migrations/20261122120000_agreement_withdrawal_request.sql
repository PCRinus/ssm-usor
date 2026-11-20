-- The withdrawal still takes effect when a member registers it (ADR 023): the request's date is a
-- recorded fact only.

alter table public.employee_signing_agreements
  add column withdrawal_requested_on date,
  add column withdrawal_file_id uuid,
  add constraint employee_signing_agreements_withdrawal_request_of_client
    foreign key (withdrawal_file_id, client_id) references public.client_files (id, client_id)
    on delete set null (withdrawal_file_id),
  add constraint employee_signing_agreements_withdrawal_when_withdrawn
    check (state = 'withdrawn' or (withdrawal_requested_on is null and withdrawal_file_id is null));

create index employee_signing_agreements_withdrawal_file_id_idx
  on public.employee_signing_agreements (withdrawal_file_id)
  where withdrawal_file_id is not null;

comment on column public.employee_signing_agreements.withdrawal_requested_on is
  'The day of the employee''s written request to sign by hand again; null on agreements withdrawn before it was recorded.';
comment on column public.employee_signing_agreements.withdrawal_file_id is
  'The scan of that request, a file of the client.';

revoke insert on table public.employee_signing_agreements from authenticated;
grant insert (
  employee_id, organization_id, client_id, state, generated_at, signed_at, marked_by, client_file_id,
  withdrawal_requested_on, withdrawal_file_id
) on table public.employee_signing_agreements to authenticated;
revoke update on table public.employee_signing_agreements from authenticated;
grant update (
  state, generated_at, signed_at, marked_by, client_file_id, withdrawal_requested_on, withdrawal_file_id
) on table public.employee_signing_agreements to authenticated;

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
  -- Deleting the scan's file sets the link null through this trigger, as the member who deleted it,
  -- on an agreement that would otherwise refuse any change.
  if tg_op = 'UPDATE'
    and old.withdrawal_file_id is not null
    and new.withdrawal_file_id is null
    and to_jsonb(new) - array['withdrawal_file_id', 'updated_at']
      = to_jsonb(old) - array['withdrawal_file_id', 'updated_at']
    and not exists (select 1 from public.client_files f where f.id = old.withdrawal_file_id)
  then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.state = 'withdrawn'
    and new.state = 'withdrawn'
    and (new.withdrawal_requested_on is distinct from old.withdrawal_requested_on
      or new.withdrawal_file_id is distinct from old.withdrawal_file_id)
  then
    raise exception 'agreement_withdrawal_recorded' using errcode = 'SIG10';
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
