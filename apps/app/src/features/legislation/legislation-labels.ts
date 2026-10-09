import type {
  DocumentsBehindResponseItemsItemNewestVersionKind,
  LegalActListResponseItemsItemPortalStatus,
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
