import { foldText } from './fold-text';
import {
  type CompanyName,
  companyName,
  isFormInitials,
  spellingKey,
  withoutInsideForms,
} from './legal-forms';

export { namesCompany } from './legal-forms';

// A name that is nothing but a legal form keeps it, or every such name would be the same.
export function foldName(value: string) {
  return withoutInsideForms(value) || foldText(value);
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

export const hasLegalForm = (value: string) => companyName(value).form !== null;

const formsFit = (x: CompanyName, y: CompanyName) =>
  !x.form ||
  !y.form ||
  x.form.id === y.form.id ||
  x.form.standsFor.includes(y.form.id) ||
  y.form.standsFor.includes(x.form.id);

const sameWords = (x: CompanyName, y: CompanyName, likeness: number) =>
  x.words.join(' ') === y.words.join(' ') || shared(new Set(x.words), new Set(y.words)) >= likeness;

/**
 * Whether two names written in a client's documents are one company: the legal form aside,
 * whether initials or spelled out, but never two different forms, as "Cabinet de avocat Ionescu"
 * and "Cabinet Medical Individual Ionescu" are two offices. Where the forms agree, the names are
 * also compared as any name is, so reading forms only adds to what matched before. A form read
 * from a word that may be part of the name ("Alfa II", "SCM Impex") yields to the other name's
 * form when the words are otherwise the same.
 */
export function sameCompany(a: string, b: string, likeness = 0.8) {
  const x = companyName(a);
  const y = companyName(b);
  if (formsFit(x, y)) {
    return sameWords(x, y, likeness) || foldName(a) === foldName(b) || similar(a, b) >= likeness;
  }
  if (!x.bare && !y.bare) return false;
  const xAsWords = x.bare ? companyName(a, true) : x;
  const yAsWords = y.bare ? companyName(b, true) : y;
  return formsFit(xAsWords, yAsWords) && sameWords(xAsWords, yAsWords, 1);
}

// Whether nothing in two names' legal forms tells them apart.
export const formsAgree = (a: string, b: string) => sameCompany(a, b, 0);

// ANAF's name is the one to keep, so a name read in the documents is ANAF's only as written,
// its legal form included; case, diacritics, spaces, punctuation and the old "S.C." aside.
export function sameSpelling(a: string, b: string) {
  return spellingKey(a) === spellingKey(b);
}

/**
 * Whether the review offers ANAF's name against the documents' ones: none is written as ANAF
 * writes it, and they are one name, or every one is ANAF's firm written another way.
 */
export function registeredNameOffered(written: readonly string[], registered: string) {
  if (written.length === 0 || written.some((name) => sameSpelling(name, registered))) return false;
  return written.length === 1 || written.every((name) => sameCompany(name, registered));
}

const marks = /\p{M}/gu;
const wordPattern = /[\p{L}\p{N}]+/gu;
const foldWord = (word: string) => word.normalize('NFD').replace(marks, '').toLowerCase();
const allCapitals = (text: string) => text === text.toUpperCase();

/**
 * ANAF's name with the documents' diacritics and capitals where both write a word, since ANAF
 * writes capitals without diacritics and the name goes into the client's documents. A word only
 * ANAF writes follows the documents' capitals, without the diacritics nobody wrote.
 */
export function registeredNameAsWritten(registered: string, documents: string) {
  if (!sameCompany(documents, registered)) return registered;
  const written = new Map<string, string>();
  for (const word of documents.normalize('NFC').match(wordPattern) ?? []) {
    if (!written.has(foldWord(word))) written.set(foldWord(word), word);
  }
  const lowered = !allCapitals(documents);
  return registered.normalize('NFC').replace(wordPattern, (word) => {
    const asWritten = written.get(foldWord(word));
    if (asWritten) return asWritten;
    if (!lowered || !allCapitals(word) || word.length < 2 || isFormInitials(word)) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  });
}
