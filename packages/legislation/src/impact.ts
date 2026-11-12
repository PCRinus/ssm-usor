import type { ActText } from './act-text';
import type { AmendingAct, AmendmentNote } from './amendments';
import { citedUnits, compareUnit, type UnitChange } from './forms';
import type { CitedPassage } from './locator';

export type ComparedForm = {
  // Null for an act never consolidated, read as published.
  consolidatedOn: string | null;
  text: ActText;
};

export type CitationImpact<C extends CitedPassage = CitedPassage> =
  | { citation: C; status: 'unaffected'; units: UnitChange[] }
  // A quoted unit's law text changed; `units` holds the changed ones, with the law's hunks.
  | { citation: C; status: 'quote_differs'; units: UnitChange[] }
  | { citation: C; status: 'reference_touched'; units: UnitChange[] }
  // A cited unit repealed in the new form, or found in neither.
  | { citation: C; status: 'unit_missing'; units: UnitChange[] };

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
  const forms = { verified: verified.text, current: current.text };
  const compared = new Map<string, UnitChange>();
  const changeOf = (unit: UnitChange['unit']) => {
    if (!compared.has(unit.label)) compared.set(unit.label, compareUnit(forms, unit));
    return compared.get(unit.label)!;
  };
  const results = citations
    .filter((citation) => citation.act === actId)
    .map((citation): CitationImpact<C> => {
      const units = citedUnits(forms, citation).map(changeOf);
      const quoted = citation.form === 'quote' && Boolean(citation.text?.trim());
      if (units.some(lost)) return { citation, status: 'unit_missing', units };
      if (units.every(settled)) return { citation, status: 'unaffected', units };
      return quoted
        ? { citation, status: 'quote_differs', units: units.filter((unit) => !settled(unit)) }
        : { citation, status: 'reference_touched', units: units.filter((unit) => !settled(unit)) };
    });
  const review = [
    ...new Set(
      results.flatMap((result) =>
        result.status === 'reference_touched'
          ? result.units.map((unit) => `${unit.unit.label} is referred to and was ${unit.status}.`)
          : result.status === 'unit_missing'
            ? result.units
                .filter(lost)
                .map((unit) =>
                  unit.status === 'repealed'
                    ? `${unit.unit.label} is cited and was repealed.`
                    : `${unit.unit.label} is cited and is in neither form.`
                )
            : []
      )
    ),
  ];
  const outcome: ImpactOutcome = results.some((result) => result.status === 'quote_differs')
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
