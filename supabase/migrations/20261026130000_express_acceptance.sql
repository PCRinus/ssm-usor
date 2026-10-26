-- The express acceptance of the Terms' standard clauses (ADR 029, Civil Code art. 1203), recorded
-- on its own and required by the database, so a direct call to the data API cannot skip it.
-- Null for organizations created before it was asked.

alter table public.organizations
  add column special_clauses_accepted_at timestamptz;

-- Errors the API translates:
--   42501  the caller's email is not confirmed
--   ORG01  the caller already belongs to an organization
-- And one it never sees, since its own validation refuses first; only a direct call meets it:
--   22023  the special clauses were not accepted

drop function public.create_organization(text, text, text);

create function public.create_organization(
  organization_name text,
  owner_full_name text,
  accepted_terms_version text,
  accepts_special_clauses boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  organization uuid;
  trial_end timestamptz := now() + interval '30 days';
begin
  if caller is null or not exists (
    select 1 from auth.users u where u.id = caller and u.email_confirmed_at is not null
  ) then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  if accepts_special_clauses is not true then
    raise exception 'special_clauses_not_accepted' using errcode = '22023';
  end if;

  if exists (select 1 from public.organization_members m where m.user_id = caller) then
    raise exception 'already_in_organization' using errcode = 'ORG01';
  end if;

  insert into public.organizations (
    name, terms_version, terms_accepted_at, terms_accepted_by, special_clauses_accepted_at
  )
  values (btrim(organization_name), accepted_terms_version, now(), caller, now())
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

  insert into public.subscriptions (organization_id, plan, status, trial_ends_at, access_until)
  values (organization, 'profesional', 'trialing', trial_end, trial_end);

  insert into public.subscription_changes (organization_id, source, change, details)
  values (organization, 'onboarding', 'trial_started', jsonb_build_object('trial_ends_at', trial_end));

  return organization;
end;
$$;

revoke all on function public.create_organization(text, text, text, boolean) from public, anon;
grant execute on function public.create_organization(text, text, text, boolean) to authenticated;
