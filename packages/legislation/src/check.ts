import { z } from 'zod';

import type { LegislationClient, LegislationTables } from './database';
import { fetchPortalAct, pause, type PortalAct, portalPauseMs } from './portal';

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
  'id' | 'last_consolidated_on' | 'verified_consolidated_on'
>;

export type ActOutcome =
  | { act: LegalAct; result: 'skipped' }
  | { act: LegalAct; result: 'failed'; error: string }
  | {
      act: LegalAct;
      result: 'checked';
      portal: PortalAct;
      // Null when nothing newer than the last form seen, or than the verified one, is on the portal.
      change: { consolidatedOn: string; amendingAct: string | null; recorded: boolean } | null;
    };

// Without a form seen before or a verification date, the first form seen is the baseline.
export function isNewer(newest: string | null, row: ActRow) {
  if (newest === null) return false;
  const { last_consolidated_on: last, verified_consolidated_on: verified } = row;
  return (last !== null && newest > last) || (verified !== null && newest > verified);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type CheckOptions = { readAct?: (portalId: number) => Promise<PortalAct>; pauseMs?: number };

export async function checkLegislation(
  db: LegislationClient,
  acts: LegalAct[],
  options: CheckOptions = {}
) {
  const readAct = options.readAct ?? ((portalId: number) => fetchPortalAct(portalId));
  const upserted = await db
    .from('legal_acts')
    .upsert(acts.map((act) => ({ id: act.id, name: act.name, portal_id: act.portalId })))
    .select('id, last_consolidated_on, verified_consolidated_on');
  if (upserted.error) throw new Error(`Could not save the acts: ${upserted.error.message}`);
  const rows = new Map(upserted.data.map((row) => [row.id, row]));

  const outcomes: ActOutcome[] = [];
  let first = true;
  for (const act of acts) {
    const row = rows.get(act.id);
    if (act.portalId === null) {
      outcomes.push({ act, result: 'skipped' });
      continue;
    }
    if (!row) {
      outcomes.push({ act, result: 'failed', error: 'the act was not saved' });
      continue;
    }
    // A government site with no API: one act at a time, with a pause between them.
    if (!first) await pause(options.pauseMs ?? portalPauseMs);
    first = false;
    try {
      const portal = await readAct(act.portalId);
      if (portal.newestConsolidation === null && row.last_consolidated_on !== null) {
        throw new Error(
          `The page lists no consolidated form, where ${row.last_consolidated_on} was seen before.`
        );
      }
      outcomes.push(await checkAct(db, act, row, portal));
    } catch (error) {
      outcomes.push({ act, result: 'failed', error: message(error) });
    }
  }
  return outcomes;
}

async function checkAct(
  db: LegislationClient,
  act: LegalAct,
  row: ActRow,
  portal: PortalAct
): Promise<ActOutcome> {
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
  return { act, result: 'checked', portal, change };
}

const statusWords = { in_force: 'in force', repealed: 'REPEALED' } as const;

export function summarize(outcomes: ActOutcome[]) {
  const lines = outcomes.map((outcome) => {
    const label = `${outcome.act.id.padEnd(18)} ${outcome.act.name}:`;
    if (outcome.result === 'skipped') return `${label} skipped, no portal id`;
    if (outcome.result === 'failed') return `${label} FAILED, ${outcome.error}`;
    const { portal, change } = outcome;
    const form = portal.newestConsolidation
      ? `consolidated ${portal.newestConsolidation}${portal.amendingActs.length > 0 ? ` after ${portal.amendingActs.join(', ')}` : ''}`
      : 'never consolidated';
    const news = !change
      ? 'no change'
      : change.recorded
        ? `NEW CHANGE ${change.consolidatedOn}`
        : `change ${change.consolidatedOn} already recorded`;
    return `${label} ${statusWords[portal.status]}, ${form}; ${news}`;
  });
  const count = (result: ActOutcome['result']) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const recorded = outcomes.filter(
    (outcome) => outcome.result === 'checked' && outcome.change?.recorded
  ).length;
  const skipped = outcomes.filter((outcome) => outcome.result === 'skipped');
  lines.push(
    `${outcomes.length} acts: ${count('checked')} checked, ${recorded} new ${recorded === 1 ? 'change' : 'changes'}, ${count('failed')} failed, ${skipped.length} skipped${skipped.length > 0 ? ` (${skipped.map((outcome) => outcome.act.id).join(', ')})` : ''}.`
  );
  return lines.join('\n');
}
