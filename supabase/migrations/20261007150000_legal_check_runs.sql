-- One row per run of the daily legislation check (ADR 017). A cron that fails says nothing to
-- anyone; this log is what the Legislație page reads to warn that the check is not running.

create table public.legal_check_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    constraint legal_check_runs_status_value check (status in ('running', 'succeeded', 'failed')),
  acts_checked integer not null default 0 constraint legal_check_runs_acts_checked_not_negative check (acts_checked >= 0),
  changes_found integer not null default 0 constraint legal_check_runs_changes_found_not_negative check (changes_found >= 0),
  acts_skipped integer not null default 0 constraint legal_check_runs_acts_skipped_not_negative check (acts_skipped >= 0),
  -- [{ "act": "lege-319-2006", "message": "…" }], one per act that could not be read; "act" is
  -- null when the run itself failed. Null when nothing failed.
  errors jsonb constraint legal_check_runs_errors_array check (errors is null or jsonb_typeof(errors) = 'array'),
  -- A run left 'running' for good was cut off before it could record its end.
  constraint legal_check_runs_finished_at_matches check ((status = 'running') = (finished_at is null))
);

create index legal_check_runs_started_at_idx on public.legal_check_runs (started_at desc);

comment on table public.legal_check_runs is 'Runs of the daily legislation check, written with the secret key.';

alter table public.legal_check_runs enable row level security;

revoke all on table public.legal_check_runs from anon;
revoke insert, update, delete, truncate on table public.legal_check_runs from authenticated;

create policy "members read the legislation check runs"
  on public.legal_check_runs for select to authenticated
  using ((select public.current_organization_id()) is not null);
