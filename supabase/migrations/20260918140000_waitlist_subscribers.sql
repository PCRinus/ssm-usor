-- People who asked on the marketing site to be told when accounts open.
--
-- Subscription is double opt-in: a row is pending until the link in the confirmation
-- email is followed, and only confirmed rows receive the launch announcement. The
-- confirmation token is stored as a SHA-256 hash, so the table cannot be used to
-- confirm addresses on someone's behalf.
--
-- Nobody signed in may touch this table. Row-level security is on with no policies,
-- so only the API's secret key (service_role) reads or writes it.

create table public.waitlist_subscribers (
  id uuid primary key default gen_random_uuid(),
  -- Normalized by the API: trimmed and lowercased.
  email text not null
    constraint waitlist_subscribers_email_normalized check (email = lower(btrim(email)))
    constraint waitlist_subscribers_email_length check (char_length(email) between 3 and 254),
  confirmation_token_hash text not null
    constraint waitlist_subscribers_token_hash_format check (confirmation_token_hash ~ '^[0-9a-f]{64}$'),
  -- The version of the consent text shown next to the form when the person subscribed.
  consent_version text not null
    constraint waitlist_subscribers_consent_version_length check (char_length(consent_version) between 1 and 40),
  -- When the latest confirmation email was handed to the provider; null if none has been.
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index waitlist_subscribers_email_key on public.waitlist_subscribers (email);
create unique index waitlist_subscribers_token_hash_key
  on public.waitlist_subscribers (confirmation_token_hash);

create trigger waitlist_subscribers_set_updated_at before update on public.waitlist_subscribers
  for each row execute function public.set_updated_at();

alter table public.waitlist_subscribers enable row level security;
revoke all on table public.waitlist_subscribers from anon, authenticated;
