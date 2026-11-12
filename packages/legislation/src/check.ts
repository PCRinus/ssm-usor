import { z } from 'zod';

import {
  assessChange,
  type ChangeAssessment,
  defaultReadForm,
  type IndexedCitation,
  type PendingChange,
  pendingChanges,
  type ReadForm,
  storeAssessment,
} from './assess';
import type { LegislationClient, LegislationTables } from './database';
import {
  fetchPortalAct,
  pause,
  type PortalAct,
  PortalError,
  type PortalOptions,
  portalPauseMs,
} from './portal';

export const legalActsSchema = z.object({
  acts: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)+$/),
      kind: z.string(),
      // A joint order of two ministries has two numbers: "450/825".
      number: z.union([z.int().positive(), z.string().regex(/^[1-9][0-9]*(\/[1-9][0-9]*)*$/)]),
      year: z.int().min(1800).max(2100),
      name: z.string().min(2).max(120),
      title: z.string().nullable(),
      portalId: z.int().positive().nullable(),
    })
  ),
});

export type LegalAct = z.infer<typeof legalActsSchema>['acts'][number];

type ActRow = Pick<
  LegislationTables['legal_acts']['Row'],
  'id' | 'last_consolidated_on' | 'verified_consolidated_on' | 'last_checked_at'
>;

export type FailureKind = 'http_status' | 'fetch' | 'parse' | 'other';

// `message` is the technical text for the logs; the app words the failure from the other fields.
export type Failure = { kind: FailureKind; status?: number; message: string };

export type ChangeSeen = {
  // Null when the change was recorded before and the database did not return it again.
  id: string | null;
  consolidatedOn: string;
  amendingAct: string | null;
  recorded: boolean;
};

export type ActOutcome =
  | { act: LegalAct; result: 'skipped' }
  | {
      act: LegalAct;
      result: 'failed';
      error: Failure;
      // When the page was read and only assessing its changes failed.
      change?: ChangeSeen | null;
      assessments?: ChangeAssessment[];
    }
  | {
      act: LegalAct;
      result: 'checked';
      portal: PortalAct;
      // Null when nothing newer than both the last form seen and the verified one is on the portal.
      change: ChangeSeen | null;
      assessments: ChangeAssessment[];
    };

// Without a form seen before or a verification date, the first form seen is the baseline, unless
// the act was read before as never consolidated: its first consolidation is then a change. A
// verified form newer than the last one seen, a republication the check once did not read, is
// not a change.
export function isNewer(newest: string | null, row: ActRow) {
  if (newest === null) return false;
  const { last_consolidated_on: last, verified_consolidated_on: verified } = row;
  const known = [last, verified]
    .filter((date) => date !== null)
    .sort()
    .at(-1);
  return known === undefined ? Boolean(row.last_checked_at) : newest > known;
}

export function failureOf(error: unknown): Failure {
  if (error instanceof PortalError) return { ...error.failure, message: error.message };
  return { kind: 'other', message: error instanceof Error ? error.message : String(error) };
}

export type CheckOptions = {
  readAct?: (portalId: number) => Promise<PortalAct>;
  readForm?: ReadForm;
  // Without the index nothing is assessed: no citation would read as no impact.
  citations?: IndexedCitation[];
  pauseMs?: number;
  portal?: PortalOptions;
  onOutcome?: (outcome: ActOutcome) => void;
};

export async function checkLegislation(
  db: LegislationClient,
  acts: LegalAct[],
  options: CheckOptions = {}
) {
  const readAct =
    options.readAct ?? ((portalId: number) => fetchPortalAct(portalId, options.portal));
  const upserted = await db
    .from('legal_acts')
    .upsert(acts.map((act) => ({ id: act.id, name: act.name, portal_id: act.portalId })))
    .select('id, last_consolidated_on, verified_consolidated_on, last_checked_at');
  if (upserted.error) throw new Error(`Could not save the acts: ${upserted.error.message}`);
  const rows = new Map(upserted.data.map((row) => [row.id, row]));
  const pending = options.citations ? await pendingChanges(db) : new Map<string, PendingChange[]>();
  const readForm = options.readForm ?? defaultReadForm(options.portal);

  const outcomes: ActOutcome[] = [];
  const record = (outcome: ActOutcome) => {
    outcomes.push(outcome);
    options.onOutcome?.(outcome);
  };
  let first = true;
  for (const act of acts) {
    const row = rows.get(act.id);
    if (act.portalId === null) {
      record({ act, result: 'skipped' });
      continue;
    }
    if (!row) {
      record({
        act,
        result: 'failed',
        error: { kind: 'other', message: 'the act was not saved' },
      });
      continue;
    }
    // A government site with no API: one act at a time, with a pause between them.
    if (!first) await pause(options.pauseMs ?? portalPauseMs);
    first = false;
    try {
      const portal = await readAct(act.portalId);
      if (portal.newestConsolidation === null && row.last_consolidated_on !== null) {
        throw new PortalError(
          `The page lists no consolidated form, where ${row.last_consolidated_on} was seen before.`
        );
      }
      const checked = await checkAct(db, act, row, portal);
      if (!options.citations) {
        record(checked);
        continue;
      }
      const assessments: ChangeAssessment[] = [];
      try {
        for (const change of due(pending.get(act.id) ?? [], checked.change, row)) {
          const assessment = await assessChange({
            act: { id: act.id, portalId: act.portalId },
            change,
            verifiedOn: row.verified_consolidated_on,
            citations: options.citations,
            readForm,
            pauseMs: options.pauseMs,
          });
          await storeAssessment(db, act.id, assessment);
          assessments.push(assessment);
          if (assessment.resolved) row.verified_consolidated_on = assessment.consolidatedOn;
        }
        record({ ...checked, assessments });
      } catch (error) {
        const failure = failureOf(error);
        record({
          act,
          result: 'failed',
          error: { ...failure, message: `Could not assess its change: ${failure.message}` },
          change: checked.change,
          assessments,
        });
      }
    } catch (error) {
      record({ act, result: 'failed', error: failureOf(error) });
    }
  }
  return outcomes;
}

// Oldest first: a change resolved as no impact moves the verified form the next one is compared
// with. A change no newer than the verified form was answered when that form was recorded.
function due(pending: PendingChange[], seen: ChangeSeen | null, row: ActRow) {
  const changes = [...pending];
  if (seen?.recorded && seen.id && !changes.some((each) => each.id === seen.id)) {
    changes.push({ id: seen.id, consolidatedOn: seen.consolidatedOn, backfilled: false });
  }
  const verified = row.verified_consolidated_on;
  return changes
    .filter((change) => verified === null || change.consolidatedOn > verified)
    .sort((a, b) => a.consolidatedOn.localeCompare(b.consolidatedOn));
}

async function checkAct(
  db: LegislationClient,
  act: LegalAct,
  row: ActRow,
  portal: PortalAct
): Promise<Extract<ActOutcome, { result: 'checked' }>> {
  const amendingAct = portal.amendingActs.length > 0 ? portal.amendingActs.join(', ') : null;
  let change: Extract<ActOutcome, { result: 'checked' }>['change'] = null;
  // The change before the act's row: a run that stops in between finds the change again.
  if (portal.newestConsolidation !== null && isNewer(portal.newestConsolidation, row)) {
    const inserted = await db
      .from('legal_changes')
      .upsert(
        { act_id: act.id, consolidated_on: portal.newestConsolidation, amending_act: amendingAct },
        { onConflict: 'act_id,consolidated_on', ignoreDuplicates: true }
      )
      .select('id');
    if (inserted.error) throw new Error(`Could not record the change: ${inserted.error.message}`);
    change = {
      id: inserted.data[0]?.id ?? null,
      consolidatedOn: portal.newestConsolidation,
      amendingAct,
      recorded: inserted.data.length > 0,
    };
  }
  const updated = await db
    .from('legal_acts')
    .update({
      portal_status: portal.status,
      last_consolidated_on: portal.newestConsolidation,
      last_amending_act: amendingAct,
      last_checked_at: new Date().toISOString(),
    })
    .eq('id', act.id);
  if (updated.error) throw new Error(`Could not update the act: ${updated.error.message}`);
  return { act, result: 'checked', portal, change, assessments: [] };
}

const statusWords = { in_force: 'in force', repealed: 'REPEALED' } as const;

const outcomeWords = {
  no_impact: 'resolved, no impact',
  quote_differs: 'QUOTE DIFFERS',
  needs_review: 'NEEDS REVIEW',
} as const;

export function describeOutcome(outcome: ActOutcome) {
  const label = `${outcome.act.id.padEnd(18)} ${outcome.act.name}:`;
  if (outcome.result === 'skipped') return `${label} skipped, no portal id`;
  if (outcome.result === 'failed') return `${label} FAILED, ${outcome.error.message}`;
  const { portal, change } = outcome;
  const form = portal.newestConsolidation
    ? `consolidated ${portal.newestConsolidation}${portal.amendingActs.length > 0 ? ` after ${portal.amendingActs.join(', ')}` : ''}`
    : 'never consolidated';
  const news = !change
    ? 'no change'
    : change.recorded
      ? `NEW CHANGE ${change.consolidatedOn}`
      : `change ${change.consolidatedOn} already recorded`;
  const assessed = outcome.assessments.map(
    (assessment) => `; ${assessment.consolidatedOn} ${outcomeWords[assessment.outcome]}`
  );
  return `${label} ${statusWords[portal.status]}, ${form}; ${news}${assessed.join('')}`;
}

export function tally(outcomes: ActOutcome[]) {
  const count = (result: ActOutcome['result']) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const recorded = outcomes.filter(
    (outcome) => outcome.result === 'checked' && outcome.change?.recorded
  ).length;
  const skipped = outcomes.filter((outcome) => outcome.result === 'skipped');
  return `${outcomes.length} acts: ${count('checked')} checked, ${recorded} new ${recorded === 1 ? 'change' : 'changes'}, ${count('failed')} failed, ${skipped.length} skipped${skipped.length > 0 ? ` (${skipped.map((outcome) => outcome.act.id).join(', ')})` : ''}.`;
}

export function summarize(outcomes: ActOutcome[]) {
  return [...outcomes.map(describeOutcome), tally(outcomes)].join('\n');
}
