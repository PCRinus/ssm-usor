import type {
  DocumentsBehindResponseItemsItemNewestVersionKind,
  LegalActListResponseItemsItemPortalStatus,
  LegalChangeListResponseItemsItem,
  LegalChangeListResponseItemsItemAmendedUnitsItemOperation,
  LegalChangeListResponseItemsItemResolution,
} from '@/api/generated/api';

export const portalPage = (portalId: number) =>
  `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

export const kindLabels: Record<DocumentsBehindResponseItemsItemNewestVersionKind, string> = {
  legal: 'Modificare legislativă',
  correction: 'Corectură',
  layout: 'Aranjare în pagină',
};

export const resolutionLabels: Record<LegalChangeListResponseItemsItemResolution, string> = {
  open: 'În verificare',
  no_impact: 'Fără impact asupra documentelor',
  template_version: 'Șablon actualizat',
};

export const portalStatusLabel = (status: LegalActListResponseItemsItemPortalStatus) =>
  status === 'in_force' ? 'în vigoare' : status === 'repealed' ? 'abrogat' : 'neverificat';

const momentFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dayMonthFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

const timeFormat = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

export const formatMoment = (isoTimestamp: string) => momentFormat.format(new Date(isoTimestamp));
export const formatDayOf = (isoTimestamp: string) => dayFormat.format(new Date(isoTimestamp));
export const formatTimeOf = (isoTimestamp: string) => timeFormat.format(new Date(isoTimestamp));
export const momentOf = (isoTimestamp: string) =>
  `${formatDayOf(isoTimestamp)} la ${formatTimeOf(isoTimestamp)}`;

export function formatDayThisYear(isoTimestamp: string, now: number) {
  const date = new Date(isoTimestamp);
  return date.getFullYear() === new Date(now).getFullYear()
    ? dayMonthFormat.format(date)
    : dayFormat.format(date);
}

// Romanian puts "de" between a number and its noun from twenty on, except 101 to 119 and so on.
export function countOf(count: number, one: string, many: string) {
  if (count === 1) return `1 ${one}`;
  const tens = count % 100;
  return count >= 20 && (tens === 0 || tens >= 20) ? `${count} de ${many}` : `${count} ${many}`;
}

const superscriptDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';

// The portal writes "Art. 109^2" for art. 109².
export const unitName = (unit: string) =>
  unit.replace(/\^(\d+)/g, (_, digits: string) =>
    [...digits].map((digit) => superscriptDigits[Number(digit)]).join('')
  );

export const unitLabel = (unit: string) => unitName(unit).replace(/^Art\./, 'art.');

export const operationLabels: Record<
  LegalChangeListResponseItemsItemAmendedUnitsItemOperation,
  { one: string; many: string }
> = {
  modified: { one: 'Modificat', many: 'Modificate' },
  supplemented: { one: 'Completat', many: 'Completate' },
  inserted: { one: 'Introdus', many: 'Introduse' },
  repealed: { one: 'Abrogat', many: 'Abrogate' },
  other: { one: 'Schimbat', many: 'Schimbate' },
};

export function listOf(items: string[]) {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

export function changeStatus(change: LegalChangeListResponseItemsItem) {
  if (change.resolution !== 'open') return null;
  if (change.outcome === null) return 'Modificarea este în curs de analiză.';
  if (change.outcome === 'quote_differs') return 'Modifică un text citat în documente.';
  return null;
}

export function updatedDocuments(change: LegalChangeListResponseItemsItem) {
  if (change.resolution !== 'template_version') return [];
  return [...new Set(change.passages.flatMap((passage) => passage.document?.title ?? []))];
}
