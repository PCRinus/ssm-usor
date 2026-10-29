import { normalizeCui } from '@ssm-usor/contracts';

const marks = /\p{M}/gu;
const wordCharacter = /[\p{L}\p{N}]/u;

function foldCharacter(character: string) {
  return character.normalize('NFD').toLowerCase().replace(marks, '');
}

export function foldText(value: string) {
  return value
    .normalize('NFD')
    .toLowerCase()
    .replace(marks, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function foldName(value: string) {
  return foldText(
    value
      .normalize('NFD')
      .replace(marks, '')
      .toLowerCase()
      .replace(/\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|d-na|dl\.?|d-l)(?=\s|$|[^\p{L}])/gu, ' ')
  );
}

function nameTokens(value: string) {
  return new Set(foldName(value).split(' ').filter(Boolean));
}

export function similar(a: string, b: string) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  const shared = [...x].filter((token) => y.has(token)).length;
  return shared / Math.max(x.size, y.size);
}

// A prefix counts as found, so "Sediu social" is in "Sediul social al societății".
export function contained(a: string, b: string) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  const shorter = x.size <= y.size ? x : y;
  const longer = shorter === x ? y : x;
  const shared = [...shorter].filter(
    (token) =>
      longer.has(token) ||
      [...longer].some((other) => other.startsWith(token) || token.startsWith(other))
  ).length;
  return shared / shorter.size;
}

// No prefix rule, which is for workplaces: "Protect SRL" is not "Protecție Construct SRL".
export function sameName(a: string, b: string) {
  return foldName(a) === foldName(b) || similar(a, b) >= 0.8;
}

const cuiLabel =
  /^(c\.?\s*u\.?\s*i\.?|c\.?\s*i\.?\s*f\.?|cod(ul)?\s+(fiscal|unic\s+de\s+inregistrare|de\s+identificare\s+fiscala))(\s*\/\s*(c\.?\s*i\.?\s*f|c\.?\s*u\.?\s*i)\.?)?(\s*nr\.?)?\s*:?\s*/;

export function cuiDigits(written: string | null) {
  if (written === null) return null;
  const unlabelled = written
    .trim()
    .normalize('NFD')
    .replace(marks, '')
    .toLowerCase()
    .replace(cuiLabel, '');
  return normalizeCui(unlabelled)?.cui ?? null;
}

const addressWords = new Set(['str', 'strada', 'nr', 'numar', 'numarul']);

export function streetKey(addressLine: string | null) {
  if (addressLine === null) return '';
  return foldText(addressLine)
    .split(' ')
    .filter((word) => word !== '' && !addressWords.has(word))
    .join(' ');
}

export const sameAddress = (
  a: { locality: string | null; addressLine: string | null },
  b: { locality: string | null; addressLine: string | null }
) =>
  streetKey(a.addressLine) !== '' &&
  streetKey(a.addressLine) === streetKey(b.addressLine) &&
  (a.locality === null || b.locality === null || foldText(a.locality) === foldText(b.locality));

interface FoldedText {
  folded: string;
  starts: number[];
  ends: number[];
}

function foldWithOffsets(text: string): FoldedText {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of text) {
    const end = offset + character.length;
    for (const piece of foldCharacter(character)) {
      if (wordCharacter.test(piece)) {
        folded += piece;
        starts.push(offset);
        ends.push(end);
      } else if (folded.length > 0 && !folded.endsWith(' ')) {
        folded += ' ';
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { folded, starts, ends };
}

export interface QuoteMatch {
  start: number;
  end: number;
}

export interface FoundQuote extends QuoteMatch {
  // Where each part of a quote with an ellipsis is, the words left out between them.
  parts: QuoteMatch[];
}

function wordIndex(
  haystack: string,
  needle: string,
  from: number,
  bounded: { start: boolean; end: boolean }
) {
  for (
    let index = haystack.indexOf(needle, from);
    index !== -1;
    index = haystack.indexOf(needle, index + 1)
  ) {
    const after = index + needle.length;
    if (
      (!bounded.start || index === 0 || haystack[index - 1] === ' ') &&
      (!bounded.end || after === haystack.length || haystack[after] === ' ')
    ) {
      return index;
    }
  }
  return -1;
}

// Models mark words they leave out of a quote with an ellipsis, so its parts are found in order,
// and only beside an ellipsis may a part start or end inside a word. A place the last part ends
// at counts once, from the latest start of the first part that still reaches it: a short first
// part, such as a post's name, also stands in a list of posts far before the passage.
export function findQuotes(text: string, quote: string): FoundQuote[] {
  const segments = quote.split(/…|\.{3,}/).map(foldText);
  const parts = segments
    .map((part, position) => ({
      part,
      bounded: { start: position === 0, end: position === segments.length - 1 },
    }))
    .filter(({ part }) => part !== '');
  const [first, ...rest] = parts;
  if (!first) return [];
  const haystack = foldWithOffsets(text);
  // A later part's first place past a position stays its first place past any later position
  // that does not pass it, so it is looked for again only once a start has gone past it.
  const reached = rest.map(() => -1);
  const found: number[][] = [];
  candidates: for (
    let start = wordIndex(haystack.folded, first.part, 0, first.bounded);
    start !== -1;
    start = wordIndex(haystack.folded, first.part, start + 1, first.bounded)
  ) {
    let end = start + first.part.length;
    for (const [index, { part, bounded }] of rest.entries()) {
      if (reached[index]! < end) reached[index] = wordIndex(haystack.folded, part, end, bounded);
      if (reached[index] === -1) break candidates;
      end = reached[index]! + part.length;
    }
    const starts = [start, ...reached];
    if (found.at(-1)?.at(-1) === starts.at(-1)) found[found.length - 1] = starts;
    else found.push(starts);
  }
  return found.map((starts) => {
    const spans = starts.map((start, index) => ({
      start: haystack.starts[start]!,
      end: haystack.ends[start + parts[index]!.part.length - 1]!,
    }));
    return { start: spans[0]!.start, end: spans.at(-1)!.end, parts: spans };
  });
}

export function findQuote(text: string, quote: string): QuoteMatch | null {
  const found = findQuotes(text, quote)[0];
  return found ? { start: found.start, end: found.end } : null;
}

export interface PlacedQuote extends FoundQuote {
  // Which of the texts the quote is in, as a PDF's pages.
  textIndex: number;
}

// A row of a table may repeat under the headings of several posts, so the place of a quote is
// the one that follows `near` (the post's name) most closely; without `near`, or when nothing
// comes before it, the first. The texts are read as one, a heading on one page heading the next.
export function placeQuote(
  texts: readonly string[],
  quote: string,
  near?: string | null
): PlacedQuote | null {
  const marks: number[] = [];
  const found: { place: PlacedQuote; end: number }[] = [];
  let offset = 0;
  for (const [textIndex, text] of texts.entries()) {
    for (const match of findQuotes(text, quote)) {
      found.push({ place: { ...match, textIndex }, end: offset + match.end });
    }
    if (near) for (const mark of findQuotes(text, near)) marks.push(offset + mark.start);
    offset += text.length + 1;
  }
  let best = found[0];
  let closest = Infinity;
  for (const each of found) {
    const mark = marks.filter((start) => start < each.end).at(-1);
    if (mark !== undefined && each.end - mark < closest) {
      best = each;
      closest = each.end - mark;
    }
  }
  return best?.place ?? null;
}
