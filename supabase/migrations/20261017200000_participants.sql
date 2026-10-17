-- Participants (ADR 022). A participant has no membership, so `current_organization_id()` is
-- null for them and the members' policies yield nothing; they read through policies of their
-- own. An invitation holds no token: a code received at its address is what accepts it.

-- Romania is the default country, as in the contract's normalization. There are no real
-- clients yet, so a number that cannot be read is dropped rather than kept as typed.
update public.employees e
set phone = normalized.phone
from (
  select
    id,
    case
      when candidate ~ '^\+400[0-9]{9}$' then '+40' || substr(candidate, 5)
      else candidate
    end as phone
  from (
    select
      id,
      case
        when digits ~ '^\+' then digits
        when digits ~ '^00' then '+' || substr(digits, 3)
        when digits ~ '^0' then '+40' || substr(digits, 2)
      end as candidate
    from (
      select id, regexp_replace(phone, '[[:space:].()-]', '', 'g') as digits
      from public.employees
      where phone is not null
    ) as stripped
  ) as prefixed
) as normalized
where e.id = normalized.id
  and e.phone is distinct from normalized.phone;

update public.employees
set phone = null
where phone !~ '^\+[1-9][0-9]{7,14}$'
   or (phone ~ '^\+40' and phone !~ '^\+40[0-9]{9}$');

alter table public.employees
  drop constraint employees_phone_length,
  add constraint employees_phone_e164 check (phone ~ '^\+[1-9][0-9]{7,14}$');

comment on column public.employees.phone is
  'E.164, normalized by the contract with Romania as the default country (ADR 022).';

create type public.participant_kind as enum ('employee', 'client_administrator');

create table public.client_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  kind public.participant_kind not null,
  -- An administrator who is also an employee of the client has the employee here too, and
  -- reads their own records as an employee does.
  employee_id uuid,
  -- Only for a person who is not an employee: an employee's name is read from their row.
  full_name text
    constraint client_participants_full_name_trimmed check (full_name = btrim(full_name))
    constraint client_participants_full_name_length check (char_length(full_name) between 2 and 160),
  user_id uuid not null references auth.users (id) on delete cascade,
  revoked_at timestamptz,
  -- The privacy notice shown on the first page after sign-in, like the terms on a profile.
  notice_version text
    constraint client_participants_notice_version_length check (char_length(notice_version) between 1 and 40),
  notice_shown_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_participants_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint client_participants_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint client_participants_employee_kind_has_employee
    check (kind <> 'employee' or employee_id is not null),
  constraint client_participants_named_once check ((employee_id is null) = (full_name is not null)),
  constraint client_participants_notice_recorded_together
    check ((notice_version is null) = (notice_shown_at is null))
);

comment on table public.client_participants is
  'A person of a client who signs in to the portal: an employee or the client administrator (ADR 022). Revoked rows stay.';

-- Unique among active rows only: a revoked participant keeps their row, which the signatures
-- of ADR 023 will point at, and the same person may be invited again.
create unique index client_participants_client_user_key
  on public.client_participants (client_id, user_id) where revoked_at is null;
create unique index client_participants_client_employee_key
  on public.client_participants (client_id, employee_id)
  where employee_id is not null and revoked_at is null;
create index client_participants_user_id_idx on public.client_participants (user_id);
create index client_participants_organization_id_idx on public.client_participants (organization_id);
create index client_participants_employee_id_idx on public.client_participants (employee_id);

create table public.participant_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  kind public.participant_kind not null,
  employee_id uuid,
  full_name text
    constraint participant_invitations_full_name_trimmed check (full_name = btrim(full_name))
    constraint participant_invitations_full_name_length check (char_length(full_name) between 2 and 160),
  channel text not null constraint participant_invitations_channel_valid check (channel in ('email', 'sms')),
  address text not null,
  -- The real user behind the request, also during an impersonation.
  invited_by uuid references auth.users (id) on delete set null,
  -- When the functions last let the API send the message: at creation, renewal and resend.
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  participant_id uuid references public.client_participants (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_invitations_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint participant_invitations_employee_of_client
    foreign key (employee_id, client_id) references public.employees (id, client_id) on delete restrict,
  constraint participant_invitations_employee_kind_has_employee
    check (kind <> 'employee' or employee_id is not null),
  constraint participant_invitations_named_once check ((employee_id is null) = (full_name is not null)),
  constraint participant_invitations_address_of_channel check (
    case channel
      when 'email' then address = lower(btrim(address))
        and char_length(address) between 3 and 254
        and address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      else address ~ '^\+[1-9][0-9]{7,14}$'
    end
  ),
  constraint participant_invitations_one_outcome check (accepted_at is null or revoked_at is null),
  constraint participant_invitations_accepted_with_participant
    check ((accepted_at is null) = (participant_id is null))
);

comment on table public.participant_invitations is
  'A member''s invitation of a participant at one address, email or phone (ADR 022). No token: a code sent to the address accepts it. Status is derived: open, expired, accepted, or revoked.';

-- One open invitation per address at a client. Expiry cannot be part of the predicate, so
-- inviting an address again renews its open row instead of adding one.
create unique index participant_invitations_open_key
  on public.participant_invitations (client_id, address)
  where accepted_at is null and revoked_at is null;
create index participant_invitations_open_address_idx
  on public.participant_invitations (address)
  where accepted_at is null and revoked_at is null;
create index participant_invitations_client_idx
  on public.participant_invitations (client_id, created_at desc);
create index participant_invitations_organization_id_idx
  on public.participant_invitations (organization_id);
create index participant_invitations_employee_id_idx
  on public.participant_invitations (employee_id);

create trigger client_participants_set_updated_at before update on public.client_participants
  for each row execute function public.set_updated_at();
create trigger participant_invitations_set_updated_at before update on public.participant_invitations
  for each row execute function public.set_updated_at();

-- Insert only: revoking a participant or an invitation of an archived client stays possible.
create trigger client_participants_protect_archived_client
  before insert on public.client_participants
  for each row execute function public.protect_rows_of_archived_client();
create trigger participant_invitations_protect_archived_client
  before insert on public.participant_invitations
  for each row execute function public.protect_rows_of_archived_client();
create trigger client_participants_protect_lead before insert on public.client_participants
  for each row execute function public.protect_rows_of_lead();
create trigger participant_invitations_protect_lead before insert on public.participant_invitations
  for each row execute function public.protect_rows_of_lead();

-- Arrays, read once per query as `col = any ((select …)::uuid[])`: an index serves that
-- comparison, where a function called per row would not, and the members' policies OR with
-- these. The real signed-in user, never an impersonated one: impersonation is for members.
create function public.participant_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.client_id), '{}')
  from public.client_participants p
  where p.user_id = auth.uid() and p.revoked_at is null;
$$;

create function public.participant_employee_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.employee_id), '{}')
  from public.client_participants p
  where p.user_id = auth.uid() and p.revoked_at is null and p.employee_id is not null;
$$;

create function public.administered_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.client_id), '{}')
  from public.client_participants p
  where p.user_id = auth.uid() and p.revoked_at is null and p.kind = 'client_administrator';
$$;

create function public.is_client_administrator(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_participants p
    where p.user_id = auth.uid()
      and p.client_id = p_client_id
      and p.revoked_at is null
      and p.kind = 'client_administrator'
  );
$$;

-- Errors the API translates, raised with these SQLSTATEs:
--   42501  the caller is not a member of an organization
--   P0002  the client, the employee or the invitation is not the caller's; the message names it
--   CLA01  the client is archived
--   CLL01  the client is still a lead
--   PRT01  the employee already has an active participant
--   PRT02  the employee has an open invitation at another address
--   PRT03  the address is invited for another person, or belongs to an active participant
--   PRT04  the request does not hold together; the message is employee_required,
--          full_name_required, invalid_address or address_not_of_employee
--   PRT05  the message was sent less than 10 minutes ago
--   PRT06  the invitation is not open; the message is accepted or revoked

-- An expired invitation of the same employee at another address is revoked, since the new one
-- replaces it; an open one there is refused.
create function public.check_participant_invitation(
  p_client_id uuid,
  p_employee_id uuid,
  p_address text,
  p_except_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_employee_id is null then
    return;
  end if;
  if exists (
    select 1 from public.client_participants p
    where p.client_id = p_client_id and p.employee_id = p_employee_id and p.revoked_at is null
  ) then
    raise exception 'employee_has_participant' using errcode = 'PRT01';
  end if;
  if exists (
    select 1 from public.participant_invitations i
    where i.client_id = p_client_id
      and i.employee_id = p_employee_id
      and i.address <> p_address
      and i.id is distinct from p_except_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  ) then
    raise exception 'employee_already_invited' using errcode = 'PRT02';
  end if;
  update public.participant_invitations i
  set revoked_at = now()
  where i.client_id = p_client_id
    and i.employee_id = p_employee_id
    and i.address <> p_address
    and i.id is distinct from p_except_id
    and i.accepted_at is null
    and i.revoked_at is null;
end;
$$;

-- Every member invites, not only owners (ADR 022). For an employee the address is their own
-- email or phone, as their row holds it; an administrator's is typed. Inviting the same person
-- at the same address again renews the open row and counts as a resend.
create function public.create_participant_invitation(
  p_client_id uuid,
  p_kind public.participant_kind,
  p_employee_id uuid,
  p_full_name text,
  p_channel text,
  p_address text
)
returns public.participant_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  client public.clients;
  employee public.employees;
  invitee_address text;
  invitee_name text := nullif(btrim(p_full_name), '');
  existing public.participant_invitations;
  saved public.participant_invitations;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  select * into client from public.clients c
  where c.id = p_client_id and c.organization_id = organization;
  if not found then
    raise exception 'client_not_found' using errcode = 'P0002';
  elsif client.archived_at is not null then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  elsif client.stage = 'lead' then
    raise exception 'A lead has no safety records; promote it first.' using errcode = 'CLL01';
  end if;

  if p_channel = 'email' then
    invitee_address := lower(btrim(p_address));
    if invitee_address is null
      or char_length(invitee_address) not between 3 and 254
      or invitee_address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'invalid_address' using errcode = 'PRT04';
    end if;
  elsif p_channel = 'sms' then
    invitee_address := btrim(p_address);
    if invitee_address is null or invitee_address !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'invalid_address' using errcode = 'PRT04';
    end if;
  else
    raise exception 'invalid_address' using errcode = 'PRT04';
  end if;

  if p_employee_id is not null then
    select * into employee from public.employees e
    where e.id = p_employee_id and e.client_id = p_client_id and e.archived_at is null;
    if not found then
      raise exception 'employee_not_found' using errcode = 'P0002';
    end if;
    invitee_name := null;
    if p_kind = 'employee' and invitee_address is distinct from (
      case p_channel when 'email' then lower(btrim(employee.email)) else employee.phone end
    ) then
      raise exception 'address_not_of_employee' using errcode = 'PRT04';
    end if;
  elsif p_kind = 'employee' then
    raise exception 'employee_required' using errcode = 'PRT04';
  elsif invitee_name is null then
    raise exception 'full_name_required' using errcode = 'PRT04';
  end if;

  perform public.check_participant_invitation(p_client_id, p_employee_id, invitee_address, null);

  if exists (
    select 1
    from public.participant_invitations i
    join public.client_participants p on p.id = i.participant_id
    where i.client_id = p_client_id and i.address = invitee_address and p.revoked_at is null
  ) then
    raise exception 'address_has_participant' using errcode = 'PRT03';
  end if;

  select * into existing from public.participant_invitations i
  where i.client_id = p_client_id
    and i.address = invitee_address
    and i.accepted_at is null
    and i.revoked_at is null
  for update;

  if found and (
    existing.employee_id is distinct from p_employee_id
    or (p_employee_id is null and lower(existing.full_name) <> lower(invitee_name))
  ) then
    if existing.expires_at > now() then
      raise exception 'address_invited_for_another_person' using errcode = 'PRT03';
    end if;
    update public.participant_invitations i set revoked_at = now() where i.id = existing.id;
    existing := null;
  end if;

  if existing.id is not null then
    if existing.last_sent_at > now() - interval '10 minutes' then
      raise exception 'resend_too_soon' using errcode = 'PRT05';
    end if;
    update public.participant_invitations i
    set kind = p_kind,
        full_name = invitee_name,
        invited_by = auth.uid(),
        last_sent_at = now(),
        expires_at = now() + interval '30 days',
        created_at = now()
    where i.id = existing.id
    returning * into saved;
  else
    insert into public.participant_invitations (
      organization_id, client_id, kind, employee_id, full_name, channel, address, invited_by
    )
    values (
      organization, p_client_id, p_kind, p_employee_id, invitee_name, p_channel, invitee_address,
      auth.uid()
    )
    returning * into saved;
  end if;

  return saved;
end;
$$;

create function public.resend_participant_invitation(p_invitation_id uuid)
returns public.participant_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  invitation public.participant_invitations;
  saved public.participant_invitations;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  select * into invitation from public.participant_invitations i
  where i.id = p_invitation_id and i.organization_id = organization
  for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  elsif invitation.accepted_at is not null then
    raise exception 'accepted' using errcode = 'PRT06';
  elsif invitation.revoked_at is not null then
    raise exception 'revoked' using errcode = 'PRT06';
  elsif exists (
    select 1 from public.clients c where c.id = invitation.client_id and c.archived_at is not null
  ) then
    raise exception 'An archived client is not changed.' using errcode = 'CLA01';
  end if;

  perform public.check_participant_invitation(
    invitation.client_id, invitation.employee_id, invitation.address, invitation.id
  );

  if invitation.last_sent_at > now() - interval '10 minutes' then
    raise exception 'resend_too_soon' using errcode = 'PRT05';
  end if;

  update public.participant_invitations i
  set last_sent_at = now(),
      expires_at = now() + interval '30 days'
  where i.id = invitation.id
  returning * into saved;

  return saved;
end;
$$;

-- True when an open invitation of the caller's organization was revoked.
create function public.revoke_participant_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  revoked uuid;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  update public.participant_invitations i
  set revoked_at = now()
  where i.id = p_invitation_id
    and i.organization_id = organization
    and i.accepted_at is null
    and i.revoked_at is null
  returning i.id into revoked;

  return revoked is not null;
end;
$$;

-- True when an active participant of the caller's organization was revoked. Their rows stay,
-- as a leaver's training records do (ADR 021).
create function public.revoke_client_participant(p_participant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  revoked uuid;
begin
  if organization is null then
    raise exception 'not_member' using errcode = '42501';
  end if;

  update public.client_participants p
  set revoked_at = now()
  where p.id = p_participant_id
    and p.organization_id = organization
    and p.revoked_at is null
  returning p.id into revoked;

  return revoked is not null;
end;
$$;

-- Called on every portal sign-in, so it must be idempotent. Only a confirmed address counts:
-- the API creates the account unconfirmed when it sends the invitation, and the first code the
-- person types confirms it. An invitation the caller cannot take, at an archived client or for
-- a person who is already a participant there, stays open.
create function public.accept_participant_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  confirmed_email text;
  confirmed_phone text;
  invitation public.participant_invitations;
  participant uuid;
  accepted integer := 0;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- Auth stores a phone without its plus sign.
  select
    case when u.email_confirmed_at is not null then lower(u.email) end,
    case when u.phone_confirmed_at is not null and u.phone <> '' then
      case when u.phone like '+%' then u.phone else '+' || u.phone end
    end
  into confirmed_email, confirmed_phone
  from auth.users u
  where u.id = caller;

  for invitation in
    select i.*
    from public.participant_invitations i
    join public.clients c on c.id = i.client_id
    where i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
      and c.archived_at is null
      and (
        (i.channel = 'email' and i.address = confirmed_email)
        or (i.channel = 'sms' and i.address = confirmed_phone)
      )
    order by i.created_at
    for update of i
  loop
    continue when exists (
      select 1 from public.client_participants p
      where p.client_id = invitation.client_id
        and p.revoked_at is null
        and (p.user_id = caller or p.employee_id = invitation.employee_id)
    );

    insert into public.client_participants (
      organization_id, client_id, kind, employee_id, full_name, user_id
    )
    values (
      invitation.organization_id, invitation.client_id, invitation.kind, invitation.employee_id,
      invitation.full_name, caller
    )
    returning id into participant;

    update public.participant_invitations i
    set accepted_at = now(), participant_id = participant
    where i.id = invitation.id;

    accepted := accepted + 1;
  end loop;

  return accepted;
end;
$$;

-- An employee's name is read from their row, so a correction there shows at once.
create function public.current_participations()
returns table (
  participant_id uuid,
  organization_id uuid,
  organization_name text,
  client_id uuid,
  client_name text,
  kind public.participant_kind,
  employee_id uuid,
  full_name text,
  notice_version text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.organization_id,
    o.name,
    p.client_id,
    c.legal_name,
    p.kind,
    p.employee_id,
    coalesce(e.last_name || ' ' || e.first_name, p.full_name),
    p.notice_version
  from public.client_participants p
  join public.organizations o on o.id = p.organization_id
  join public.clients c on c.id = p.client_id
  left join public.employees e on e.id = p.employee_id
  where p.user_id = auth.uid() and p.revoked_at is null
  order by c.legal_name, p.created_at;
$$;

-- True when the caller's own active participation recorded the notice.
create function public.record_participant_notice(p_participant_id uuid, p_version text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded uuid;
begin
  update public.client_participants p
  set notice_version = p_version, notice_shown_at = now()
  where p.id = p_participant_id
    and p.user_id = auth.uid()
    and p.revoked_at is null
  returning p.id into recorded;

  return recorded is not null;
end;
$$;

revoke all on function public.participant_client_ids() from public, anon;
revoke all on function public.participant_employee_ids() from public, anon;
revoke all on function public.administered_client_ids() from public, anon;
revoke all on function public.is_client_administrator(uuid) from public, anon;
revoke all on function public.check_participant_invitation(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.create_participant_invitation(uuid, public.participant_kind, uuid, text, text, text) from public, anon;
revoke all on function public.resend_participant_invitation(uuid) from public, anon;
revoke all on function public.revoke_participant_invitation(uuid) from public, anon;
revoke all on function public.revoke_client_participant(uuid) from public, anon;
revoke all on function public.accept_participant_invitations() from public, anon;
revoke all on function public.current_participations() from public, anon;
revoke all on function public.record_participant_notice(uuid, text) from public, anon;
grant execute on function public.participant_client_ids() to authenticated, service_role;
grant execute on function public.participant_employee_ids() to authenticated, service_role;
grant execute on function public.administered_client_ids() to authenticated, service_role;
grant execute on function public.is_client_administrator(uuid) to authenticated, service_role;
grant execute on function public.create_participant_invitation(uuid, public.participant_kind, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.resend_participant_invitation(uuid) to authenticated, service_role;
grant execute on function public.revoke_participant_invitation(uuid) to authenticated, service_role;
grant execute on function public.revoke_client_participant(uuid) to authenticated, service_role;
grant execute on function public.accept_participant_invitations() to authenticated, service_role;
grant execute on function public.current_participations() to authenticated, service_role;
grant execute on function public.record_participant_notice(uuid, text) to authenticated, service_role;

alter table public.client_participants enable row level security;
alter table public.participant_invitations enable row level security;
revoke all on table public.client_participants from anon;
revoke all on table public.participant_invitations from anon;

-- Members and participants write through the functions above only.
revoke insert, update, delete, truncate on table public.client_participants from authenticated;
revoke insert, update, delete, truncate on table public.participant_invitations from authenticated;

create policy "members read their client participants"
  on public.client_participants for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their participations"
  on public.client_participants for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members read their participant invitations"
  on public.participant_invitations for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "participants read their clients"
  on public.clients for select to authenticated
  using (id = any ((select public.participant_client_ids())::uuid[]));

-- The provider's name and the facts the sheets print.
create policy "participants read their clients' organizations"
  on public.organizations for select to authenticated
  using (
    id in (
      select c.organization_id from public.clients c
      where c.id = any ((select public.participant_client_ids())::uuid[])
    )
  );

create policy "participants read their own employee row"
  on public.employees for select to authenticated
  using (id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's employees"
  on public.employees for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

create policy "participants read their own training records"
  on public.training_records for select to authenticated
  using (employee_id = any ((select public.participant_employee_ids())::uuid[]));

create policy "client administrators read their client's training records"
  on public.training_records for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

-- The cardinality guard spares members the subquery on every row.
create policy "participants read the trainings they attended"
  on public.trainings for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and exists (
      select 1 from public.training_records r
      where r.training_id = trainings.id
        and r.employee_id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "client administrators read their client's trainings"
  on public.trainings for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

create policy "participants read their own job position"
  on public.job_positions for select to authenticated
  using (
    cardinality((select public.participant_employee_ids())) > 0
    and id in (
      select e.job_position_id from public.employees e
      where e.id = any ((select public.participant_employee_ids())::uuid[])
    )
  );

create policy "client administrators read their client's job positions"
  on public.job_positions for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

-- Every workplace of the client, not only the participant's own: a sheet names the workplace
-- only at a client with more than one, and counting them needs the others.
create policy "participants read their clients' workplaces"
  on public.client_workplaces for select to authenticated
  using (client_id = any ((select public.participant_client_ids())::uuid[]));

-- The fire-safety training intervals, which the training state reads.
create policy "participants read their clients' fire safety"
  on public.client_fire_safety for select to authenticated
  using (client_id = any ((select public.participant_client_ids())::uuid[]));

create policy "client administrators read their client's responsible persons"
  on public.client_responsible_persons for select to authenticated
  using (client_id = any ((select public.administered_client_ids())::uuid[]));

-- The individual training sheets' templates, drawn up on demand for a participant. Their
-- versions follow through the policy on document_template_versions.
create policy "participants read the training sheet templates"
  on public.document_templates for select to authenticated
  using (
    organization_id is null
    and type_key in ('training_sheet_ssm', 'training_sheet_psi')
    and cardinality((select public.participant_client_ids())) > 0
  );
