-- Null until the participant chooses a language on the portal; the portal then follows the
-- browser.
alter table public.client_participants
  add column language text
    constraint client_participants_language_known check (language in ('ro', 'en'));

-- The return type changes, so the function is dropped and made again with its grants.
drop function public.current_participations();

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
  notice_version text,
  language text
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
    p.notice_version,
    p.language
  from public.client_participants p
  join public.organizations o on o.id = p.organization_id
  join public.clients c on c.id = p.client_id
  left join public.employees e on e.id = p.employee_id
  where p.user_id = auth.uid() and p.revoked_at is null
  order by c.legal_name, p.created_at;
$$;

-- True when the caller's own active participation took the language.
create function public.set_participant_language(p_participant_id uuid, p_language text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated uuid;
begin
  update public.client_participants p
  set language = p_language
  where p.id = p_participant_id
    and p.user_id = auth.uid()
    and p.revoked_at is null
  returning p.id into updated;

  return updated is not null;
end;
$$;

revoke all on function public.current_participations() from public, anon;
revoke all on function public.set_participant_language(uuid, text) from public, anon;
grant execute on function public.current_participations() to authenticated, service_role;
grant execute on function public.set_participant_language(uuid, text) to authenticated, service_role;
