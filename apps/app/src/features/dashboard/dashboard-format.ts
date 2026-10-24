const timeZone = 'Europe/Bucharest';

const hourFormat = new Intl.DateTimeFormat('ro-RO', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone,
});
const isoDayFormat = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone,
});
const todayFormat = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone,
});
// A calendar date has no time zone, so it is read and printed as UTC to stay that day.
const dueDayFormat = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const monthNames = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];

const capitalised = (text: string) => text.charAt(0).toLocaleUpperCase('ro-RO') + text.slice(1);

// Romanian puts "de" between a number and its noun from twenty on, except 101 to 119 and so on.
export function nounFor(count: number, one: string, many: string) {
  if (count === 1) return one;
  const tens = count % 100;
  return count >= 20 && (tens === 0 || tens >= 20) ? `de ${many}` : many;
}

export const countOf = (count: number, one: string, many: string) =>
  `${count} ${nounFor(count, one, many)}`;

export function greetingAt(now: Date) {
  const hour = Number(hourFormat.format(now));
  if (hour < 12) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

// The full name is free text, typed in either order, so its first word is the one to greet.
export function firstNameOf(fullName: string | null | undefined) {
  return fullName?.trim().split(/\s+/)[0] || undefined;
}

export function summaryLine(todo: number, overdue: number) {
  const mine =
    todo === 0 ? 'Nu ai nimic de făcut' : `Ai ${countOf(todo, 'lucru', 'lucruri')} de făcut`;
  const clients =
    overdue === 0
      ? 'la clienți nu e nicio instruire depășită'
      : overdue === 1
        ? 'la clienți este o instruire depășită'
        : `la clienți sunt ${countOf(overdue, 'instruire depășită', 'instruiri depășite')}`;
  return `${mine}, iar ${clients}.`;
}

export const formatToday = (now: Date) => capitalised(todayFormat.format(now));

export const formatDueDay = (isoDate: string) =>
  dueDayFormat.format(new Date(`${isoDate}T00:00:00Z`));

const bucharestDay = (instant: Date) => Date.parse(`${isoDayFormat.format(instant)}T00:00:00Z`);

export function waitingSince(issuedAt: string, now: Date) {
  const days = Math.max(
    0,
    Math.round((bucharestDay(now) - bucharestDay(new Date(issuedAt))) / 864e5)
  );
  if (days === 0) return 'Cea mai veche așteaptă de azi';
  if (days === 1) return 'Cea mai veche așteaptă de o zi';
  return `Cea mai veche așteaptă de ${countOf(days, 'zi', 'zile')}`;
}

export function monthOf(month: string) {
  const [year = '', number = '1'] = month.split('-');
  const name = monthNames[Number(number) - 1] ?? '';
  return { year, name, short: name.slice(0, 3) };
}
