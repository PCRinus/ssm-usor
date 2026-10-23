-- Releases and what members read about them (ADR 026, step 3).
--
-- The published GitHub release's body is the source of an update; this table is the copy the
-- app reads. Only the release workflow writes it, with the secret key, by an upsert on the tag.
-- Members read every row and acknowledge on their own profile.

create table public.releases (
  tag text primary key
    constraint releases_tag_format check (tag ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}(\.[0-9]+)?$'),
  published_at timestamptz not null,
  headline text not null
    constraint releases_headline_length check (char_length(headline) between 1 and 160),
  lead text
    constraint releases_lead_length check (char_length(lead) <= 600),
  -- [{ "title", "text", "where", "icon" }], in the order of the release body.
  features jsonb not null default '[]'
    constraint releases_features_array check (jsonb_typeof(features) = 'array'),
  improvements text[] not null default '{}',
  fixes text[] not null default '{}',
  -- The release body up to its horizontal rule, as parsed into the columns above.
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.releases is 'The update of each release that has one, parsed from the GitHub release body. Written only by the release workflow (ADR 026).';

create index releases_published_at_idx on public.releases (published_at desc);

create trigger releases_set_updated_at before update on public.releases
  for each row execute function public.set_updated_at();

alter table public.releases enable row level security;

revoke all on table public.releases from anon;
revoke insert, update, delete, truncate on table public.releases from authenticated;

create policy "signed-in users read the releases"
  on public.releases for select to authenticated
  using (true);

-- Null until the person first acknowledges, and again if that release is ever deleted.
alter table public.profiles
  add column releases_acknowledged_through text references public.releases (tag) on delete set null;

create index profiles_releases_acknowledged_through_idx
  on public.profiles (releases_acknowledged_through)
  where releases_acknowledged_through is not null;

grant update (releases_acknowledged_through) on table public.profiles to authenticated;

-- Unread for the signed-in account, the real one also during an impersonation: published after
-- its profile was created and after the release it acknowledged. Timestamps, never tags:
-- '2026.10.23.10' sorts before '2026.10.23.2' as text. No profile, nothing unread.
create view public.release_list
with (security_invoker = true)
as
select
  r.tag,
  r.published_at,
  r.headline,
  r.lead,
  r.features,
  r.improvements,
  r.fixes,
  coalesce(
    r.published_at > p.created_at
      and (acknowledged.published_at is null or r.published_at > acknowledged.published_at),
    false
  ) as unread
from public.releases r
left join public.profiles p on p.user_id = (select auth.uid())
left join public.releases acknowledged on acknowledged.tag = p.releases_acknowledged_through;

comment on view public.release_list is
  'Every release with whether it is unread for the signed-in account (ADR 026).';

revoke all on table public.release_list from anon, authenticated;
grant select on table public.release_list to authenticated;

-- Acknowledges everything published up to and including the release `through`, unless a newer
-- one is acknowledged already. Returns the tag the profile ends up with.
create function public.acknowledge_releases(through text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target timestamptz;
  kept text;
begin
  select r.published_at into target from public.releases r where r.tag = through;
  if target is null then
    raise exception 'unknown_release' using errcode = 'REL01';
  end if;

  update public.profiles p
  set releases_acknowledged_through = through
  where p.user_id = (select auth.uid())
    and (
      p.releases_acknowledged_through is null
      or target > (
        select r.published_at from public.releases r where r.tag = p.releases_acknowledged_through
      )
    );

  select p.releases_acknowledged_through into kept
  from public.profiles p
  where p.user_id = (select auth.uid());
  if not found then
    raise exception 'profile_missing' using errcode = 'REL02';
  end if;
  return kept;
end;
$$;

revoke all on function public.acknowledge_releases(text) from public, anon;
grant execute on function public.acknowledge_releases(text) to authenticated;
