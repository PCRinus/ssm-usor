import { type ActText, type ConsolidatedForm, plainLabel } from './act-text';
import { type AmendingAct, type AmendmentNote, notedUnit, type UnitPath } from './amendments';
import { type CitedUnit, citedUnits, compareUnit, type UnitChange } from './forms';
import type { CitedPassage } from './locator';

export type ComparedForm = {
  // The page the form was read from; the act's own for its newest form and for the act as
  // published, told apart by `consolidatedOn`.
  formPortalId: number;
  // Null for the act as published.
  consolidatedOn: string | null;
  text: ActText;
  // The act's consolidated and republished forms, newest first, as the form's page lists them.
  forms: ConsolidatedForm[];
};

export type CitationImpact<C extends CitedPassage = CitedPassage> =
  | { citation: C; status: 'unaffected'; units: UnitChange[] }
  // A quoted unit's law text changed; `units` holds the changed ones, with the law's hunks.
  | { citation: C; status: 'quote_differs'; units: UnitChange[] }
  | { citation: C; status: 'reference_touched'; units: UnitChange[] }
  // A cited unit repealed in the new form, or found in neither.
  | { citation: C; status: 'unit_missing'; units: UnitChange[] }
  // A cited unit whose text could not be compared.
  | { citation: C; status: 'uncompared'; units: UnitChange[] };

export type ImpactOutcome = 'no_impact' | 'quote_differs' | 'needs_review';

export type Impact<C extends CitedPassage = CitedPassage> = {
  outcome: ImpactOutcome;
  // Why a person should look, whatever the outcome: a quote that differs is fixed by a pull
  // request, while a reference touched in the same change still needs reading.
  review: string[];
  citations: CitationImpact<C>[];
  units: UnitChange[];
  amendedUnits: AmendmentNote[];
  amendingActs: AmendingAct[];
};

const settled = (change: UnitChange) => change.status === 'unchanged';
const lost = (change: UnitChange) => change.status === 'repealed' || change.status === 'missing';
const uncompared = (change: UnitChange) => change.status === 'uncompared';

const unitKey = (unit: CitedUnit) =>
  JSON.stringify([unit.annex, unit.article, unit.alineat, unit.letter, unit.point]);

const levels = ['article', 'alineat', 'letter', 'point'] as const;

// The note's unit, the cited one, or one holding the other.
function touches(noted: UnitPath, unit: CitedUnit) {
  if (noted.annex === null && levels.every((level) => noted[level] === null)) return false;
  if (noted.annex !== unit.annex) return false;
  return levels.every(
    (level) =>
      noted[level] === null ||
      unit[level] === null ||
      plainLabel(noted[level]) === plainLabel(unit[level])
  );
}

function reasonFor(change: UnitChange) {
  const label = change.unit.label;
  switch (change.status) {
    case 'repealed':
      return `${label} is cited and was repealed.`;
    case 'missing':
      return `${label} is cited and is in neither form.`;
    case 'uncompared':
      return change.reason === 'no_text'
        ? `${label} is cited and its text could not be read in both forms.`
        : `${label} is cited and is too long to compare.`;
    default:
      return `${label} is referred to and was ${change.status}.`;
  }
}

export function assessImpact<C extends CitedPassage>({
  actId,
  citations,
  verified,
  current,
}: {
  actId: string;
  citations: C[];
  // Null when no form was recorded as verified for the act.
  verified: ComparedForm | null;
  current: ComparedForm;
}): Impact<C> {
  const after = (note: AmendmentNote) =>
    !verified || verified.consolidatedOn === null || note.date > verified.consolidatedOn;
  const amendedUnits = current.text.notes
    .filter(after)
    .sort((a, b) => b.date.localeCompare(a.date));
  const amendingActs = [
    ...new Map(
      amendedUnits.flatMap((note) =>
        note.amendingAct ? [[note.amendingAct.name, note.amendingAct] as const] : []
      )
    ).values(),
  ];
  if (!verified) {
    return {
      outcome: 'needs_review',
      review: ['No form of the act is recorded as verified, so there is nothing to compare with.'],
      citations: [],
      units: [],
      amendedUnits,
      amendingActs,
    };
  }
  if (
    verified.formPortalId === current.formPortalId &&
    verified.consolidatedOn === current.consolidatedOn
  ) {
    throw new Error(
      `The verified form and the new one are the same, page ${current.formPortalId} of ${current.consolidatedOn ?? 'the act as published'}.`
    );
  }
  const forms = { verified: verified.text, current: current.text };
  const compared = new Map<string, UnitChange>();
  const changeOf = (unit: CitedUnit) => {
    const key = unitKey(unit);
    if (!compared.has(key)) compared.set(key, compareUnit(forms, unit));
    return compared.get(key)!;
  };
  const results = citations
    .filter((citation) => citation.act === actId)
    .map((citation): CitationImpact<C> => {
      const units = citedUnits(forms, citation).map(changeOf);
      const quoted = citation.form === 'quote' && Boolean(citation.text?.trim());
      if (units.some(lost)) return { citation, status: 'unit_missing', units };
      if (units.some(uncompared)) {
        return { citation, status: 'uncompared', units: units.filter(uncompared) };
      }
      if (units.every(settled)) return { citation, status: 'unaffected', units };
      return quoted
        ? { citation, status: 'quote_differs', units: units.filter((unit) => !settled(unit)) }
        : { citation, status: 'reference_touched', units: units.filter((unit) => !settled(unit)) };
    });
  // A republication may renumber the act, so the units compared may not be the ones cited.
  const republished = current.forms.filter(
    (form) =>
      form.kind === 'republication' &&
      (verified.consolidatedOn === null || form.date > verified.consolidatedOn) &&
      (current.consolidatedOn === null || form.date <= current.consolidatedOn)
  );
  // The text read the same where a note says the law changed it: trust the note.
  const noted = [...compared.values()].flatMap((change) => {
    if (change.status !== 'unchanged') return [];
    const note = amendedUnits.find((each) => touches(notedUnit(each), change.unit));
    return note
      ? [
          `${change.unit.label} is cited and reads the same, but a note says ${note.subject} was ${note.operation === 'other' ? 'amended' : note.operation} on ${note.date}.`,
        ]
      : [];
  });
  const review = [
    ...new Set([
      ...republished.map(
        (form) => `The act was republished on ${form.date}, so its numbering may have changed.`
      ),
      ...results.flatMap((result) =>
        result.status === 'unit_missing'
          ? result.units.filter(lost).map(reasonFor)
          : result.status === 'reference_touched' || result.status === 'uncompared'
            ? result.units.map(reasonFor)
            : []
      ),
      ...noted,
    ]),
  ];
  const outcome: ImpactOutcome =
    republished.length > 0
      ? 'needs_review'
      : results.some((result) => result.status === 'quote_differs')
        ? 'quote_differs'
        : review.length > 0
          ? 'needs_review'
          : 'no_impact';
  return {
    outcome,
    review,
    citations: results,
    units: [...compared.values()],
    amendedUnits,
    amendingActs,
  };
}
