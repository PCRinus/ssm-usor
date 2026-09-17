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

// "01.03.2020" for "2020-03-01"; an empty or malformed value gives an empty string.
export function formatRoDate(value: string) {
  const match = iso.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

// Parses what a person types: d.m.yyyy, dd.mm.yyyy, with dots, slashes, or dashes.
// Returns the ISO date, or null when the text is not a real calendar date.
export function parseRoDate(text: string) {
  const match = romanian.exec(text);
  if (!match) return null;
  const candidate = `${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`;
  return isoToDate(candidate) ? candidate : null;
}
