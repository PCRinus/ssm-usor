// A trial given "until 31 January" runs to the end of that day in Romania, whatever zone the
// runner is in.
export function endOfRomanianDay(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`Expected a date as YYYY-MM-DD, got ${date}.`);
  const noonUtc = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(noonUtc.getTime()) || noonUtc.toISOString().slice(0, 10) !== date) {
    throw new Error(`${date} is not a calendar date.`);
  }
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    timeZoneName: 'longOffset',
  })
    .formatToParts(noonUtc)
    .find((part) => part.type === 'timeZoneName')!
    .value.replace('GMT', '');
  return new Date(`${date}T23:59:59${offset}`);
}
