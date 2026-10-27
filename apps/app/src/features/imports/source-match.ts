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

// The text the API matched the quote in is ours, taken out of the XML with tables as rows of
// cells; the editor finds within one paragraph, so the passage is searched line by line.
export function quoteLines(source: ImportSourceResponse, quote: string) {
  const matched =
    source.text && source.match && source.match.page === null
      ? source.text.slice(source.match.start, source.match.end)
      : quote;
  return matched
    .split(/\n|\t|\s{3,}/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);
}
