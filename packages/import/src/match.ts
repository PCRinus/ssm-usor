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

// I.I. and I.F. need their first dot: a bare "II" is the number of a building ("Hala II").
export function foldName(value: string) {
  return foldText(
    value
      .normalize('NFD')
      .replace(marks, '')
      .toLowerCase()
      .replace(
        /\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|s\.?a\.?|p\.?\s?f\.?\s?a\.?|i\.\s?i\.?|i\.\s?f\.?|d-na|dl\.?|d-l)(?=\s|$|[^\p{L}])/gu,
        ' '
      )
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

// A client's documents write one street as "Str." in one place and "Calea" in another, so a
// street's type is left out of its key, at the cost of joining "Aleea X" with "Strada X".
const streetTypes = new Set([
  'str',
  'strada',
  'calea',
  'bd',
  'bdul',
  'bulevard',
  'bulevardul',
  'sos',
  'soseaua',
  'aleea',
  'piata',
  'pta',
]);

const addressAbbreviations: Record<string, string> = {
  numar: 'nr',
  numarul: 'nr',
  scara: 'sc',
  camera: 'cam',
  apartament: 'ap',
  apartamentul: 'ap',
  etaj: 'et',
  etajul: 'et',
  bloc: 'bl',
  blocul: 'bl',
};

export function streetKey(addressLine: string | null) {
  if (addressLine === null) return '';
  return foldText(addressLine)
    .replace(/(\p{N})(?=\p{L})|(\p{L})(?=\p{N})/gu, '$1$2 ')
    .replace(/(^| )(b dul|p ta)(?= |$)/g, ' ')
    .split(' ')
    .map((word) => addressAbbreviations[word] ?? word)
    .filter((word) => word !== '' && word !== 'nr' && !streetTypes.has(word))
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

const ellipsis = /…|\.{3,}/;

// Models mark words they leave out of a quote with an ellipsis, so its parts are found in order,
// and only beside an ellipsis may a part start or end inside a word. A place the last part ends
// at counts once, from the latest start of the first part that still reaches it: a short first
// part, such as a post's name, also stands in a list of posts far before the passage.
export function findQuotes(text: string, quote: string): FoundQuote[] {
  const segments = quote.split(ellipsis).map(foldText);
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

// The quote from its last ellipsis on, the row a heading and an ellipsis lead up to.
function lastPart(quote: string) {
  const segments = quote.split(ellipsis);
  let at = segments.length - 1;
  while (at > 0 && foldText(segments[at]!) === '') at -= 1;
  if (at === 0) return null;
  return `… ${segments[at]}${at < segments.length - 1 ? ' …' : ''}`;
}

const lineStartEdge = /(?:^|[:|\t]|\s\/|\s{3})[^\S\n]*$/;
const lineEndEdge = /^\p{M}*(?:[^\S\n]{3}|[^\S\n]*(?:$|[:|\t]|\/\s))/u;

// A post's name counts as a heading or a cell only as their whole value: "Bucătar" also stands
// in "AJUTOR BUCĂTAR" and in a list of the posts, which head no table. The edges are those of a
// line, a label's colon, a cell's border, a cell's paragraph break (" / ") and a column gap.
function standsAlone(text: string, { start, end }: QuoteMatch) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  return (
    lineStartEdge.test(text.slice(lineStart, start)) &&
    lineEndEdge.test(text.slice(end, lineEnd === -1 ? text.length : lineEnd))
  );
}

function closestAfter(places: FoundQuote[], marks: QuoteMatch[]) {
  let best = places[0];
  let closest = Infinity;
  for (const place of places) {
    const mark = marks.filter(({ start }) => start < place.end).at(-1);
    if (mark !== undefined && place.end - mark.start < closest) {
      best = place;
      closest = place.end - mark.start;
    }
  }
  return best;
}

const pageGap = '\n\n';

// A row of a table may repeat under the headings of several posts, so the place of a quote is
// the one that follows `near` (the post's name) most closely; without `near`, or when nothing
// comes before it, the first. The texts are read as one, as the model read them, so a heading on
// one page heads the rows of the next; the place is on the page of its last part, the row, with
// only the parts on that page.
export function placeQuote(
  texts: readonly string[],
  quote: string,
  near?: string | null
): PlacedQuote | null {
  const joined = texts.join(pageGap);
  const marks = near ? findQuotes(joined, near).filter((mark) => standsAlone(joined, mark)) : [];
  const places = findQuotes(joined, quote);
  let best = closestAfter(places, marks);
  // An entry the model gave for several posts is one per post, each with the one quote, whose
  // heading can name only one of them, so another post's place is found by its row alone.
  const headed = places.some(({ parts: [first] }) =>
    marks.some((mark) => mark.start >= first!.start && mark.end <= first!.end)
  );
  const row = lastPart(quote);
  if (best && marks.length > 0 && !headed && row) {
    best = closestAfter(findQuotes(joined, row), marks) ?? best;
  }
  return best ? onPage(texts, best) : null;
}

function onPage(texts: readonly string[], place: FoundQuote): PlacedQuote {
  const row = place.parts.at(-1)!;
  let pageStart = 0;
  let textIndex = 0;
  while (
    textIndex < texts.length - 1 &&
    row.start >= pageStart + texts[textIndex]!.length + pageGap.length
  ) {
    pageStart += texts[textIndex]!.length + pageGap.length;
    textIndex += 1;
  }
  const pageEnd = pageStart + texts[textIndex]!.length;
  const parts = place.parts
    .filter(({ start }) => start >= pageStart && start < pageEnd)
    .map(({ start, end }) => ({
      start: start - pageStart,
      end: Math.min(end, pageEnd) - pageStart,
    }));
  return { textIndex, start: parts[0]!.start, end: parts.at(-1)!.end, parts };
}

export function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}
