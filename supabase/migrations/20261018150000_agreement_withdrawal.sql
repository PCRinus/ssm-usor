-- The agreement promises the employee a return to handwriting at any time (ADR 023), also after
-- signing it electronically; the evidence of that signature stays on the withdrawn agreement.

alter table public.employee_signing_agreements
  drop constraint employee_signing_agreements_signed_when_signed,
  add constraint employee_signing_agreements_signed_when_signed
    check (
      (state not in ('signed_electronically', 'signed_on_paper') or signed_at is not null)
      and (state not in ('generated', 'in_contract') or signed_at is null)
    ),
  drop constraint employee_signing_agreements_electronic_only_signed,
  add constraint employee_signing_agreements_electronic_only_signed
    check (
      state in ('generated', 'signed_electronically', 'withdrawn')
      or (employee_signed_at is null and employer_signed_at is null)
    ),
  drop constraint employee_signing_agreements_signed_by_employer,
  add constraint employee_signing_agreements_signed_by_employer
    check (
      (state <> 'signed_electronically' or employer_signed_at is not null)
      and (employer_signed_at is null or state in ('signed_electronically', 'withdrawn'))
    );

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
  if tg_op = 'UPDATE'
    and new.state = 'withdrawn'
    and old.state <> 'withdrawn'
    and (old.state = 'signed_electronically' or old.employee_signed_at is not null)
  then
    -- The API's request clears signed_at and the scan for any state but signed_on_paper; on a
    -- signed agreement they are the record of the signature and stay.
    new.generated_at := old.generated_at;
    new.signed_at := old.signed_at;
    new.client_file_id := old.client_file_id;
    if to_jsonb(new) - array['state', 'marked_by', 'updated_at']
      <> to_jsonb(old) - array['state', 'marked_by', 'updated_at']
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
