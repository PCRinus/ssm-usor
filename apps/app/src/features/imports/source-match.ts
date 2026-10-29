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
// since pdf.js splits a line into runs that do not follow the text poppler took out.
export function markQuote(spans: HTMLElement[], quote: string) {
  const target = foldText(quote).replace(/\s+/g, '');
  if (target.length < 3) return [];
  const pieces = spans.map((span) => foldText(span.textContent ?? '').replace(/\s+/g, ''));
  const joined = pieces.join('');
  let at = joined.indexOf(target);
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

// The text the API matched the quote in is ours, taken out of the XML with a table row as
// `| cell | cell |` and a cell's paragraphs joined by " / "; the editor finds within one
// paragraph and knows none of these separators, so the passage is searched piece by piece.
export function quoteLines(source: ImportSourceResponse, quote: string) {
  const matched =
    source.text && source.match && source.match.page === null
      ? source.text.slice(source.match.start, source.match.end)
      : quote;
  return matched
    .split(/\n|\t|\s{3,}|\s*\|\s*|\s+\/\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);
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

// The longest line is the least ambiguous, so the passage is anchored on it and the other lines
// are taken next to it, in order.
export function passageHits(lines: string[], find: (line: string) => readonly LineHit[]) {
  const found = lines.map(find);
  let anchorAt = -1;
  found.forEach((hits, index) => {
    if (hits.length > 0 && (anchorAt === -1 || lines[index]!.length > lines[anchorAt]!.length)) {
      anchorAt = index;
    }
  });
  if (anchorAt === -1) return { hits: [], anchor: null };
  const anchor = found[anchorAt]![0]!;
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
