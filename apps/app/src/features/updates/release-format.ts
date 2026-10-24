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

export const newCount = (count: number) => countOf(count, 'nouă', 'noi');
export const improvementCount = (count: number) => countOf(count, 'îmbunătățire', 'îmbunătățiri');
export const fixCount = (count: number) => countOf(count, 'remediere', 'remedieri');

const highlightLimit = 3;

export function dialogHighlights(release: Release) {
  const lines = [...release.improvements, ...release.fixes];
  if (release.features.length > 0) {
    const features = release.features.slice(0, highlightLimit);
    return {
      features,
      lines: [],
      more: release.features.length - features.length + lines.length,
    };
  }
  const shown = lines.slice(0, highlightLimit);
  return { features: [], lines: shown, more: lines.length - shown.length };
}
