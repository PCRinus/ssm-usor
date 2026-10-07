import {
  type ActOutcome,
  checkLegislation,
  type CheckOptions,
  type LegalAct,
  summarize,
} from './check';
import type { LegislationClient } from './database';

export type RunError = { act: string | null; message: string };

export type CheckRun = {
  id: string;
  status: 'succeeded' | 'failed';
  outcomes: ActOutcome[];
  errors: RunError[];
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runLegislationCheck(
  db: LegislationClient,
  acts: LegalAct[],
  options: CheckOptions = {}
): Promise<CheckRun> {
  const started = await db.from('legal_check_runs').insert({}).select('id').single();
  if (started.error) throw new Error(`Could not start the run: ${started.error.message}`);
  const { id } = started.data;

  let outcomes: ActOutcome[] = [];
  let errors: RunError[];
  // Whatever throws, the run is still closed as failed: a cron that dies says nothing, and a
  // row left 'running' reads only as cut off.
  try {
    outcomes = await checkLegislation(db, acts, options);
    errors = outcomes.flatMap((outcome) =>
      outcome.result === 'failed' ? [{ act: outcome.act.id, message: outcome.error }] : []
    );
  } catch (error) {
    errors = [{ act: null, message: message(error) }];
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

export function describeRun(run: CheckRun) {
  const lines = run.outcomes.length > 0 ? [summarize(run.outcomes)] : [];
  for (const error of run.errors) {
    if (error.act === null) lines.push(`The run stopped: ${error.message}`);
  }
  lines.push(`Run ${run.id} ${run.status}.`);
  return lines.join('\n');
}
