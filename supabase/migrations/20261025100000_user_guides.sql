-- The SPA defines the guides and their versions; a guide shows again once its version outgrows
-- the stored one.

create table public.user_guides (
  user_id uuid not null references auth.users (id) on delete cascade,
  guide text not null
    constraint user_guides_guide_format check (guide ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(guide) <= 60),
  version integer not null
    constraint user_guides_version_positive check (version >= 1),
  -- A skip counts as seen for showing the guide again, but is not a completion.
  status text not null
    constraint user_guides_status check (status in ('completed', 'skipped')),
  updated_at timestamptz not null default now(),
  primary key (user_id, guide)
);

comment on table public.user_guides is
  'The last version of each in-app guide a person finished or skipped, and how.';

create trigger user_guides_set_updated_at before update on public.user_guides
  for each row execute function public.set_updated_at();

alter table public.user_guides enable row level security;

revoke all on table public.user_guides from anon, authenticated;
grant select, insert on table public.user_guides to authenticated;
grant update (version, status) on table public.user_guides to authenticated;

create policy "users read their own guides"
  on public.user_guides for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users record their own guides"
  on public.user_guides for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users change their own guides"
  on public.user_guides for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- For the signed-in account, the real one also during an impersonation.
create function public.record_user_guide(guide text, version integer, status text)
returns public.user_guides
language sql
security invoker
set search_path = ''
as $$
  insert into public.user_guides as g (user_id, guide, version, status)
  values ((select auth.uid()), record_user_guide.guide, record_user_guide.version, record_user_guide.status)
  on conflict (user_id, guide) do update
    set version = excluded.version, status = excluded.status
  returning g.*;
$$;

revoke all on function public.record_user_guide(text, integer, text) from public, anon;
grant execute on function public.record_user_guide(text, integer, text) to authenticated;
