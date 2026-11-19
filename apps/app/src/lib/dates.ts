// Calendar dates travel as ISO strings (YYYY-MM-DD) and are shown as Romanian dd.mm.yyyy.
// Conversions use local date components, never UTC, so a picked day stays that day.

const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
const romanian = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/;

const pad = (value: number) => String(value).padStart(2, '0');

export function dateToIso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoToDate(value: string) {
  const match = iso.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateToIso(date) === value ? date : undefined;
}

export const isOptionalIsoDate = (value: string) => value === '' || isoToDate(value) !== undefined;

export function formatRoDate(value: string) {
  const match = iso.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

// The day a moment falls on where the reader is, not in UTC.
export const formatRoDateOf = (timestamp: string) => formatRoDate(dateToIso(new Date(timestamp)));

export const todayIso = () => dateToIso(new Date());

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const formatDay = (isoTimestamp: string) => dayFormat.format(new Date(isoTimestamp));

export const shortDayMonthFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
});

export const dayMonthFormat = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

export const longDateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const timeFormat = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

export function parseRoDate(text: string) {
  const match = romanian.exec(text);
  if (!match) return null;
  const candidate = `${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
  return isoToDate(candidate) ? candidate : null;
}
