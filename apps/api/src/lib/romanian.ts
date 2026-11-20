import { printedDate } from '@ssm-usor/contracts';

// One order for posts, in the documents and in the app's lists alike.
export { byRomanianName } from '@ssm-usor/contracts/romanian';

export const collator = new Intl.Collator('ro');

export function listed(items: readonly string[]) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

const isLowerCaseLetter = (character: string) =>
  character !== character.toLocaleUpperCase('ro') &&
  character === character.toLocaleLowerCase('ro');

/**
 * A value typed to stand alone, as it reads inside a sentence: "Mecanic auto" becomes "mecanic
 * auto". A first word in capitals is an acronym and stays: "SU", "ISU Brașov".
 */
export function runOn(text: string) {
  const [first, second] = [...text];
  if (!first || !second || !isLowerCaseLetter(second)) return text;
  return first.toLocaleLowerCase('ro') + text.slice(first.length);
}

export function withoutFinalStop(text: string) {
  return text.replace(/(?<!\.)[.;]$/, '');
}

/**
 * A job title with its first word made definite where the article is a plain "-ul" after a
 * consonant ("Administrator unic" → "Administratorul unic"); null for any other ending, whose
 * article depends on a gender the title does not show.
 */
export function definiteRole(role: string) {
  const match = /^(\p{L}+)(.*)$/su.exec(role.trim());
  if (!match || !/[bcdfghjklmnprstvzșțx]$/iu.test(match[1]!)) return null;
  return `${match[1]}ul${match[2]}`;
}

const romanianDayFormat = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Bucharest',
});

/** The ISO date a timestamp falls on in Romania, which the documents are dated by. */
export function romanianDay(moment: Date | string) {
  const parts = Object.fromEntries(
    romanianDayFormat.formatToParts(new Date(moment)).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const printedDay = (moment: Date | string) => printedDate(romanianDay(moment));

const romanianHourFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Bucharest',
});

/**
 * Noon in Romania on an ISO date: the moment that stands for a day known only by its date, since
 * it falls on that date in every time zone a reader is likely to be in.
 */
export function romanianNoon(day: string) {
  const utcNoon = new Date(`${day}T12:00:00Z`);
  const offsetHours = Number(romanianHourFormat.format(utcNoon)) - 12;
  return new Date(utcNoon.getTime() - offsetHours * 3_600_000);
}

const nbsp = ' ';

/**
 * A Romanian phone number in its groups, joined by no-break spaces so it never splits across
 * lines: „0722 111 222”, „0256 123 456”, or „+40 722 111 222” when it was entered with the
 * country code. Dashes, dots, slashes, brackets and spaces typed in it go; a value that is not a
 * Romanian number prints as it was typed.
 */
export function printedPhone(value: string) {
  const typed = value.trim();
  if (!/^\+?[\d\s.\-/()]+$/.test(typed)) return value;
  const digits = typed.replace(/[^\d+]/g, '');
  const international = /^(?:\+|00)40/.exec(digits);
  const national = international ? `0${digits.slice(international[0].length)}` : digits;
  if (!/^0[237]\d{8}$/.test(national)) return value;
  const rest = national.slice(1);
  return international
    ? ['+40', rest.slice(0, 3), rest.slice(3, 6), rest.slice(6)].join(nbsp)
    : [national.slice(0, 4), national.slice(4, 7), national.slice(7)].join(nbsp);
}
