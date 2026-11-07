import { editDistance } from './match';
import type { Flag, Proposal } from './proposal';

interface Word {
  word: string;
  start: number;
  end: number;
}

const marks = /\p{M}/gu;

const fold = (word: string) => word.normalize('NFD').replace(marks, '').toLowerCase();

// Marks are part of a word, since a text kept decomposed writes "ș" as "s" and a comma below.
function wordsOf(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{M}]+/gu)]
    .map((match) => ({
      word: fold(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    }))
    .filter((word) => word.word !== '');
}

const nameKey = (words: readonly string[]) => [...words].sort().join(' ');

// Daniel and Daniela are two people, and "Mariei" is Maria declined, not misspelt.
const endsApart = (a: string, b: string) =>
  (a.length !== b.length && (a.startsWith(b) || b.startsWith(a))) ||
  a.replace(/(ei|a)$/, '') === b.replace(/(ei|a)$/, '');

function misspelt(a: string, b: string) {
  const shorter = Math.min(a.length, b.length);
  if (shorter < 4 || endsApart(a, b)) return false;
  return editDistance(a, b) <= (shorter >= 7 ? 2 : 1);
}

// Documents put the family name first or last, so the words are compared in any order.
function oneWordApart(name: readonly string[], window: readonly string[]) {
  const rest = [...name];
  const other: string[] = [];
  for (const word of window) {
    const at = rest.indexOf(word);
    if (at === -1) other.push(word);
    else rest.splice(at, 1);
  }
  return other.length === 1 && rest.length === 1 && misspelt(rest[0]!, other[0]!);
}

// Within a name only a space, a hyphen or a table's cell border stands between its words.
const joins = (text: string, before: Word, after: Word) => {
  const gap = text.slice(before.end, after.start);
  return gap.length <= 5 && !gap.includes('\n');
};

function passage(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  let from = Math.max(lineStart, start - 80);
  let to = Math.min(lineEnd, end + 80);
  while (from > lineStart && /\S/u.test(text[from - 1]!)) from--;
  while (to < lineEnd && /\S/u.test(text[to]!)) to++;
  return text.slice(from, to).trim();
}

interface Named {
  path: string;
  name: string;
}

function namesToCheck(proposal: Proposal): Named[] {
  const fields = (['legalRepresentativeName', 'contactName'] as const).flatMap((field) =>
    proposal.client[field].options.flatMap((option, index) =>
      option.otherCompanyName === null
        ? [{ path: `client.${field}.options.${index}`, name: option.value }]
        : []
    )
  );
  const people = proposal.responsiblePersons.flatMap((person, index) =>
    person.otherCompanyName === null
      ? [{ path: `responsiblePersons.${index}.fullName`, name: person.fullName }]
      : []
  );
  return [...fields, ...people];
}

function knownNames(proposal: Proposal) {
  return new Set(
    [
      ...proposal.client.legalRepresentativeName.options.map((option) => option.value),
      ...proposal.client.contactName.options.map((option) => option.value),
      ...proposal.responsiblePersons.map((person) => person.fullName),
      ...proposal.employees.map((employee) =>
        [employee.lastName, employee.firstName].filter(Boolean).join(' ')
      ),
    ].map((name) => nameKey(wordsOf(name).map((word) => word.word)))
  );
}

interface Variant {
  written: string;
  file: string;
  quote: string;
}

// `texts` holds the set-aside files too: the own instructions, which the reading never gets,
// often name the legal representative.
export function checkNameSpellings(proposal: Proposal, texts: Record<string, string>): Flag[] {
  const known = knownNames(proposal);
  const files = Object.entries(texts).map(([file, text]) => ({ file, text, words: wordsOf(text) }));
  const found = new Map<string, Map<string, Variant>>();
  const variantsOf = (name: readonly string[]) => {
    const key = nameKey(name);
    const cached = found.get(key);
    if (cached) return cached;
    const variants = new Map<string, Variant>();
    const inName = new Set(name);
    for (const { file, text, words } of files) {
      for (let start = 0; start + name.length <= words.length; start++) {
        const window = words.slice(start, start + name.length);
        if (window.filter((word) => inName.has(word.word)).length !== name.length - 1) continue;
        if (!window.every((word, index) => index === 0 || joins(text, window[index - 1]!, word))) {
          continue;
        }
        const spelt = window.map((word) => word.word);
        const variant = nameKey(spelt);
        if (known.has(variant) || variants.has(variant) || !oneWordApart(name, spelt)) continue;
        const from = window[0]!.start;
        const to = window.at(-1)!.end;
        variants.set(variant, {
          written: text.slice(from, to),
          file,
          quote: passage(text, from, to),
        });
      }
    }
    found.set(key, variants);
    return variants;
  };
  return namesToCheck(proposal).flatMap(({ path, name }): Flag[] => {
    const words = wordsOf(name).map((word) => word.word);
    if (words.length < 2) return [];
    return [...variantsOf(words).values()].map((variant) => ({
      path,
      code: 'name_spelled_differently',
      detail: variant.written,
      source: { file: variant.file, quote: variant.quote },
    }));
  });
}
