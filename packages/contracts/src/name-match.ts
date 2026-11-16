import { foldText } from './fold-text';
import { companyName, withoutInsideForms } from './legal-forms';

const marks = /\p{M}/gu;
const honorifics = /(?<![\p{L}\p{N}])(?:d-na|d-l|dl)(?![\p{L}\p{N}])/gu;

// A name that is nothing but a legal form keeps it, or every such name would be the same.
export function foldName(value: string) {
  const plain = value.normalize('NFD').toLowerCase().replace(marks, '').replace(honorifics, ' ');
  const words = withoutInsideForms(plain);
  return words.length > 0 ? words.join(' ') : foldText(plain);
}

export function nameTokens(value: string) {
  return new Set(foldName(value).split(' ').filter(Boolean));
}

function shared(x: ReadonlySet<string>, y: ReadonlySet<string>) {
  if (x.size === 0 || y.size === 0) return 0;
  return [...x].filter((token) => y.has(token)).length / Math.max(x.size, y.size);
}

export function similar(a: string, b: string) {
  return shared(nameTokens(a), nameTokens(b));
}

// No prefix rule, which is for workplaces: "Protect SRL" is not "Protecție Construct SRL".
export function sameName(a: string, b: string) {
  return foldName(a) === foldName(b) || similar(a, b) >= 0.8;
}

export const companyWords = (value: string) => companyName(value).words;

/**
 * Whether two names written in a client's documents are one company: the legal form aside,
 * whether initials or spelled out, but never two different forms, as "Cabinet de avocat Ionescu"
 * and "Cabinet Medical Individual Ionescu" are two offices.
 */
export function sameCompany(a: string, b: string, likeness = 0.8) {
  const x = companyName(a);
  const y = companyName(b);
  if (
    x.form &&
    y.form &&
    x.form.id !== y.form.id &&
    !x.form.standsFor.includes(y.form.id) &&
    !y.form.standsFor.includes(x.form.id)
  ) {
    return false;
  }
  return (
    x.words.join(' ') === y.words.join(' ') ||
    shared(new Set(x.words), new Set(y.words)) >= likeness
  );
}

// ANAF's name is the one to keep, so a name read in the documents is ANAF's only as written,
// its legal form included; case, diacritics, spaces and points aside.
export function sameSpelling(a: string, b: string) {
  return foldText(a).replace(/ /g, '') === foldText(b).replace(/ /g, '');
}
