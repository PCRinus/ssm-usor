-- Watched acts and the legal changes seen on the Portal Legislativ (ADR 017, step 5).
--
-- The data is the same for every organization: the acts are the ones the built-in templates
-- cite. A scheduled job writes it with the secret key; members only read it.

create table public.legal_acts (
  -- The act's id in packages/document-engine/templates/legal-acts.json, e.g. 'lege-319-2006'.
  id text primary key constraint legal_acts_id_format check (id ~ '^[a-z0-9]+(-[a-z0-9]+)+$'),
  name text not null constraint legal_acts_name_length check (char_length(btrim(name)) between 2 and 120),
  -- Null until the act's page on legislatie.just.ro has been found; the job skips it until then.
  portal_id integer constraint legal_acts_portal_id_positive check (portal_id > 0),
  portal_status text constraint legal_acts_portal_status_value check (portal_status in ('in_force', 'repealed')),
  -- The consolidated form the templates were verified against, set by hand.
  verified_consolidated_on date,
  last_consolidated_on date,
  last_amending_act text,
  last_checked_at timestamptz,
  -- When someone read the act on the portal because the job could not.
  checked_by_hand_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger legal_acts_set_updated_at before update on public.legal_acts
  for each row execute function public.set_updated_at();

create table public.legal_changes (
  id uuid primary key default gen_random_uuid(),
  act_id text not null references public.legal_acts (id) on delete restrict,
  seen_at timestamptz not null default now(),
  consolidated_on date not null,
  amending_act text,
  resolution text not null default 'open'
    constraint legal_changes_resolution_value check (resolution in ('open', 'no_impact', 'template_version')),
  resolved_at timestamptz,
  resolved_by_note text,
  constraint legal_changes_resolved_at_matches check ((resolution = 'open') = (resolved_at is null)),
  -- The job runs daily and sees the same consolidated form until the next one.
  constraint legal_changes_act_consolidation_key unique (act_id, consolidated_on)
);

create index legal_changes_seen_at_idx on public.legal_changes (seen_at desc);

alter table public.document_template_versions
  add column resolves_legal_change_id uuid references public.legal_changes (id) on delete restrict;

create index document_template_versions_resolves_legal_change_idx
  on public.document_template_versions (resolves_legal_change_id)
  where resolves_legal_change_id is not null;

comment on table public.legal_acts is 'Legal acts the built-in templates cite, followed on the Portal Legislativ.';
comment on table public.legal_changes is 'Newer consolidated forms of watched acts, open until resolved.';

alter table public.legal_acts enable row level security;
alter table public.legal_changes enable row level security;

revoke all on table public.legal_acts from anon;
revoke all on table public.legal_changes from anon;
revoke insert, update, delete, truncate on table public.legal_acts from authenticated;
revoke insert, update, delete, truncate on table public.legal_changes from authenticated;

create policy "members read the watched acts"
  on public.legal_acts for select to authenticated
  using ((select public.current_organization_id()) is not null);

create policy "members read the legal changes"
  on public.legal_changes for select to authenticated
  using ((select public.current_organization_id()) is not null);
