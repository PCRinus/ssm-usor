import { z } from 'zod';

import type { AnchorReader } from './anchors';
import {
  assessChange,
  assessmentRetryMs,
  type ChangeAssessment,
  defaultReadForm,
  type IndexedCitation,
  type PendingChange,
  pendingChanges,
  type ReadForm,
  storeAssessment,
  unassessed,
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
import type { failureKinds } from './stored';

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

// Structural, so that the engine's act list and an `--acts` file both pass without this package
// depending on the engine.
export type CheckedAct = Pick<LegalAct, 'id' | 'name' | 'title' | 'portalId'>;

type ActRow = Pick<
  LegislationTables['legal_acts']['Row'],
  | 'id'
  | 'last_consolidated_on'
  | 'verified_consolidated_on'
  | 'last_checked_at'
  | 'anchors_read_at'
  | 'anchors_consolidated_on'
>;

export type FailureKind = (typeof failureKinds)[number];

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
  | { act: CheckedAct; result: 'skipped' }
  | { act: CheckedAct; result: 'failed'; error: Failure }
  | {
      act: CheckedAct;
      result: 'checked';
      portal: PortalAct;
      // Null when nothing newer than both the last form seen and the verified one is on the portal.
      change: ChangeSeen | null;
      assessments: ChangeAssessment[];
      // The act was read and recorded; only assessing a change failed, and the next run tries
      // again. Not a failure of the run.
      assessmentError?: Failure;
      // Changes left for the next run, past the run's time for assessing.
      deferred?: string[];
      // Open changes no newer than the verified form, which nothing assesses.
      passed?: string[];
      warnings?: string[];
    };

// Without a form seen before or a verification date, the first form seen is the baseline, unless
// the act was read before as never consolidated: its first consolidation is then a change. A
// verified form newer than the last one seen, a republication the check once did not read, is
// not a change.
export function isNewer(
  newest: string | null,
  row: Pick<ActRow, 'last_consolidated_on' | 'verified_consolidated_on' | 'last_checked_at'>
) {
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
  // Without it the articles' anchors are left as they are.
  readAnchors?: AnchorReader;
  // From the start of the check; the changes not assessed, and the anchors not read, by then wait
  // for the next run.
  assessForMs?: number;
  now?: () => number;
};

// A cron run is stopped after fifteen minutes of wall time; the acts after the last assessment
// still need reading.
export const assessForMs = 10 * 60 * 1000;

export async function checkLegislation(
  db: LegislationClient,
  acts: CheckedAct[],
  options: CheckOptions = {}
) {
  const readAct =
    options.readAct ?? ((portalId: number) => fetchPortalAct(portalId, options.portal));
  const upserted = await db
    .from('legal_acts')
    .upsert(acts.map((act) => ({ id: act.id, name: act.name, portal_id: act.portalId })))
    .select(
      'id, last_consolidated_on, verified_consolidated_on, last_checked_at, anchors_read_at, anchors_consolidated_on'
    );
  if (upserted.error) throw new Error(`Could not save the acts: ${upserted.error.message}`);
  const rows = new Map(upserted.data.map((row) => [row.id, row]));
  const pending = options.citations ? await pendingChanges(db) : new Map<string, PendingChange[]>();
  const readForm = options.readForm ?? defaultReadForm(options.portal);
  const now = options.now ?? Date.now;
  const assessUntil = now() + (options.assessForMs ?? assessForMs);

  const outcomes: ActOutcome[] = [];
  const record = (outcome: ActOutcome) => {
    outcomes.push(outcome);
    options.onOutcome?.(outcome);
  };
  // Read after every act is checked and assessed, so links never hold up an assessment.
  const anchorsDueFor: { act: CheckedAct; outcome: CheckedOutcome }[] = [];
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
      const recordChecked = (outcome: CheckedOutcome) => {
        record(outcome);
        if (options.readAnchors && anchorsDue(row, portal)) anchorsDueFor.push({ act, outcome });
      };
      if (!options.citations) {
        recordChecked(checked);
        continue;
      }
      const { due, passed } = dueChanges(pending.get(act.id) ?? [], checked.change, row, now());
      const assessments: ChangeAssessment[] = [];
      const warnings: string[] = [];
      const deferred: string[] = [];
      let assessmentError: Failure | undefined;
      for (const change of due) {
        if (assessmentError || now() >= assessUntil) {
          if (!assessmentError) deferred.push(change.consolidatedOn);
          continue;
        }
        let assessment: ChangeAssessment;
        try {
          assessment = await assessChange({
            act: { id: act.id, portalId: act.portalId },
            change,
            verifiedOn: row.verified_consolidated_on,
            citations: options.citations,
            readForm,
            pauseMs: options.pauseMs,
          });
        } catch (error) {
          const failure = failureOf(error);
          if (now() - Date.parse(change.seenAt) < assessmentRetryMs) {
            assessmentError = failure;
            continue;
          }
          assessment = unassessed(change, failure.message);
        }
        try {
          const stored = await storeAssessment(db, act.id, assessment);
          assessments.push(assessment);
          if (stored.warning) warnings.push(stored.warning);
          if (stored.advanced) row.verified_consolidated_on = assessment.consolidatedOn;
        } catch (error) {
          assessmentError = failureOf(error);
        }
      }
      recordChecked({
        ...checked,
        assessments,
        ...(assessmentError && {
          assessmentError: {
            ...assessmentError,
            message: `Could not assess its change: ${assessmentError.message}`,
          },
        }),
        ...(deferred.length > 0 && { deferred }),
        ...(passed.length > 0 && { passed }),
        ...(warnings.length > 0 && { warnings }),
      });
    } catch (error) {
      record({ act, result: 'failed', error: failureOf(error) });
    }
  }
  for (const { act, outcome } of anchorsDueFor) {
    if (now() >= assessUntil) break;
    await pause(options.pauseMs ?? portalPauseMs);
    const warning = await storeAnchors(db, act, options.readAnchors!);
    if (warning) outcome.warnings = [...(outcome.warnings ?? []), warning];
  }
  return outcomes;
}

// Oldest first: a change resolved as no impact moves the verified form the next one is compared
// with. A change no newer than the verified form was answered when that form was recorded, by
// hand; it is left open for a person to close, and named in the run's summary.
function dueChanges(pending: PendingChange[], seen: ChangeSeen | null, row: ActRow, now: number) {
  const changes = [...pending];
  if (seen?.recorded && seen.id && !changes.some((each) => each.id === seen.id)) {
    changes.push({
      id: seen.id,
      consolidatedOn: seen.consolidatedOn,
      backfilled: false,
      seenAt: new Date(now).toISOString(),
    });
  }
  const verified = row.verified_consolidated_on;
  const newer = (change: PendingChange) => verified === null || change.consolidatedOn > verified;
  return {
    due: changes.filter(newer).sort((a, b) => a.consolidatedOn.localeCompare(b.consolidatedOn)),
    passed: changes
      .filter((change) => !newer(change))
      .map((change) => change.consolidatedOn)
      .sort(),
  };
}

type CheckedOutcome = Extract<ActOutcome, { result: 'checked' }>;

// The act's page shows its newest form, whose element ids a new form renumbers; a form's ids stay.
const anchorsDue = (row: ActRow, portal: PortalAct) =>
  !row.anchors_read_at || (row.anchors_consolidated_on ?? null) !== portal.newestConsolidation;

// The anchors only make links; an act whose text could not be read keeps the ones it has and is
// read again by the next run.
async function storeAnchors(db: LegislationClient, act: CheckedAct, readAnchors: AnchorReader) {
  try {
    const read = await readAnchors(act.portalId!);
    const updated = await db
      .from('legal_acts')
      .update({
        article_anchors: read.anchors,
        anchors_consolidated_on: read.consolidatedOn,
        anchors_read_at: new Date().toISOString(),
      })
      .eq('id', act.id);
    if (updated.error) throw new Error(updated.error.message);
    return null;
  } catch (error) {
    return `Could not read its articles' anchors: ${failureOf(error).message}`;
  }
}

async function checkAct(
  db: LegislationClient,
  act: CheckedAct,
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
  const notes = [
    ...(outcome.assessmentError ? [`ASSESSMENT FAILED, ${outcome.assessmentError.message}`] : []),
    ...(outcome.deferred?.length
      ? [`${outcome.deferred.join(', ')} left for the next run, out of time`]
      : []),
    ...(outcome.passed?.length
      ? [`${outcome.passed.join(', ')} open but no newer than the verified form, not assessed`]
      : []),
    ...(outcome.warnings ?? []).map((warning) => `warning: ${warning}`),
  ].map((note) => `; ${note}`);
  return `${label} ${statusWords[portal.status]}, ${form}; ${news}${assessed.join('')}${notes.join('')}`;
}

export function tally(outcomes: ActOutcome[]) {
  const count = (result: ActOutcome['result']) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const recorded = outcomes.filter(
    (outcome) => outcome.result === 'checked' && outcome.change?.recorded
  ).length;
  const skipped = outcomes.filter((outcome) => outcome.result === 'skipped');
  const checked = outcomes.flatMap((outcome) => (outcome.result === 'checked' ? [outcome] : []));
  const notAssessed = checked.filter((outcome) => outcome.assessmentError).length;
  const deferred = checked.reduce((sum, outcome) => sum + (outcome.deferred?.length ?? 0), 0);
  const assessing = [
    ...(notAssessed > 0
      ? [
          `${notAssessed} ${notAssessed === 1 ? 'act' : 'acts'} with a change that could not be assessed`,
        ]
      : []),
    ...(deferred > 0
      ? [`${deferred} ${deferred === 1 ? 'change' : 'changes'} left for the next run, out of time`]
      : []),
  ];
  return `${outcomes.length} acts: ${count('checked')} checked, ${recorded} new ${recorded === 1 ? 'change' : 'changes'}, ${count('failed')} failed, ${skipped.length} skipped${skipped.length > 0 ? ` (${skipped.map((outcome) => outcome.act.id).join(', ')})` : ''}.${assessing.length > 0 ? ` ${assessing.join('; ')}.` : ''}`;
}

export function summarize(outcomes: ActOutcome[]) {
  return [...outcomes.map(describeOutcome), tally(outcomes)].join('\n');
}
