import { importFileExtensions } from '@ssm-usor/contracts';

import type { ImportSourceResponse } from '@/api/generated/api';

import { foldText } from './review-model';

const wordTypes = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export type SourceKind = 'word' | 'pdf' | 'scan' | 'image';

const kindOfType = (mimeType: string): SourceKind =>
  mimeType.startsWith('image/') ? 'image' : wordTypes.has(mimeType) ? 'word' : 'pdf';

export function sourceKind(source: ImportSourceResponse): SourceKind {
  return source.page !== null ? 'scan' : kindOfType(source.original.mimeType);
}

const pagePattern = / \(pagina (\d+)\)$/;

// What a source shows can be told from its name before the API answers: the upload checked the
// extension against the type, and a page read as an image is named after it.
export function requestKind(file: string): SourceKind | null {
  if (pagePattern.test(file)) return 'scan';
  const extension = file.split('.').at(-1)?.toLowerCase() ?? '';
  const types: readonly string[] | undefined =
    importFileExtensions[extension as keyof typeof importFileExtensions];
  return types?.[0] ? kindOfType(types[0]) : null;
}

export function requestPage(file: string): number | null {
  const page = pagePattern.exec(file)?.[1];
  return page ? Number(page) : null;
}

export const requestFileName = (file: string) =>
  file.replace(pagePattern, '').split('/').at(-1) ?? file;

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

// Only the parts of a quote an ellipsis separates are the passage, not the rows between them.
function quoteSpans(source: ImportSourceResponse): QuoteLine[] | null {
  const { text, match } = source;
  if (!text || !match || match.page !== null) return null;
  return match.parts.flatMap((part) => lineSpans(text, part.start, part.end));
}

export function quoteLines(source: ImportSourceResponse, quote: string) {
  return (
    quoteSpans(source)?.map(({ line }) => line) ??
    lineSpans(quote, 0, quote.length).map(({ line }) => line)
  );
}

// The API may have found the passage again further on, as a table row repeated for each post, so
// each line is the editor's hit with as many of the line before it as the API's text has, both
// counted ignoring case.
export function lineOccurrences(source: ImportSourceResponse, quote: string): number[] {
  const spans = quoteSpans(source);
  if (!spans) return quoteLines(source, quote).map(() => 0);
  const text = source.text!.toLowerCase();
  return spans.map(({ line, at }) => occurrences(text.slice(0, at), line.toLowerCase()).length);
}

export type LineHit = {
  blockId: string;
  start: number;
  length: number;
  paragraphIndex: number;
  scope?: unknown;
};

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
// each word a space or two after the previous one in the same paragraph.
const wordGap = 4;

export function findLine(line: string, find: (query: string) => readonly LineHit[]): LineHit[] {
  const whole = find(line);
  const words = line.split(/\s+/);
  if (whole.length > 0 || words.length < 2) return [...whole];
  const [first, ...rest] = words.map(find);
  return first!.flatMap((start) => {
    let last = start;
    for (const hits of rest) {
      const end = last.start + last.length;
      const next = hits.find(
        (hit) => hit.blockId === last.blockId && hit.start > end && hit.start - end <= wordGap
      );
      if (!next) return [];
      last = next;
    }
    return [{ ...start, length: last.start + last.length - start.start }];
  });
}

// The longest line is the least ambiguous, so the passage is anchored on it and the other lines
// are taken next to it, in order.
export function passageHits(
  lines: string[],
  find: (line: string) => readonly LineHit[],
  occurrences: readonly number[] = []
) {
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
