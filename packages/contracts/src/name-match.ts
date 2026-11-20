import { foldText } from './fold-text';
import {
  type CompanyName,
  companyName,
  formWordAsWritten,
  spellingKey,
  withoutInsideForms,
} from './legal-forms';
import { capitalized } from './romanian';

export { namesCompany, withLegalFormsKept } from './legal-forms';

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
 * also compared as any name is, so they still match wherever they matched before the forms were
 * read. A form read from a word that may be part of the name ("Alfa II", "SCM Impex") yields to
 * the other name's form when the words are otherwise the same.
 */
export function sameCompany(a: string, b: string, likeness = 0.8) {
  const x = companyName(a);
  const y = companyName(b);
  if (formsFit(x, y)) {
    return sameWords(x, y, likeness) || foldName(a) === foldName(b) || similar(a, b) >= likeness;
  }
  const readings = (value: string, read: CompanyName) =>
    read.bare ? [read, companyName(value, true)] : [read];
  return readings(a, x).some((xRead) =>
    readings(b, y).some(
      (yRead) =>
        (xRead !== x || yRead !== y) && formsFit(xRead, yRead) && sameWords(xRead, yRead, 1)
    )
  );
}

export const formsAgree = (a: string, b: string) => sameCompany(a, b, 0);

// ANAF's name is the one to keep, so a name read in the documents is ANAF's only as written,
// its legal form included; case, diacritics, spaces, punctuation and the old "S.C." aside.
export function sameSpelling(a: string, b: string) {
  return spellingKey(a) === spellingKey(b);
}

// Not while a document writes ANAF's name, nor between names that are a real choice.
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
 * writes capitals without diacritics and the name goes into the client's documents. A word of
 * the form that only ANAF writes is spelled as the form is, in the documents' capitals.
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
    const formWord = lowered && allCapitals(word) ? formWordAsWritten(word) : undefined;
    return formWord ? capitalized(formWord) : word;
  });
}
