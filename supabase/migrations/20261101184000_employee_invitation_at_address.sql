-- An employee invited at once with the others of an import (ADR 032), at an address typed for
-- them: the address is saved to their row and the invitation created in one transaction, so an
-- invitation the database refuses leaves the row as it was. Security invoker: the row is saved as
-- a member editing the employee saves it.
create function public.create_employee_invitation_at_address(
  p_client_id uuid,
  p_employee_id uuid,
  p_channel text,
  p_address text
)
returns public.participant_invitations
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_channel = 'email' then
    update public.employees e
    set email = btrim(p_address)
    where e.id = p_employee_id
      and e.client_id = p_client_id
      and e.archived_at is null
      and lower(btrim(e.email)) is distinct from lower(btrim(p_address));
  elsif p_channel = 'sms' then
    update public.employees e
    set phone = btrim(p_address)
    where e.id = p_employee_id
      and e.client_id = p_client_id
      and e.archived_at is null
      and e.phone is distinct from btrim(p_address);
  end if;

  return public.create_participant_invitation(
    p_client_id, 'employee', p_employee_id, null, p_channel, p_address
  );
end;
$$;
