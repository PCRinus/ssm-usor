-- Profiles and organization invitations (ADR 003).
--
-- A profile names a user; the email stays in auth.users. An invitation lets an owner
-- bring one person into their organization through a link sent by email.
--
-- Owners read invitations under row-level security and write them through the functions
-- below. Nobody signed in can write a token hash: a browser holds the same credentials as
-- the API's per-user client, so an owner able to write a hash could mint a link of their
-- own and create a confirmed account for someone else's address. The API sets the hash
-- with its secret key (service_role) once an invitation has been created or renewed.

-- Profiles ----------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    constraint profiles_full_name_trimmed check (full_name = btrim(full_name))
    constraint profiles_full_name_length check (char_length(full_name) between 2 and 120),
  -- The version of the terms shown when the person created their account; null for
  -- accounts that did not come through an invitation.
  terms_version text
    constraint profiles_terms_version_length check (char_length(terms_version) between 1 and 40),
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_terms_recorded_together check ((terms_version is null) = (terms_accepted_at is null))
);

comment on table public.profiles is 'What the app knows about a user besides the auth email: a name and the accepted terms.';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Invitations -------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Normalized by the API: trimmed and lowercased.
  email text not null
    constraint organization_invitations_email_normalized check (email = lower(btrim(email)))
    constraint organization_invitations_email_length check (char_length(email) between 3 and 254),
  role public.organization_role not null default 'specialist',
  -- The real user behind the request, also during an impersonation.
  invited_by uuid references auth.users (id) on delete set null,
  -- SHA-256 of the token in the emailed link; null until the API has set it.
  token_hash text
    constraint organization_invitations_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  -- When the latest invitation email was handed to the provider; null if none has been.
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_one_outcome check (accepted_at is null or revoked_at is null)
);

comment on table public.organization_invitations is 'An owner''s invitation for one email address. Status is derived: open, expired, accepted, or revoked.';

create unique index organization_invitations_token_hash_key
  on public.organization_invitations (token_hash);

-- One open invitation per address in an organization. Expiry cannot be part of the
-- predicate, so inviting an address again renews its open row instead of adding one.
create unique index organization_invitations_open_key
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index organization_invitations_organization_id_idx
  on public.organization_invitations (organization_id, created_at desc);

create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function public.set_updated_at();

-- Role helper -------------------------------------------------------------------------

create function public.is_organization_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.user_id = public.effective_user_id()
      and m.role = 'owner'
  );
$$;

comment on function public.is_organization_owner() is 'True when the effective user is an owner of their organization.';

-- Members -----------------------------------------------------------------------------

-- The members of the caller's organization with their names and emails. Emails live in
-- auth.users, which no signed-in user can read, hence security definer.
create function public.organization_member_list()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.organization_role,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where m.organization_id = public.current_organization_id();
$$;

-- Owner actions -----------------------------------------------------------------------

-- Errors the API translates, raised with these SQLSTATEs:
--   42501  the caller is not an owner
--   INV01  the address already belongs to a member of this organization
--   INV02  the organization has too many open invitations
--   INV03  the invitation is not open; the message is not_found, accepted, revoked, or expired
--   INV04  the invitation was sent to a different address than the account's
--   INV05  the account already belongs to an organization

create function public.create_organization_invitation(
  invitee_email text,
  invitee_role public.organization_role default 'specialist'
)
returns table (
  id uuid,
  email text,
  role public.organization_role,
  sent_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  invitation_id uuid;
begin
  if organization is null or not public.is_organization_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = organization
      and lower(u.email) = invitee_email
  ) then
    raise exception 'already_member' using errcode = 'INV01';
  end if;

  -- Renew the open invitation for this address, if there is one. The token hash stays
  -- until the API replaces it, so a throttled resend keeps the earlier link working.
  update public.organization_invitations i
  set role = invitee_role,
      invited_by = auth.uid(),
      expires_at = now() + interval '7 days'
  where i.organization_id = organization
    and i.email = invitee_email
    and i.accepted_at is null
    and i.revoked_at is null
  returning i.id into invitation_id;

  if invitation_id is null then
    if (
      select count(*)
      from public.organization_invitations i
      where i.organization_id = organization
        and i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > now()
    ) >= 20 then
      raise exception 'too_many_open_invitations' using errcode = 'INV02';
    end if;

    insert into public.organization_invitations (organization_id, email, role, invited_by)
    values (organization, invitee_email, invitee_role, auth.uid())
    returning organization_invitations.id into invitation_id;
  end if;

  return query
    select i.id, i.email, i.role, i.sent_at, i.expires_at, i.created_at
    from public.organization_invitations i
    where i.id = invitation_id;
end;
$$;

-- True when an open invitation of the caller's organization was revoked.
create function public.revoke_organization_invitation(invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid := public.current_organization_id();
  revoked uuid;
begin
  if organization is null or not public.is_organization_owner() then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  update public.organization_invitations i
  set revoked_at = now()
  where i.id = invitation_id
    and i.organization_id = organization
    and i.accepted_at is null
    and i.revoked_at is null
  returning i.id into revoked;

  return revoked is not null;
end;
$$;

-- Lookup and acceptance ---------------------------------------------------------------

-- What the accept page shows for a token. No rows for an unknown token.
create function public.organization_invitation_by_token(invitation_token_hash text)
returns table (
  organization_name text,
  email text,
  role public.organization_role,
  status text,
  inviter_name text,
  account_exists boolean,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    i.email,
    i.role,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      else 'open'
    end,
    p.full_name,
    exists (select 1 from auth.users u where lower(u.email) = i.email),
    i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.user_id = i.invited_by
  where i.token_hash = invitation_token_hash;
$$;

-- Shared by both accept paths: in one transaction, lock the invitation, check it, add
-- the membership and the profile, and mark it accepted. Not callable through the API.
create function public.accept_invitation_as(
  invitation_token_hash text,
  accepting_user_id uuid,
  new_full_name text,
  accepted_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  account_email text;
begin
  select * into invitation
  from public.organization_invitations i
  where i.token_hash = invitation_token_hash
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'INV03';
  elsif invitation.accepted_at is not null then
    raise exception 'accepted' using errcode = 'INV03';
  elsif invitation.revoked_at is not null then
    raise exception 'revoked' using errcode = 'INV03';
  elsif invitation.expires_at <= now() then
    raise exception 'expired' using errcode = 'INV03';
  end if;

  select lower(u.email) into account_email
  from auth.users u
  where u.id = accepting_user_id
    and u.email_confirmed_at is not null;

  if account_email is distinct from invitation.email then
    raise exception 'email_mismatch' using errcode = 'INV04';
  end if;

  -- One organization per user is the primary key's rule; only the error is translated.
  begin
    insert into public.organization_members (user_id, organization_id, role)
    values (accepting_user_id, invitation.organization_id, invitation.role);
  exception when unique_violation then
    raise exception 'already_in_organization' using errcode = 'INV05';
  end;

  if exists (select 1 from public.profiles p where p.user_id = accepting_user_id) then
    update public.profiles p
    set full_name = coalesce(new_full_name, p.full_name),
        terms_version = coalesce(accepted_terms_version, p.terms_version),
        terms_accepted_at = case when accepted_terms_version is null then p.terms_accepted_at else now() end
    where p.user_id = accepting_user_id;
  else
    insert into public.profiles (user_id, full_name, terms_version, terms_accepted_at)
    values (
      accepting_user_id,
      new_full_name,
      accepted_terms_version,
      case when accepted_terms_version is null then null else now() end
    );
  end if;

  update public.organization_invitations i
  set accepted_at = now(),
      accepted_by = accepting_user_id
  where i.id = invitation.id;

  return invitation.organization_id;
end;
$$;

-- For a person with an account and no membership, who signed in to accept. The real
-- user accepts, never an impersonated one.
create function public.accept_organization_invitation(
  invitation_token_hash text,
  new_full_name text default null,
  accepted_terms_version text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.accept_invitation_as(
    invitation_token_hash, auth.uid(), new_full_name, accepted_terms_version
  );
$$;

-- Grants ------------------------------------------------------------------------------

revoke all on function public.is_organization_owner() from public, anon;
revoke all on function public.organization_member_list() from public, anon;
revoke all on function public.create_organization_invitation(text, public.organization_role) from public, anon;
revoke all on function public.revoke_organization_invitation(uuid) from public, anon;
revoke all on function public.accept_organization_invitation(text, text, text) from public, anon;
grant execute on function public.is_organization_owner() to authenticated, service_role;
grant execute on function public.organization_member_list() to authenticated, service_role;
grant execute on function public.create_organization_invitation(text, public.organization_role) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;
grant execute on function public.accept_organization_invitation(text, text, text) to authenticated;

-- Reached only with the API's secret key.
revoke all on function public.organization_invitation_by_token(text) from public, anon, authenticated;
revoke all on function public.accept_invitation_as(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.organization_invitation_by_token(text) to service_role;
grant execute on function public.accept_invitation_as(text, uuid, text, text) to service_role;

-- Row-level security ------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organization_invitations enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.organization_invitations from anon;

-- A user names themselves; the terms columns are written by acceptance only.
revoke insert, update, delete, truncate on table public.profiles from authenticated;
grant insert (user_id, full_name), update (full_name) on table public.profiles to authenticated;

-- Owners read everything but the token hash, and write through the functions above.
revoke all on table public.organization_invitations from authenticated;
grant select (
  id, organization_id, email, role, invited_by, sent_at, expires_at,
  accepted_at, accepted_by, revoked_at, created_at, updated_at
) on table public.organization_invitations to authenticated;

create policy "users read their profile and their organization's"
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members m
      where m.user_id = profiles.user_id
        and m.organization_id = public.current_organization_id()
    )
  );

create policy "users create their profile"
  on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users update their profile"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "owners read their organization's invitations"
  on public.organization_invitations for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_organization_owner()
  );
