import { printedDate } from '@ssm-usor/contracts';

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
