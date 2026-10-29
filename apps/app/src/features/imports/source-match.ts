import type { ImportSourceResponse } from '@/api/generated/api';

import { foldText } from './review-model';

const wordTypes = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export type SourceKind = 'word' | 'pdf' | 'scan' | 'image';

export function sourceKind(source: ImportSourceResponse): SourceKind {
  if (source.page !== null) return 'scan';
  if (source.original.mimeType.startsWith('image/')) return 'image';
  if (wordTypes.has(source.original.mimeType)) return 'word';
  return 'pdf';
}

// The quote is matched against the words of the text layer, folded as the API folds them,
// since pdf.js splits a line into runs that do not follow the text poppler took out. The API may
// have found it again further on the page, as a table row repeated for each post, so the place
// marked is the one with as many before it as in the API's text.
export function markQuote(spans: HTMLElement[], quote: string, occurrence = 0) {
  const target = foldText(quote).replace(/\s+/g, '');
  if (target.length < 3) return [];
  const pieces = spans.map((span) => foldText(span.textContent ?? '').replace(/\s+/g, ''));
  const joined = pieces.join('');
  const places = occurrences(joined, target);
  let at = places[occurrence] ?? places[0] ?? -1;
  let length = target.length;
  if (at === -1) {
    const head = target.slice(0, 40);
    at = joined.indexOf(head);
    length = head.length;
  }
  if (at === -1) return [];
  const marked: HTMLElement[] = [];
  let offset = 0;
  pieces.forEach((piece, index) => {
    const start = offset;
    offset += piece.length;
    if (piece.length > 0 && start < at + length && offset > at) marked.push(spans[index]!);
  });
  for (const span of marked) span.classList.add('import-quote');
  return marked;
}

function occurrences(text: string, target: string) {
  const places: number[] = [];
  for (let at = text.indexOf(target); at !== -1; at = text.indexOf(target, at + target.length)) {
    places.push(at);
  }
  return places;
}

export function pageQuotes(source: ImportSourceResponse, pageNumber: number, quote: string) {
  const text = source.pages?.find((page) => page.number === pageNumber)?.text;
  if (!text || source.match?.page !== pageNumber) return [{ quote, occurrence: 0 }];
  const folded = (value: string) => foldText(value).replace(/\s+/g, '');
  return source.match.parts.map((part) => {
    const target = folded(text.slice(part.start, part.end));
    const before = occurrences(folded(text.slice(0, part.end)), target);
    return { quote: text.slice(part.start, part.end), occurrence: before.length - 1 };
  });
}

// The text the API matched the quote in is ours, taken out of the XML with a table row as
// `| cell | cell |` and a cell's paragraphs joined by " / "; the editor finds within one
// paragraph and knows none of these separators, so the passage is searched piece by piece.
const separators = /\n|\t|\s{3,}|\s*\|\s*|\s+\/\s+/g;

type QuoteLine = { line: string; at: number };

function lineSpans(text: string, from: number, to: number): QuoteLine[] {
  const slice = text.slice(from, to);
  const lines: QuoteLine[] = [];
  let start = 0;
  for (const separator of [...slice.matchAll(separators), null]) {
    const end = separator ? separator.index : slice.length;
    const raw = slice.slice(start, end);
    const line = raw.trim();
    if (line.length >= 3) lines.push({ line, at: from + start + raw.indexOf(line) });
    if (separator) start = separator.index + separator[0].length;
  }
  return lines;
}

export type PassagePart = { lines: string[]; occurrences: number[] };

// Only the parts of a quote an ellipsis separates are the passage, not the rows between them.
// The API may have found a part again further on, as a table row repeated for each post, so each
// line is the editor's hit with as many of the line before it as the API's text has, both counted
// ignoring case.
export function passageParts(source: ImportSourceResponse, quote: string): PassagePart[] {
  const { text, match } = source;
  const lower = text?.toLowerCase() ?? '';
  const parts =
    text && match && match.page === null
      ? match.parts.map((part) => {
          const spans = lineSpans(text, part.start, part.end);
          return {
            lines: spans.map(({ line }) => line),
            occurrences: spans.map(
              ({ line, at }) => occurrences(lower.slice(0, at), line.toLowerCase()).length
            ),
          };
        })
      : quote.split(/…|\.{3,}/).map((part) => {
          const lines = lineSpans(part, 0, part.length).map(({ line }) => line);
          return { lines, occurrences: lines.map(() => 0) };
        });
  return parts.filter(({ lines }) => lines.length > 0);
}

export type LineHit = {
  blockId: string;
  start: number;
  length: number;
  paragraphIndex: number;
  scope?: unknown;
  contextAfter?: string;
};

type Find = (
  queries: readonly string[],
  options?: { wholeWord?: boolean }
) => readonly (readonly LineHit[])[];

// The lines of a passage sit in consecutive paragraphs or table cells, so a later line is only
// looked for a few paragraphs on: a short cell such as "CUI" also appears elsewhere.
const nearbyParagraphs = 8;

// The editor builds a header's or footer's scope afresh on each search.
const sameScope = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const comesAfter = (hit: LineHit, previous: LineHit) =>
  sameScope(hit.scope, previous.scope) &&
  hit.paragraphIndex - previous.paragraphIndex <= nearbyParagraphs &&
  (hit.paragraphIndex > previous.paragraphIndex ||
    (hit.paragraphIndex === previous.paragraphIndex &&
      hit.start >= previous.start + previous.length));

// The text the API matched in collapses runs of spaces that the document keeps, as in a cell
// "Substante de curatat  (maini)", so a line the editor cannot find whole is found word by word,
// each word after nothing but spaces from the previous one in the same paragraph. The words are
// looked for in one pass, since a word such as "de" is in most paragraphs of a long document.
export function findLine(line: string, find: Find): LineHit[] {
  const whole = find([line])[0] ?? [];
  const words = line.split(/\s+/);
  if (whole.length > 0 || words.length < 2) return [...whole];
  const [first = [], ...rest] = find(words, { wholeWord: true });
  if (first.length === 0 || rest.some((hits) => hits.length === 0)) return [];
  const at = rest.map((hits) => new Map(hits.map((hit) => [`${hit.blockId}:${hit.start}`, hit])));
  return first.flatMap((start) => {
    let last = start;
    for (const hits of at) {
      const spaces = /^\s+/.exec(last.contextAfter ?? '')?.[0].length ?? 0;
      const next =
        spaces > 0 ? hits.get(`${last.blockId}:${last.start + last.length + spaces}`) : undefined;
      if (!next) return [];
      last = next;
    }
    return [{ ...start, length: last.start + last.length - start.start }];
  });
}

// The longest line of a part is the least ambiguous, so the part is anchored on it and its other
// lines are taken next to it, in order. Each part has its own anchor, since rows that repeat the
// row's cells stand between a heading and its row; the last part's, the row, is the one shown.
export function passageHits(
  parts: readonly PassagePart[],
  find: (line: string) => readonly LineHit[]
) {
  const hits: LineHit[] = [];
  let anchor: LineHit | null = null;
  for (const part of parts) {
    const found = partHits(part, find);
    hits.push(...found.hits);
    anchor = found.anchor ?? anchor;
  }
  return { hits, anchor };
}

function partHits({ lines, occurrences }: PassagePart, find: (line: string) => readonly LineHit[]) {
  const found = lines.map(find);
  let anchorAt = -1;
  found.forEach((hits, index) => {
    if (hits.length > 0 && (anchorAt === -1 || lines[index]!.length > lines[anchorAt]!.length)) {
      anchorAt = index;
    }
  });
  if (anchorAt === -1) return { hits: [], anchor: null };
  const anchors = found[anchorAt]!;
  const anchor = anchors[occurrences[anchorAt] ?? 0] ?? anchors[0]!;
  const hits: LineHit[] = [anchor];
  let previous = anchor;
  for (const lineHits of found.slice(anchorAt + 1)) {
    const hit = lineHits.find((each) => comesAfter(each, previous));
    if (hit) {
      hits.push(hit);
      previous = hit;
    }
  }
  let next = anchor;
  for (const lineHits of found.slice(0, anchorAt).reverse()) {
    const hit = [...lineHits].reverse().find((each) => comesAfter(next, each));
    if (hit) {
      hits.unshift(hit);
      next = hit;
    }
  }
  return { hits, anchor };
}
