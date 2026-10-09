import {
  type ActOutcome,
  checkLegislation,
  type CheckOptions,
  type Failure,
  failureOf,
  type LegalAct,
  summarize,
  tally,
} from './check';
import type { LegislationClient } from './database';

// `act` is null when the run itself failed, not one act's page.
export type RunError = { act: string | null } & Failure;

export type CheckRun = {
  id: string;
  status: 'succeeded' | 'failed';
  outcomes: ActOutcome[];
  errors: RunError[];
};

export type RunOptions = CheckOptions & { onStart?: (id: string) => void };

// A cron invocation is stopped after fifteen minutes of wall time, so a row still 'running'
// after that was cut off and blocks nothing.
export const runCutOffAfterMs = 15 * 60 * 1000;

export async function runInProgress(db: LegislationClient, now = Date.now()) {
  const found = await db
    .from('legal_check_runs')
    .select('id, started_at')
    .eq('status', 'running')
    .gt('started_at', new Date(now - runCutOffAfterMs).toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (found.error) throw new Error(`Could not look for a run in progress: ${found.error.message}`);
  return found.data;
}

export async function runLegislationCheck(
  db: LegislationClient,
  acts: LegalAct[],
  options: RunOptions = {}
): Promise<CheckRun> {
  const started = await db.from('legal_check_runs').insert({}).select('id').single();
  if (started.error) throw new Error(`Could not start the run: ${started.error.message}`);
  const { id } = started.data;

  let outcomes: ActOutcome[] = [];
  let errors: RunError[];
  // Whatever throws, the run is still closed as failed: a cron that dies says nothing, and a
  // row left 'running' reads only as cut off.
  try {
    options.onStart?.(id);
    outcomes = await checkLegislation(db, acts, options);
    errors = outcomes.flatMap((outcome) =>
      outcome.result === 'failed' ? [{ act: outcome.act.id, ...outcome.error }] : []
    );
  } catch (error) {
    errors = [{ act: null, ...failureOf(error) }];
  }

  const status = errors.length > 0 ? 'failed' : 'succeeded';
  const finished = await db
    .from('legal_check_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      acts_checked: outcomes.filter((outcome) => outcome.result === 'checked').length,
      changes_found: outcomes.filter(
        (outcome) => outcome.result === 'checked' && outcome.change?.recorded
      ).length,
      acts_skipped: outcomes.filter((outcome) => outcome.result === 'skipped').length,
      errors: errors.length > 0 ? errors : null,
    })
    .eq('id', id);
  if (finished.error) {
    throw new Error(`Could not record the end of run ${id}: ${finished.error.message}`);
  }
  return { id, status, outcomes, errors };
}

const causes = {
  fetch: 'could not be fetched',
  parse: 'could not be parsed',
  other: 'failed otherwise',
} as const;

const causeOf = (error: RunError) =>
  error.kind === 'http_status' ? `answered ${error.status}` : causes[error.kind];

export function describeRun(run: CheckRun, { perAct = true } = {}) {
  const lines =
    run.outcomes.length === 0 ? [] : [perAct ? summarize(run.outcomes) : tally(run.outcomes)];
  const counts = new Map<string, number>();
  for (const error of run.errors) {
    if (error.act === null) lines.push(`The run stopped: ${error.message}`);
    else counts.set(causeOf(error), (counts.get(causeOf(error)) ?? 0) + 1);
  }
  if (counts.size > 0) {
    lines.push(
      `Failed acts by cause: ${[...counts].map(([cause, count]) => `${count} ${cause}`).join(', ')}.`
    );
  }
  lines.push(`Run ${run.id} ${run.status}.`);
  return lines.join('\n');
}
