import type { Release } from '@/api/generated/api';
import { countOf } from '@/features/legislation/legislation-labels';

const timeZone = 'Europe/Bucharest';

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone,
});
const dayMonthFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  timeZone,
});
const weekdayFormat = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone,
});
const monthFormat = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric', timeZone });
const listFormat = new Intl.ListFormat('ro-RO', { type: 'conjunction' });
const yearFormat = new Intl.DateTimeFormat('ro-RO', { year: 'numeric', timeZone });

export const formatReleaseDay = (isoTimestamp: string) => dayFormat.format(new Date(isoTimestamp));

export const formatReleaseWeekday = (isoTimestamp: string) =>
  weekdayFormat.format(new Date(isoTimestamp));

export function formatReleaseMonth(isoTimestamp: string) {
  const month = monthFormat.format(new Date(isoTimestamp));
  return month.charAt(0).toLocaleUpperCase('ro-RO') + month.slice(1);
}

export function formatReleaseDayBeside(isoTimestamp: string, besideIsoTimestamp: string) {
  const sameYear =
    yearFormat.format(new Date(isoTimestamp)) === yearFormat.format(new Date(besideIsoTimestamp));
  return sameYear ? dayMonthFormat.format(new Date(isoTimestamp)) : formatReleaseDay(isoTimestamp);
}

// The tag is the release's date in Bucharest (ADR 025), so it needs no time zone.
export function tagCalendar(tag: string) {
  const [year = '', month = '1'] = tag.split('.');
  return { year, month: Number(month) };
}

export type ReleaseKind = 'features' | 'improvements' | 'fixes';

export const kindTitles: Record<ReleaseKind, string> = {
  features: 'Ce e nou',
  improvements: 'Îmbunătățiri',
  fixes: 'Remedieri',
};

export const newCount = (count: number) => countOf(count, 'nouă', 'noi');
export const improvementCount = (count: number) => countOf(count, 'îmbunătățire', 'îmbunătățiri');
export const fixCount = (count: number) => countOf(count, 'remediere', 'remedieri');
export const noveltyCount = (count: number) => countOf(count, 'noutate', 'noutăți');

const featureLimit = 3;
const rowLimit = 4;

// Splits the free rows between improvements and fixes so that neither group crowds the other out.
function shareRows(rows: number, improvements: number, fixes: number) {
  const fromImprovements = Math.min(improvements, Math.max(Math.ceil(rows / 2), rows - fixes));
  return [fromImprovements, Math.min(fixes, rows - fromImprovements)] as const;
}

export function dialogHighlights(release: Release) {
  const features = release.features.slice(0, featureLimit);
  const [improvementRows, fixRows] = shareRows(
    rowLimit - features.length,
    release.improvements.length,
    release.fixes.length
  );
  const improvements = release.improvements.slice(0, improvementRows);
  const fixes = release.fixes.slice(0, fixRows);
  const rest = [
    { count: release.features.length - features.length, label: noveltyCount },
    { count: release.improvements.length - improvements.length, label: improvementCount },
    { count: release.fixes.length - fixes.length, label: fixCount },
  ]
    .filter(({ count }) => count > 0)
    .map(({ count, label }) => label(count));
  return {
    features,
    improvements,
    fixes,
    rest: rest.length > 0 ? `și încă ${listFormat.format(rest)}` : null,
  };
}
