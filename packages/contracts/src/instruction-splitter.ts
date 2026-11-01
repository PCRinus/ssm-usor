import { foldText } from './fold-text';
import type { InstructionBlock } from './instruction-body';

/**
 * A paragraph as a reader of a file gives it. `numbered` is the label Word prints before the
 * paragraph from a list, which `text` does not hold (`level` from 0); paragraphs of one Word
 * list share `list`. A `table` row holds its cells in `text`, apart by tabs.
 */
export interface SplitterParagraph {
  text: string;
  numbered?: { label: string; level: number; list?: string };
  table?: boolean;
}

export type SplitFlag =
  | { kind: 'no_numbering' }
  | { kind: 'no_articles' }
  | { kind: 'text_before_first_article' }
  | { kind: 'table_row'; article: number };

export const splitFlagMessages: Record<SplitFlag['kind'], string> = {
  no_numbering: 'Numerotarea nu s-a putut citi',
  no_articles: 'Nu am găsit niciun articol în text',
  text_before_first_article: 'Textul dinaintea primului articol a devenit un articol',
  table_row: 'Un rând de tabel a devenit paragraf',
};

export interface SplitArticle {
  // The number the source printed ("Art. 288" gives 288), which the training themes cite;
  // null where the source numbered nothing.
  sourceNumber: number | null;
}

export interface SplitResult {
  body: { blocks: InstructionBlock[] };
  // In the order of the body's articles: `articles[0]` is "Art. 1".
  articles: SplitArticle[];
  // The title line the splitter dropped from the top, when there was one.
  title: string | null;
  flags: SplitFlag[];
}

export interface SplitOptions {
  // The module's title, so a line that repeats it at the top is dropped.
  title?: string;
}

interface Item {
  text: string;
  numbered: SplitterParagraph['numbered'] | null;
  row: boolean;
}

const leadingLabels = [
  /^anexa(?:\s+nr\.?)?\s*\d+\s*\.?/iu,
  /^(?:i\.?\s?p\.?\s?s\.?\s?s\.?\s?m|i\.?\s?p\.?\s?s\.?\s?u)\.?(?:\s*(?:nr\.?\s*)?\d+\s*\.?)?(?=\s|$|[-–:])/iu,
  /^(?:sub)?capitolul\s+[ivxlcdm\d]+(?:\s*\.\s*[ivxlcdm\d]+)*\.?(?=\s|$|[-–:])/iu,
];

const typedArticle = /^(?:art\.|art(?=\s)|articolul)\s*(\d{1,4})(?:\s*[.):]|\s+[-–]|(?=\s)|$)\s*/iu;
const typedNumber = /^(\d{1,4})\s*[.)](?![\d.])\s*/u;
const articleLabel = /^(?:(art(?:icolul|\.)?)\s*)?(\d{1,4})\s*[.)]?$/iu;
const marker = /^(?:\(?[\p{Ll}]{1,4}\)|\(?\d{1,3}(?:\.\d{1,3})*[.)]|[–—\-•·▪◦●○■►➢✓*])(?=\s)/u;
const sentenceEnd = /[.;!?,]$/u;
const wrappedEnd = /[.;:!?]$/u;
const headingLength = 120;
const wrappedLineLength = 70;

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();

function linesToParagraphs(text: string): SplitterParagraph[] {
  const paragraphs: SplitterParagraph[] = [];
  let lastLine = '';
  for (const raw of text.split(/\r\n|[\r\n\u2028\u2029\f]/u)) {
    const line = collapse(raw);
    if (line === '') {
      lastLine = '';
      continue;
    }
    const previous = paragraphs.at(-1);
    // A PDF copied as text breaks a paragraph at every printed line.
    const wrapped =
      previous !== undefined &&
      lastLine !== '' &&
      !wrappedEnd.test(lastLine) &&
      !startsSomething(line) &&
      (/^\p{Ll}/u.test(line) || lastLine.length >= wrappedLineLength);
    if (wrapped) previous.text = `${previous.text} ${line}`;
    else paragraphs.push({ text: line });
    lastLine = line;
  }
  return paragraphs;
}

const startsSomething = (line: string) =>
  typedArticle.test(line) || typedNumber.test(line) || marker.test(line);

function wordLabel(label: string) {
  const text = label.trim();
  if (text === '' || /^[\uf000-\uf0ff]$/u.test(text) || text === 'o') return '•';
  if (text === '-') return '–';
  return text;
}

function stripLabel(text: string) {
  for (const label of leadingLabels) {
    const match = label.exec(text);
    if (match) return text.slice(match[0].length).replace(/^[\s.:–-]+/u, '');
  }
  return null;
}

function dropLeading(items: Item[], options: SplitOptions) {
  const knownTitle = options.title ? foldText(options.title) : '';
  let title: string | null = null;
  let afterLabel = false;
  let at = 0;
  while (at < items.length) {
    const item = items[at]!;
    if (item.numbered || item.row || typedArticle.test(item.text)) break;
    const rest = stripLabel(item.text);
    if (rest !== null) {
      if (title === null && /^\p{Lu}/u.test(rest)) title = rest;
      afterLabel = title === null;
      at += 1;
      continue;
    }
    if (afterLabel && /^\p{Ll}/u.test(item.text)) {
      at += 1;
      continue;
    }
    const folded = foldText(item.text);
    const isTitle =
      title === null &&
      ((knownTitle.length >= 4 && folded.includes(knownTitle)) ||
        (/^instructiun/u.test(folded) && !/[.;!?]$/u.test(item.text)));
    if (!isTitle) break;
    title = item.text;
    at += 1;
    while (
      at < items.length &&
      !items[at]!.numbered &&
      !items[at]!.row &&
      /^\p{Ll}/u.test(items[at]!.text) &&
      !startsSomething(items[at]!.text)
    ) {
      title = `${title} ${items[at]!.text}`;
      at += 1;
    }
    afterLabel = false;
  }
  return { rest: items.slice(at), title };
}

// The articles are the top level of Word's list, or the level labelled "Art. N." where one is.
function articleLevel(items: Item[]) {
  const candidates = items.filter(
    (item) => item.numbered && articleLabel.test(item.numbered.label.trim())
  );
  const labelled = candidates.filter((item) => /^art/iu.test(item.numbered!.label.trim()));
  if (labelled.length > 0) {
    const level = Math.min(...labelled.map((item) => item.numbered!.level));
    return new Set(labelled.filter((item) => item.numbered!.level === level));
  }
  const counts = new Map<string | undefined, number>();
  const topLevel = candidates.filter((item) => item.numbered!.level === 0);
  for (const item of topLevel) {
    const list = item.numbered!.list;
    counts.set(list, (counts.get(list) ?? 0) + 1);
  }
  const most = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return new Set(most ? topLevel.filter((item) => item.numbered!.list === most[0]) : []);
}

interface Start {
  number: number;
  rest: string;
}

function findStarts(items: Item[]): { starts: (Start | null)[]; numbered: boolean } {
  const typed = items.map((item) => {
    if (item.numbered || item.row) return null;
    const match = typedArticle.exec(item.text);
    return match ? { number: Number(match[1]), rest: item.text.slice(match[0].length) } : null;
  });
  // Where Word numbers the paragraphs, a number typed by hand ("12.", "16)") is a point inside
  // an article, never one of its own.
  if (items.some((item) => item.numbered)) {
    const level = articleLevel(items);
    const starts = items.map((item, index) => {
      if (!level.has(item)) return typed[index] ?? null;
      return {
        number: Number(articleLabel.exec(item.numbered!.label.trim())![2]),
        rest: item.text,
      };
    });
    return { starts, numbered: starts.some(Boolean) };
  }
  if (typed.some(Boolean)) return { starts: typed, numbered: true };
  // A bare "1." also opens the points of a list inside an article, which start again from 1.
  let last: number | null = null;
  const bare = items.map((item) => {
    if (item.row) return null;
    const match = typedNumber.exec(item.text);
    if (!match) return null;
    const number = Number(match[1]);
    if (last !== null && number !== last + 1) return null;
    last = number;
    return { number, rest: item.text.slice(match[0].length) };
  });
  return { starts: bare, numbered: bare.some(Boolean) };
}

const isMarked = (item: Item) => (item.row ? false : item.numbered ? true : marker.test(item.text));

// A Word number above the articles' level ("I." over "Art. 288.") numbers a section.
function headingCandidate(item: Item, articleDepth: number) {
  return (
    (!item.numbered || item.numbered.level < articleDepth) &&
    !item.row &&
    !marker.test(item.text) &&
    item.text.length <= headingLength &&
    !sentenceEnd.test(item.text) &&
    /^[\p{Lu}\d]/u.test(item.text)
  );
}

function continuation(item: Item) {
  if (item.row) return item.text;
  if (item.numbered) {
    const label = wordLabel(item.numbered.label);
    return item.text === '' ? label : `${label} ${item.text}`;
  }
  return item.text;
}

// It only decides where articles begin and keeps the words (ADR 034, "The splitter").
export function splitInstruction(
  input: string | readonly SplitterParagraph[],
  options: SplitOptions = {}
): SplitResult {
  const paragraphs = typeof input === 'string' ? linesToParagraphs(input) : input;
  const all: Item[] = paragraphs
    .map((paragraph) => {
      const row = paragraph.table === true;
      const text = row
        ? paragraph.text
            .split('\t')
            .map(collapse)
            .filter((cell) => cell !== '')
            .join(' – ')
        : collapse(paragraph.text);
      return { text, numbered: paragraph.numbered ?? null, row };
    })
    .filter((item) => item.text !== '' || item.numbered);
  const { rest: items, title } = dropLeading(all, options);
  const flags: SplitFlag[] = [];

  const found = findStarts(items);
  const numbered = found.numbered;
  let starts = found.starts;
  const depths = items.flatMap((item, index) =>
    starts[index] && item.numbered ? [item.numbered.level] : []
  );
  const articleDepth = depths.length > 0 ? Math.min(...depths) : 0;
  const headings = new Array<boolean>(items.length).fill(false);
  if (numbered) {
    for (let index = items.length - 2; index >= 0; index -= 1) {
      if (starts[index]) continue;
      headings[index] =
        headingCandidate(items[index]!, articleDepth) &&
        (Boolean(starts[index + 1]) || headings[index + 1]!);
    }
  } else {
    if (items.length > 0) flags.push({ kind: 'no_numbering' });
    for (let index = items.length - 2; index >= 0; index -= 1) {
      headings[index] =
        headingCandidate(items[index]!, articleDepth) && !isMarked(items[index + 1]!);
    }
    starts = items.map((item, index) =>
      headings[index] || isMarked(item) ? null : { number: Number.NaN, rest: item.text }
    );
  }

  const blocks: InstructionBlock[] = [];
  const articles: SplitArticle[] = [];
  let current: { kind: 'article'; paragraphs: string[] } | null = null;
  let waitingForText = false;
  items.forEach((item, index) => {
    if (headings[index]) {
      blocks.push({ kind: 'heading', text: continuation(item) });
      current = null;
      return;
    }
    const start = starts[index];
    if (start) {
      current = { kind: 'article', paragraphs: [] };
      blocks.push(current);
      articles.push({ sourceNumber: Number.isNaN(start.number) ? null : start.number });
      waitingForText = start.rest === '';
      if (!waitingForText) current.paragraphs.push(start.rest);
      if (item.row) flags.push({ kind: 'table_row', article: articles.length });
      return;
    }
    if (!current) {
      current = { kind: 'article', paragraphs: [] };
      blocks.push(current);
      articles.push({ sourceNumber: null });
      if (numbered && !flags.some((flag) => flag.kind === 'text_before_first_article')) {
        flags.push({ kind: 'text_before_first_article' });
      }
    }
    current.paragraphs.push(waitingForText && !item.numbered ? item.text : continuation(item));
    waitingForText = false;
    if (item.row) flags.push({ kind: 'table_row', article: articles.length });
  });

  const kept: InstructionBlock[] = [];
  const keptArticles: SplitArticle[] = [];
  let articleIndex = 0;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      kept.push(block);
      continue;
    }
    const source = articles[articleIndex]!;
    articleIndex += 1;
    if (block.paragraphs.length > 0) {
      kept.push(block);
      keptArticles.push(source);
    }
  }
  if (keptArticles.length === 0) flags.push({ kind: 'no_articles' });
  return { body: { blocks: kept }, articles: keptArticles, title, flags };
}
