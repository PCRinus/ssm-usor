import type { LegalAmendedUnit, LegalChangeOutcome } from '@ssm-usor/contracts';

import type { DocumentsBehindResponseItemsItemNewestVersionKind } from '@/api/generated/api';
import { isoToDate } from '@/lib/dates';

export const portalPage = (portalId: number) =>
  `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

export const kindLabels: Record<DocumentsBehindResponseItemsItemNewestVersionKind, string> = {
  legal: 'Modificare legislativă',
  correction: 'Corectură',
  layout: 'Aranjare în pagină',
};

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dayMonthFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

const shortDayFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

const timeFormat = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

export const formatDayOf = (isoTimestamp: string) => dayFormat.format(new Date(isoTimestamp));
export const formatTimeOf = (isoTimestamp: string) => timeFormat.format(new Date(isoTimestamp));

// Read in local time, so a date-only value never moves to the day before.
export function shortDayOf(isoDate: string) {
  const date = isoToDate(isoDate);
  return date
    ? { day: shortDayFormat.format(date), year: String(date.getFullYear()) }
    : { day: isoDate, year: '' };
}

export function formatDayThisYear(isoTimestamp: string, now: number) {
  const date = new Date(isoTimestamp);
  return date.getFullYear() === new Date(now).getFullYear()
    ? dayMonthFormat.format(date)
    : dayFormat.format(date);
}

const superscriptDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';

// The portal writes "Art. 109^2" for art. 109², in a unit's name and in the law's text alike.
export const withSuperscripts = (text: string) =>
  text.replace(/\^(\d+)/g, (_, digits: string) =>
    [...digits].map((digit) => superscriptDigits[Number(digit)]).join('')
  );

export const unitLabel = (unit: string) => withSuperscripts(unit).replace(/^Art\./, 'art.');

// Nouns, not participles: a participle would have to agree with "art.", "lit." or "anexa".
export const operationLabels: Record<LegalAmendedUnit['operation'], string> = {
  modified: 'Modificări',
  supplemented: 'Completări',
  inserted: 'Introduceri',
  repealed: 'Abrogări',
  other: 'Alte schimbări',
};

export function listOf(items: string[]) {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

const openChangeSentences: Partial<Record<LegalChangeOutcome | 'unassessed', string>> = {
  unassessed: 'Modificarea nu a fost încă analizată.',
  quote_differs: 'Modifică un text citat în documente.',
  needs_review: 'Modifică un articol la care trimit documentele.',
};

export const openChangeSentence = (outcome: LegalChangeOutcome | null) =>
  openChangeSentences[outcome ?? 'unassessed'] ?? null;
