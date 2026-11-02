import {
  type InstructionBlock,
  instructionBodySchema,
  type InstructionCategory,
  type InstructionDomain,
  type SplitArticle,
  type SplitFlag,
  splitInstruction,
  type SplitterParagraph,
} from '@ssm-usor/contracts';

import type { DocxParagraph } from './instructions-docx';
import type { InstructionsAnswer } from './instructions-request';

export interface InstructionsFile {
  path: string;
  // From `readInstructionsDocx`: line i of `text` is `paragraphs[i]`.
  paragraphs: DocxParagraph[];
  text: string;
}

export interface SourceLocation {
  file: string;
  // Offsets in the file's text, whole paragraphs.
  start: number;
  end: number;
  firstParagraph: number;
  lastParagraph: number;
}

export type CutFlag = { kind: 'end_not_found' } | { kind: 'end_extended' };

export interface CutInstruction {
  key: string;
  file: string;
  number: string;
  title: string;
  category: InstructionCategory;
  location: SourceLocation;
  body: { blocks: InstructionBlock[] };
  articles: SplitArticle[];
  flags: (SplitFlag | CutFlag)[];
}

export const unreadReasons = {
  file_not_found: 'Fișierul instrucțiunii nu este în import',
  start_not_found: 'Nu am putut găsi textul în document',
  no_articles: 'Nu am găsit niciun articol în textul instrucțiunii',
  too_long: 'Textul are mai mult de 400 de articole sau de 200.000 de caractere',
} as const;

export type UnreadReason = keyof typeof unreadReasons;

export interface UnreadInstruction {
  key: string;
  file: string;
  number: string;
  title: string;
  category: InstructionCategory;
  reason: UnreadReason;
}

export interface Cuts {
  instructions: CutInstruction[];
  unread: UnreadInstruction[];
}

interface Words {
  tokens: string[];
  starts: number[];
  ends: number[];
}

const wordPattern = /[\p{L}\p{M}\p{N}]+/gu;
const marks = /\p{M}/gu;

// The model may write a paragraph's printed number or leave it out ("Art. 288.", "a)", "1."),
// so numbers of up to three digits, single letters and "art" are matched on neither side.
const ignored = (token: string) =>
  token.length === 1 || /^\d{1,3}$/u.test(token) || token === 'art';

function wordsOf(text: string): Words {
  const words: Words = { tokens: [], starts: [], ends: [] };
  for (const match of text.matchAll(wordPattern)) {
    const token = match[0].normalize('NFD').replace(marks, '').toLowerCase();
    if (token === '' || ignored(token)) continue;
    words.tokens.push(token);
    words.starts.push(match.index);
    words.ends.push(match.index + match[0].length);
  }
  return words;
}

const tokensOf = (quote: string) => wordsOf(quote).tokens;

function matchesAt(haystack: string[], needle: string[], at: number) {
  for (let index = 0; index < needle.length; index++) {
    if (haystack[at + index] !== needle[index]) return false;
  }
  return true;
}

function placesOf(haystack: string[], needle: string[]) {
  const places: number[] = [];
  if (needle.length === 0) return places;
  for (let at = 0; at + needle.length <= haystack.length; at++) {
    if (haystack[at] === needle[0] && matchesAt(haystack, needle, at)) places.push(at);
  }
  return places;
}

function firstAtLeast(sorted: readonly number[], value: number) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

const fewestWords = 8;

// A quote with a word the model got wrong is looked for again by its end or its beginning alone.
function variants(needle: string[], keep: 'first' | 'last') {
  const lengths = [needle.length, 12, fewestWords].filter(
    (length, index) => index === 0 || (length < needle.length && length >= fewestWords)
  );
  return lengths.map((length) =>
    keep === 'first' ? needle.slice(0, length) : needle.slice(needle.length - length)
  );
}

interface Needles {
  start: string[][];
  end: string[][];
}

const needlesOf = (entry: { startWords: string; endWords: string }): Needles => ({
  start: variants(tokensOf(entry.startWords), 'first'),
  end: variants(tokensOf(entry.endWords), 'last'),
});

const tableOfContentsLine = /(?:\.{3,}|…|_{3,}|\t)\s*\d{1,4}\s*$/u;

// A PSI annex holds subchapters of its own ("Subcapitolul II.I."), so only a heading of the same
// family as the instruction's own opens another one.
const headingFamilies = [
  /^\s*(?:subcapitolul|i[\W_]{0,3}p[\W_]{0,3}s[\W_]{0,3}s[\W_]{0,3}m\b[\s.]*\d)/iu,
  /^\s*(?:anexa\b|i[\W_]{0,3}p[\W_]{0,3}s[\W_]{0,3}u\b[\s.]*\d)/iu,
];

interface Layout {
  words: Words;
  lineOfWord: number[];
  contentsLines: boolean[];
  // The family of the nearest instruction heading at or above each line; -1 below none.
  familyOver: number[];
  // headingsBefore[family][n]: how many of the first n lines open an instruction of that family.
  headingsBefore: number[][];
  places: Map<string, number[]>;
  startPlaces: Map<string, number[]>;
}

function layoutOf(text: string, starts: number[]): Layout {
  const words = wordsOf(text);
  const lines = text.split('\n');
  const contentsLines = lines.map((line) => tableOfContentsLine.test(line));
  const headingsBefore = headingFamilies.map(() => [0]);
  const familyOver: number[] = [];
  lines.forEach((line, index) => {
    const family = contentsLines[index]
      ? -1
      : headingFamilies.findIndex((pattern) => pattern.test(line));
    familyOver.push(family === -1 ? (familyOver[index - 1] ?? -1) : family);
    headingsBefore.forEach((counts, kind) =>
      counts.push(counts[index]! + (kind === family ? 1 : 0))
    );
  });
  const lineOfWord: number[] = [];
  let line = 0;
  for (const offset of words.starts) {
    while (line + 1 < starts.length && starts[line + 1]! <= offset) line++;
    lineOfWord.push(line);
  }
  return {
    words,
    lineOfWord,
    contentsLines,
    familyOver,
    headingsBefore,
    places: new Map(),
    startPlaces: new Map(),
  };
}

function placesIn(layout: Layout, needle: string[]) {
  const key = needle.join(' ');
  let places = layout.places.get(key);
  if (!places) {
    places = placesOf(layout.words.tokens, needle);
    layout.places.set(key, places);
  }
  return places;
}

// The start quote also matches the instruction's line in a table of contents, which comes first.
function startPlacesIn(layout: Layout, needle: string[]) {
  const key = needle.join(' ');
  let places = layout.startPlaces.get(key);
  if (!places) {
    places = placesIn(layout, needle).filter((at) => !layout.contentsLines[layout.lineOfWord[at]!]);
    layout.startPlaces.set(key, places);
  }
  return places;
}

function lastStart(layout: Layout, needles: string[][], from: number, to: number) {
  for (const needle of needles) {
    const places = startPlacesIn(layout, needle);
    const at = places[firstAtLeast(places, to - needle.length + 1) - 1];
    if (at !== undefined && at >= from) return at;
  }
  return null;
}

function opensAnotherBetween(layout: Layout, start: number, end: number) {
  const first = layout.lineOfWord[start]!;
  const last = layout.lineOfWord[end - 1]!;
  if (last <= first + 1) return false;
  const own = layout.familyOver[first]!;
  return layout.headingsBefore.some(
    (counts, family) => (own === -1 || own === family) && counts[last]! > counts[first + 1]!
  );
}

// A cut over the heading of another instruction took a start quote or an end quote that belongs
// to a neighbour, often a closing sentence the pack repeats; the next match is tried instead.
function locate(layout: Layout, needles: Needles, cursor: number) {
  for (const startNeedle of needles.start) {
    for (const endNeedle of needles.end) {
      const ends = placesIn(layout, endNeedle);
      for (let index = firstAtLeast(ends, cursor); index < ends.length; index++) {
        const end = ends[index]! + endNeedle.length;
        const start = lastStart(layout, [startNeedle], cursor, end);
        if (start === null || opensAnotherBetween(layout, start, end)) continue;
        return { start, end };
      }
    }
  }
  return null;
}

function lineStarts(text: string) {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

const articleLabel = /^art(?:icolul|\.)?\s*(\d{1,4})\b/iu;

export function printedArticle(paragraph: DocxParagraph) {
  const label = paragraph.numbered?.label;
  const match =
    (label ? articleLabel.exec(label.trim()) : null) ?? articleLabel.exec(paragraph.text);
  return match ? Number(match[1]) : null;
}

const instructionHeading =
  /^\s*(?:subcapitolul|anexa\b|i[\W_]{0,3}p[\W_]{0,3}s[\W_]{0,3}(?:s[\W_]{0,3}m|u)\b[\s.]*\d)/iu;
const headingLike = (paragraph: DocxParagraph) =>
  !paragraph.numbered && paragraph.text.length <= 120 && !/[.;:!?)]$/u.test(paragraph.text.trim());

// Two of the pack's instructions follow each other with at most a chapter's heading between
// them. Articles between them mean the model quoted an end inside the first instruction, which
// then runs on; unless an instruction's heading stands there too, one the answer left out.
function extendedEnd(paragraphs: DocxParagraph[], lastLine: number, nextFirstLine: number) {
  const gap = paragraphs.slice(lastLine + 1, nextFirstLine);
  if (!gap.some((paragraph) => printedArticle(paragraph) !== null)) return null;
  if (gap.some((paragraph) => instructionHeading.test(paragraph.text))) return null;
  let end = nextFirstLine - 1;
  while (end > lastLine && headingLike(paragraphs[end]!)) end--;
  return end;
}

export const toSplitterParagraph = (paragraph: DocxParagraph): SplitterParagraph => ({
  text: paragraph.text,
  ...(paragraph.numbered ? { numbered: paragraph.numbered } : {}),
  ...(paragraph.table ? { table: true } : {}),
});

type Answered = InstructionsAnswer['instructions'][number];

interface Placed {
  key: string;
  entry: Answered;
  file: InstructionsFile;
  lineStarts: number[];
  firstLine: number;
  // Null while the instruction ends where the next one starts.
  lastLine: number | null;
  endFound: boolean;
  endExtended?: boolean;
}

// ADR 034, "Code cuts": the end is the first match of the end quote after the previous
// instruction, the start the last match of the start quote before it, which passes over the
// title's earlier appearance in a table of contents.
export function cutInstructions(
  domain: InstructionDomain,
  files: readonly InstructionsFile[],
  answer: readonly Answered[]
): Cuts {
  const unread: UnreadInstruction[] = [];
  const placed: Placed[] = [];
  const keyed = answer.map((entry, index) => ({ entry, key: `${domain}-${index + 1}` }));
  const unreadOf = ({ entry, key }: (typeof keyed)[number], reason: UnreadReason) =>
    unread.push({
      key,
      file: entry.file,
      number: entry.number,
      title: entry.title,
      category: entry.category,
      reason,
    });

  for (const item of keyed.filter(({ entry }) => !files.some((file) => file.path === entry.file))) {
    unreadOf(item, 'file_not_found');
  }
  for (const file of files) {
    const starts = lineStarts(file.text);
    const layout = layoutOf(file.text, starts);
    const { words } = layout;
    const spans: {
      item: (typeof keyed)[number];
      needles: Needles;
      from: number;
      start: number | null;
      end: number | null;
    }[] = [];
    let cursor = 0;
    for (const item of keyed.filter(({ entry }) => entry.file === file.path)) {
      const needles = needlesOf(item.entry);
      const found = locate(layout, needles, cursor);
      spans.push({
        item,
        needles,
        from: cursor,
        start: found?.start ?? null,
        end: found?.end ?? null,
      });
      if (found) cursor = found.end;
    }
    spans.forEach((span, index) => {
      if (span.start !== null) return;
      const next = spans.slice(index + 1).find((later) => later.start !== null);
      span.start = lastStart(
        layout,
        span.needles.start,
        span.from,
        next?.start ?? words.tokens.length
      );
    });
    const inFile: Placed[] = [];
    for (const span of spans) {
      if (span.start === null) {
        unreadOf(span.item, 'start_not_found');
        continue;
      }
      inFile.push({
        ...span.item,
        file,
        lineStarts: starts,
        firstLine: lineAt(starts, words.starts[span.start]!),
        lastLine: span.end === null ? null : lineAt(starts, words.ends[span.end - 1]! - 1),
        endFound: span.end !== null,
      });
    }
    inFile.forEach((item, index) => {
      const next = inFile.slice(index + 1).find((later) => later.firstLine > item.firstLine);
      if (item.lastLine === null) {
        item.lastLine = next ? next.firstLine - 1 : file.paragraphs.length - 1;
      } else if (next) {
        const extended = extendedEnd(file.paragraphs, item.lastLine, next.firstLine);
        if (extended !== null) {
          item.lastLine = extended;
          item.endExtended = true;
        }
      }
    });
    placed.push(...inFile);
  }

  const instructions: CutInstruction[] = [];
  for (const item of placed) {
    const { file, entry, firstLine, lineStarts: starts } = item;
    const lastLine = Math.max(item.lastLine!, firstLine);
    const split = splitInstruction(
      file.paragraphs.slice(firstLine, lastLine + 1).map(toSplitterParagraph),
      { title: entry.title }
    );
    if (split.articles.length === 0) {
      unreadOf(item, 'no_articles');
      continue;
    }
    if (!instructionBodySchema.safeParse(split.body).success) {
      unreadOf(item, 'too_long');
      continue;
    }
    const end = lastLine + 1 < starts.length ? starts[lastLine + 1]! - 1 : file.text.length;
    instructions.push({
      key: item.key,
      file: file.path,
      number: entry.number,
      title: entry.title,
      category: entry.category,
      location: {
        file: file.path,
        start: starts[firstLine]!,
        end,
        firstParagraph: firstLine,
        lastParagraph: lastLine,
      },
      body: split.body,
      articles: split.articles,
      flags: [
        ...(item.endFound ? [] : [{ kind: 'end_not_found' as const }]),
        ...(item.endExtended ? [{ kind: 'end_extended' as const }] : []),
        ...split.flags,
      ],
    });
  }
  const order = new Map(keyed.map(({ key }, index) => [key, index]));
  instructions.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  unread.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  return { instructions, unread };
}
