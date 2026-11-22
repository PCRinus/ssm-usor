import {
  countOf,
  type DocumentSet,
  type LegalChangeOutcome,
  numberedTitle,
} from '@ssm-usor/contracts';

import { listOf, unitLabel } from './legislation-labels';
import { documentsTabOf } from './legislation-sections';

type ChangeDocument = { typeKey: string; title: string; set: DocumentSet };

const setNames: Record<DocumentSet, string> = { occupational_safety: 'SSM', fire_safety: 'SU' };

const unitsShown = 4;
const documentsShown = 3;

export function unitsText(units: readonly string[]) {
  const shown = units.slice(0, unitsShown).map(unitLabel);
  const more = units.length - shown.length;
  return more > 0 ? `${shown.join(', ')} și încă ${more}` : listOf(shown);
}

const underReviewSentences: Partial<Record<LegalChangeOutcome, string>> = {
  quote_differs: 'Modifică un text citat în documente',
  needs_review: 'Modifică un articol la care trimit documentele',
};

// The act heads the row, so the sentence needs no "Modificarea" of its own, unlike the acts table.
export function underReviewSentence(outcome: LegalChangeOutcome | null, units: readonly string[]) {
  if (outcome === null) return 'Nu a fost încă analizată.';
  const sentence = underReviewSentences[outcome];
  if (!sentence) return null;
  return units.length > 0 ? `${sentence}: ${unitsText(units)}.` : `${sentence}.`;
}

// Past a few titles the line counts per set: an act like Legea 319/2006 is cited by a dozen.
export function documentsText(documents: readonly ChangeDocument[]) {
  if (documents.length <= documentsShown) {
    return documents.map((document) => numberedTitle(document.typeKey, document.title)).join(', ');
  }
  return (['occupational_safety', 'fire_safety'] as const)
    .map((set) => [set, documents.filter((document) => document.set === set).length] as const)
    .filter(([, count]) => count > 0)
    .map(([set, count]) =>
      countOf(count, `document ${setNames[set]}`, `documente ${setNames[set]}`)
    )
    .join(' și ');
}

export function reachOf(touched: readonly ChangeDocument[], citedBy: readonly ChangeDocument[]) {
  if (touched.length > 0) return { label: 'Atinge', text: documentsText(touched) };
  if (citedBy.length > 0) return { label: 'Poate atinge', text: documentsText(citedBy) };
  return null;
}

export const behindText = (documents: number) =>
  countOf(documents, 'document de actualizat', 'documente de actualizat');

// Both sets behind: the SSM tab, which the page opens on too.
export const behindTabOf = (types: readonly { set: DocumentSet }[]) =>
  documentsTabOf(
    types.length > 0 && types.every((type) => type.set === 'fire_safety')
      ? 'fire_safety'
      : 'occupational_safety'
  );

export const appliedSentence = (change: {
  note: string | null;
  updatedDocuments: readonly { note: string | null }[];
}) => change.note ?? change.updatedDocuments.find((document) => document.note)?.note ?? null;
