-- Self-service onboarding (ADR 004): an account without a membership creates its
-- organization and becomes its owner, accepting the terms on the organization's behalf.

-- Who accepted which version of the terms for the organization, and when. Null for
-- organizations created by the seed, which accepted nothing.
alter table public.organizations
  add column terms_version text
    constraint organizations_terms_version_length check (char_length(terms_version) between 1 and 40),
  add column terms_accepted_at timestamptz,
  add column terms_accepted_by uuid references auth.users (id) on delete set null,
  add constraint organizations_terms_recorded_together
    check ((terms_version is null) = (terms_accepted_at is null));

-- Errors the API translates:
--   42501  the caller's email is not confirmed
--   ORG01  the caller already belongs to an organization

-- Creates the organization with the caller as its owner, names the caller, and records
-- the acceptance, in one transaction. For the real signed-in user, never an impersonated
-- one: an organization is not something support creates on someone's behalf.
create function public.create_organization(
  organization_name text,
  owner_full_name text,
  accepted_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  organization uuid;
begin
  if caller is null or not exists (
    select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null
  ) then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  if exists (select 1 from public.organization_members m where m.user_id = caller) then
    raise exception 'already_in_organization' using errcode = 'ORG01';
  end if;

  insert into public.organizations (name, terms_version, terms_accepted_at, terms_accepted_by)
  values (btrim(organization_name), accepted_terms_version, now(), caller)
  returning id into organization;

  -- One organization per user is the primary key's rule. Two submissions at once both pass
  -- the check above; the second fails here and takes its organization row down with it.
  begin
    insert into public.organization_members (user_id, organization_id, role)
    values (caller, organization, 'owner');
  exception when unique_violation then
    raise exception 'already_in_organization' using errcode = 'ORG01';
  end;

  insert into public.profiles (user_id, full_name, terms_version, terms_accepted_at)
  values (caller, btrim(owner_full_name), accepted_terms_version, now())
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        terms_version = excluded.terms_version,
        terms_accepted_at = excluded.terms_accepted_at;

  return organization;
end;
$$;

-- Open invitations sent to the caller's confirmed address, so onboarding can point them
-- out before the person creates an organization of their own and shuts themselves out of
-- the one that invited them. No token and no id: the emailed link stays the only thing
-- that accepts an invitation.
create function public.my_open_invitations()
returns table (
  organization_name text,
  inviter_name text,
  role public.organization_role,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, p.full_name, i.role, i.expires_at
  from auth.users u
  join public.organization_invitations i on i.email = lower(u.email)
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.user_id = i.invited_by
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
revoke all on function public.my_open_invitations() from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.my_open_invitations() to authenticated;
