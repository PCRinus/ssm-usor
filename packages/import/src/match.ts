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

export function sameName(a: string, b: string) {
  return foldName(a) === foldName(b) || similar(a, b) >= 0.8 || contained(a, b) >= 0.75;
}

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

// Models mark words they leave out of a quote with an ellipsis, so its parts are found in order.
export function findQuote(text: string, quote: string): QuoteMatch | null {
  const parts = quote
    .split(/…|\.{3,}/)
    .map(foldText)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const haystack = foldWithOffsets(text);
  let from = 0;
  let start = -1;
  let end = -1;
  for (const part of parts) {
    const index = haystack.folded.indexOf(part, from);
    if (index === -1) return null;
    if (start === -1) start = index;
    end = index + part.length - 1;
    from = index + part.length;
  }
  return { start: haystack.starts[start]!, end: haystack.ends[end]! };
}
