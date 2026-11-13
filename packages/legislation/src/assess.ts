import { fetchActForm, type FetchedActText, fetchPublishedForm } from './act-text';
import {
  type AmendingAct,
  type AmendmentNote,
  type AmendmentOperation,
  notedUnit,
} from './amendments';
import type { LegislationClient } from './database';
import { type LawHunk, type UnitChange, unitLabel } from './forms';
import { assessImpact, type Impact, type ImpactOutcome } from './impact';
import type { CitedPassage } from './locator';
import { pause, PortalError, type PortalOptions, portalPauseMs } from './portal';

export type IndexedCitation = CitedPassage & {
  manifest: string;
  file: string;
  typeKey: string;
  paragraph: number;
};

export type AmendedUnit = {
  // "Art. 36 alin. (2)", as the citations label a unit.
  unit: string;
  // The portal's own words: "Alineatul (2), Articolul 36".
  subject: string;
  operation: AmendmentOperation;
  date: string;
  amendingAct: string | null;
};

export type ChangePassage = {
  manifest: string;
  file: string;
  typeKey: string;
  paragraph: number;
  form: CitedPassage['form'];
  locator: string | null;
  article: string | null;
  unit: string;
  status: Exclude<UnitChange['status'], 'unchanged'>;
  // The law's text of the unit in the verified form and in the new one.
  old: string | null;
  new: string | null;
  hunks: LawHunk[];
};

export type ChangeAssessment = {
  changeId: string;
  consolidatedOn: string;
  // The consolidated form the new one was compared with; null for the act as published.
  comparedWith: string | null;
  // False when no earlier form could be read, so nothing was compared.
  compared: boolean;
  // Recorded on an earlier run and assessed only now.
  backfilled: boolean;
  outcome: ImpactOutcome;
  // A change with no impact is resolved in the run that assesses it.
  resolved: boolean;
  note: string | null;
  amendingActs: AmendingAct[];
  amendedUnits: AmendedUnit[];
  review: string[];
  passages: ChangePassage[];
};

export type PendingChange = {
  id: string;
  consolidatedOn: string;
  backfilled: boolean;
  seenAt: string;
};

// A change whose assessment has failed for this long is left to a person, so that an act the
// check cannot compare never blocks the act's newer changes.
export const assessmentRetryMs = 3 * 24 * 60 * 60 * 1000;

export function unassessed(change: PendingChange, reason: string): ChangeAssessment {
  return {
    changeId: change.id,
    consolidatedOn: change.consolidatedOn,
    comparedWith: null,
    compared: false,
    backfilled: change.backfilled,
    outcome: 'needs_review',
    resolved: false,
    note: null,
    amendingActs: [],
    amendedUnits: [],
    review: [
      `The check could not assess it in any run since ${change.seenAt.slice(0, 10)}: ${reason}`,
    ],
    passages: [],
  };
}

export type ReadForm = (
  portalId: number,
  // Null for the act as published.
  on: string | null
) => Promise<Pick<FetchedActText, 'formPortalId' | 'consolidatedOn' | 'kind' | 'forms' | 'text'>>;

export function amendedUnitsOf(notes: AmendmentNote[]): AmendedUnit[] {
  const seen = new Map<string, AmendedUnit>();
  for (const note of notes) {
    const unit = unitLabel(notedUnit(note)) || note.subject;
    const key = `${unit}\u0000${note.operation}\u0000${note.date}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      unit,
      subject: note.subject,
      operation: note.operation,
      date: note.date,
      amendingAct: note.amendingAct?.name ?? null,
    });
  }
  return [...seen.values()];
}

// The index can list one citation twice; a passage is stored once per citation and unit.
export function passagesOf(impact: Impact<IndexedCitation>): ChangePassage[] {
  const passages = impact.citations.flatMap((result) =>
    result.status === 'unaffected'
      ? []
      : result.units.flatMap((change): ChangePassage[] =>
          change.status === 'unchanged'
            ? []
            : [
                {
                  manifest: result.citation.manifest,
                  file: result.citation.file,
                  typeKey: result.citation.typeKey,
                  paragraph: result.citation.paragraph,
                  form: result.citation.form,
                  locator: result.citation.locator,
                  article: result.citation.article,
                  unit: change.unit.label,
                  status: change.status,
                  old:
                    change.status === 'changed' ||
                    change.status === 'repealed' ||
                    change.status === 'uncompared'
                      ? change.old
                      : null,
                  new:
                    change.status === 'changed' ||
                    change.status === 'added' ||
                    change.status === 'uncompared'
                      ? change.new
                      : null,
                  hunks: change.status === 'changed' ? change.hunks : [],
                },
              ]
        )
  );
  const key = (passage: ChangePassage) =>
    [passage.manifest, passage.file, passage.paragraph, passage.form, passage.unit].join('\u0000');
  return [...new Map(passages.map((passage) => [key(passage), passage])).values()];
}

const superscriptDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export const readableUnit = (unit: string) =>
  (unit.charAt(0).toLowerCase() + unit.slice(1))
    .replaceAll('Art.', 'art.')
    .replace(/\^(\d+)/g, (_, digits: string) =>
      [...digits].map((digit) => superscriptDigits[Number(digit)]).join('')
    );

const listedUnits = 8;

// Shown to members on the Legislație page, so in Romanian and with no names from the code.
export function noImpactNote(amendedUnits: AmendedUnit[], amendingActs: AmendingAct[]) {
  const units = [...new Set(amendedUnits.map((each) => readableUnit(each.unit)))];
  const by =
    amendingActs.length > 0 ? ` adusă de ${amendingActs.map((act) => act.name).join(', ')}` : '';
  const unchanged = 'niciun text citat în documente nu s-a schimbat.';
  if (units.length === 0) {
    return by
      ? `Modificarea${by} nu atinge niciun text citat în documente.`
      : 'Niciun text citat în documente nu s-a schimbat.';
  }
  const shown = units.slice(0, listedUnits).join(', ');
  const more = units.length > listedUnits ? ` și încă ${units.length - listedUnits}` : '';
  return `Modificarea${by} atinge ${shown}${more}; ${unchanged}`;
}

export function defaultReadForm(options: PortalOptions = {}): ReadForm {
  return (portalId, on) =>
    on === null ? fetchPublishedForm(portalId, options) : fetchActForm(portalId, on, options);
}

// A page with no text of the act as published can never be compared; a page that could not be
// fetched may be read on the next run.
const unreadable = (error: unknown) =>
  error instanceof PortalError && error.failure.kind === 'parse';

async function earlierForm(
  portalId: number,
  verifiedOn: string | null,
  readForm: ReadForm,
  pauseMs: number
) {
  await pause(pauseMs);
  if (verifiedOn !== null) return { form: await readForm(portalId, verifiedOn), unread: null };
  // An act with no verified form is compared with the act as published: the templates were
  // checked against its text, and a never-consolidated act has no other.
  try {
    return { form: await readForm(portalId, null), unread: null };
  } catch (error) {
    if (!unreadable(error)) throw error;
    return { form: null, unread: (error as Error).message };
  }
}

export async function assessChange({
  act,
  change,
  verifiedOn,
  citations,
  readForm,
  pauseMs = portalPauseMs,
}: {
  act: { id: string; portalId: number };
  change: PendingChange;
  verifiedOn: string | null;
  citations: IndexedCitation[];
  readForm: ReadForm;
  pauseMs?: number;
}): Promise<ChangeAssessment> {
  const { form: verified, unread } = await earlierForm(act.portalId, verifiedOn, readForm, pauseMs);
  await pause(pauseMs);
  const current = await readForm(act.portalId, change.consolidatedOn);
  // Comparing another form than the change's would put a wrong outcome on it.
  if (current.consolidatedOn !== change.consolidatedOn) {
    throw new PortalError(
      `Act ${act.portalId} has no form of ${change.consolidatedOn} to compare; the nearest is ${current.consolidatedOn ?? 'the act as published'}.`
    );
  }
  const impact = assessImpact({
    actId: act.id,
    citations,
    verified,
    current,
  });
  const review =
    unread === null
      ? impact.review
      : [
          `The act has no verified form and the act as published could not be read (${unread}), so nothing was compared.`,
        ];
  const amendedUnits = amendedUnitsOf(impact.amendedUnits);
  const resolved = impact.outcome === 'no_impact';
  return {
    changeId: change.id,
    consolidatedOn: change.consolidatedOn,
    comparedWith: verified?.consolidatedOn ?? null,
    compared: verified !== null,
    backfilled: change.backfilled,
    outcome: impact.outcome,
    resolved,
    note: resolved ? noImpactNote(amendedUnits, impact.amendingActs) : null,
    amendingActs: impact.amendingActs,
    amendedUnits,
    review,
    passages: passagesOf(impact),
  };
}

// The outcome is written last: a run that stops before it leaves the change unassessed, and the
// next run assesses it again from the start. Once it is written the change is assessed, whatever
// follows: a verified form that could not be advanced comes back as a warning.
export async function storeAssessment(
  db: LegislationClient,
  actId: string,
  assessment: ChangeAssessment,
  now = new Date().toISOString()
): Promise<{ advanced: boolean; warning: string | null }> {
  const cleared = await db
    .from('legal_change_passages')
    .delete()
    .eq('change_id', assessment.changeId);
  if (cleared.error) {
    throw new Error(`Could not clear the passages of the change: ${cleared.error.message}`);
  }
  if (assessment.passages.length > 0) {
    const inserted = await db.from('legal_change_passages').insert(
      assessment.passages.map((passage) => ({
        change_id: assessment.changeId,
        manifest: passage.manifest,
        template_file: passage.file,
        type_key: passage.typeKey,
        paragraph: passage.paragraph,
        citation_form: passage.form,
        locator: passage.locator,
        article: passage.article,
        unit_label: passage.unit,
        status: passage.status,
        old_text: passage.old,
        new_text: passage.new,
        hunks: passage.hunks,
      }))
    );
    if (inserted.error) {
      throw new Error(`Could not store the passages of the change: ${inserted.error.message}`);
    }
  }
  const updated = await db
    .from('legal_changes')
    .update({
      outcome: assessment.outcome,
      compared_with: assessment.comparedWith,
      amending_acts: assessment.amendingActs,
      amended_units: assessment.amendedUnits,
      review: assessment.review,
      assessed_at: now,
      ...(assessment.resolved && {
        resolution: 'no_impact',
        resolved_at: now,
        resolved_by_note: assessment.note,
      }),
    })
    .eq('id', assessment.changeId)
    .eq('resolution', 'open')
    .is('outcome', null)
    .select('id');
  if (updated.error) {
    throw new Error(`Could not store the outcome of the change: ${updated.error.message}`);
  }
  if (!assessment.resolved || !updated.data?.length) return { advanced: false, warning: null };
  const advanced = await db
    .from('legal_acts')
    .update({ verified_consolidated_on: assessment.consolidatedOn })
    .eq('id', actId)
    .or(
      `verified_consolidated_on.is.null,verified_consolidated_on.lt.${assessment.consolidatedOn}`
    );
  if (advanced.error) {
    return {
      advanced: false,
      warning: `Could not advance the verified form to ${assessment.consolidatedOn}: ${advanced.error.message}`,
    };
  }
  return { advanced: true, warning: null };
}

export async function pendingChanges(db: LegislationClient) {
  const found = await db
    .from('legal_changes')
    .select('id, act_id, consolidated_on, seen_at')
    .eq('resolution', 'open')
    .is('outcome', null)
    .order('consolidated_on');
  if (found.error) {
    throw new Error(`Could not read the changes not yet assessed: ${found.error.message}`);
  }
  const byAct = new Map<string, PendingChange[]>();
  for (const row of found.data) {
    const list = byAct.get(row.act_id) ?? [];
    list.push({
      id: row.id,
      consolidatedOn: row.consolidated_on,
      backfilled: true,
      seenAt: row.seen_at,
    });
    byAct.set(row.act_id, list);
  }
  return byAct;
}
