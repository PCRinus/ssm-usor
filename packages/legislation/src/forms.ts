import { type ActText, type ActUnit, isRepealed, plainLabel, unitLines, unitsOf } from './act-text';
import { children, type CitedPassage, findPoint, parseLocator } from './locator';
import { align, type AlignOp } from './quotes';
import { locateQuote } from './review';

export type CitedUnit = {
  annex: string | null;
  article: string | null;
  alineat: string | null;
  letter: string | null;
  point: string | null;
  // "Art. 36 alin. (2)", "Anexa 2", "Anexă, Art. 98".
  label: string;
};

export type LawHunk = {
  old: string;
  new: string;
  // A few words on each side of the change, as the earlier form reads, to find it by.
  before: string;
  after: string;
};

export type UnitChange =
  | { unit: CitedUnit; status: 'unchanged'; text: string }
  | { unit: CitedUnit; status: 'changed'; old: string; new: string; hunks: LawHunk[] }
  | { unit: CitedUnit; status: 'added'; new: string }
  | { unit: CitedUnit; status: 'repealed'; old: string }
  | { unit: CitedUnit; status: 'missing' }
  // Found in both forms but not compared: no words to read in one of them, images or a table the
  // portal keeps as a picture, or too long to compare word by word.
  | {
      unit: CitedUnit;
      status: 'uncompared';
      reason: 'no_text' | 'too_long';
      old: string;
      new: string;
    };

type Forms = { verified: ActText; current: ActText };

export function unitLabel(unit: Omit<CitedUnit, 'label'>) {
  const parts = [
    unit.annex !== null ? (/^\d/.test(unit.annex) ? `Anexa ${unit.annex}` : unit.annex) : null,
    [
      unit.article !== null ? `Art. ${unit.article}` : null,
      unit.alineat !== null ? `alin. (${unit.alineat})` : null,
      unit.letter !== null ? `lit. ${unit.letter})` : null,
      unit.point !== null ? `pct. ${unit.point}` : null,
    ]
      .filter(Boolean)
      .join(' '),
  ].filter(Boolean);
  return parts.join(', ');
}

function cited(unit: Omit<CitedUnit, 'label'>): CitedUnit {
  return { ...unit, label: unitLabel(unit) };
}

const blank = { annex: null, article: null, alineat: null, letter: null, point: null };

function annexesHolding(forms: Forms, article: string) {
  const annexes = [forms.verified, forms.current].flatMap((text) =>
    unitsOf(text, 'article', article).map((match) => match.annex)
  );
  return [...new Set(annexes)];
}

// An article numbered both in the act and in the norms it approves, H.G. 1425/2006 art. 1, is the
// one the template quotes; a reference to it stands for both.
function scopeOf(forms: Forms, citation: CitedPassage, article: string) {
  const annexes = annexesHolding(forms, article);
  if (annexes.length <= 1 || citation.form !== 'quote') return annexes;
  const located = locateQuote(forms.verified, citation) ?? locateQuote(forms.current, citation);
  return located?.match ? [located.match.annex] : annexes;
}

function alineateIn(forms: Forms, annex: string | null, article: string, wanted: string[]) {
  const labels = (text: ActText) => {
    const match = unitsOf(text, 'article', article).find((each) => each.annex === annex);
    return match ? children(match.unit, 'alineat').map((unit) => plainLabel(unit.label)) : [];
  };
  const inRange = (all: string[]) => {
    const first = all.indexOf(wanted[0]!);
    const last = all.indexOf(wanted.at(-1)!);
    return first < 0 || last < first ? [] : all.slice(first, last + 1);
  };
  const found = [...inRange(labels(forms.verified)), ...inRange(labels(forms.current))];
  return found.length > 0 ? [...new Set(found)] : wanted;
}

export function citedUnits(forms: Forms, citation: CitedPassage): CitedUnit[] {
  if (citation.form === 'reference' || !citation.text?.trim()) {
    if (citation.article === null) return [];
    const article = plainLabel(citation.article);
    const annexes = annexesHolding(forms, article);
    return (annexes.length > 0 ? annexes : [null]).map((annex) =>
      cited({ ...blank, annex, article })
    );
  }
  const locator = citation.locator ? parseLocator(citation.locator) : null;
  if (!locator) return [];
  if (locator.annex) return [cited({ ...blank, annex: locator.annex })];
  if (locator.articles.length === 0) {
    return locator.point ? [cited({ ...blank, point: locator.point })] : [];
  }
  return locator.articles.flatMap((article, index) => {
    const scopes = scopeOf(forms, citation, article);
    return (scopes.length > 0 ? scopes : [null]).flatMap((annex) => {
      const unit = { ...blank, annex, article };
      if (index > 0) return [cited(unit)];
      if (locator.point) return [cited({ ...unit, point: locator.point })];
      const alineate = locator.alineate.range
        ? alineateIn(forms, annex, article, locator.alineate.list)
        : locator.alineate.list;
      if (locator.letters.length > 0) {
        return locator.letters.map((letter) =>
          cited({ ...unit, alineat: alineate[0] ?? null, letter })
        );
      }
      if (alineate.length > 0) return alineate.map((alineat) => cited({ ...unit, alineat }));
      return [cited(unit)];
    });
  });
}

const pointLine = /^(\d+(?:\^\d+)?)\.\s/;

function quotedAfter(line: string, quoted: boolean) {
  let open = quoted;
  for (const character of line) {
    if (character === '„' || character === '“') open = true;
    else if (character === '”') open = false;
    else if (character === '"') open = !open;
  }
  return open;
}

// An amending act's points are often plain paragraphs, "1. La articolul 80^1 …", each running to
// the next one outside the text it quotes.
function plainPoint(units: (string | ActUnit)[], label: string): ActUnit | null {
  const holder: ActUnit = { kind: 'block', label: '', heading: null, content: units, notes: [] };
  const lines: string[] = [];
  let inside = false;
  let quoted = false;
  for (const line of unitLines(holder)) {
    const number = quoted ? undefined : pointLine.exec(line)?.[1];
    if (number !== undefined) inside = plainLabel(number) === label;
    if (inside) lines.push(line);
    quoted = quotedAfter(line, quoted);
  }
  return lines.length > 0
    ? { kind: 'block', label: '', heading: null, content: lines, notes: [] }
    : null;
}

function findUnit(text: ActText, unit: CitedUnit, plainPoints = false): ActUnit | null {
  if (unit.article === null) {
    if (unit.point !== null) {
      if (plainPoints) return plainPoint(text.content, unit.point);
      for (const holder of text.content) {
        if (typeof holder === 'string') continue;
        if (holder.kind === 'point' && plainLabel(holder.label) === unit.point) return holder;
        const found = findPoint(holder, unit.point);
        if (found) return found;
      }
      return null;
    }
    if (unit.annex === null) return null;
    return unitsOf(text, 'annex', unit.annex)[0]?.unit ?? null;
  }
  const article = unitsOf(text, 'article', unit.article).find(
    (match) => match.annex === unit.annex
  )?.unit;
  if (!article) return null;
  let holder: ActUnit | undefined = article;
  if (unit.alineat !== null) {
    holder = children(article, 'alineat').find((each) => plainLabel(each.label) === unit.alineat);
  }
  if (holder && unit.letter !== null) {
    holder = children(holder, 'letter').find((each) => plainLabel(each.label) === unit.letter);
  }
  if (holder && unit.point !== null) {
    return plainPoints ? plainPoint(holder.content, unit.point) : findPoint(holder, unit.point);
  }
  return holder ?? null;
}

type Word = { value: string; start: number; end: number };

function words(text: string): Word[] {
  return [...text.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)].map((match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

const context = 5;

type Line = { value: string; words: Word[] };

function linesOf(text: string, all: Word[]): Line[] {
  const lines: Line[] = [];
  let open: Word[] = [];
  let next = text.indexOf('\n');
  const close = () => {
    lines.push({ value: open.map((word) => word.value).join(' '), words: open });
    open = [];
  };
  for (const word of all) {
    while (next >= 0 && next < word.start) {
      close();
      next = text.indexOf('\n', next + 1);
    }
    open.push(word);
  }
  close();
  return lines.filter((line) => line.words.length > 0);
}

function alignLines(before: Line[], after: Line[]): AlignOp<Line>[] | null {
  const direct = align(before, after);
  if (direct) return direct;
  const seen = new Map<string, { before: number[]; after: number[] }>();
  before.forEach((line, index) => {
    const entry = seen.get(line.value) ?? { before: [], after: [] };
    entry.before.push(index);
    seen.set(line.value, entry);
  });
  after.forEach((line, index) => seen.get(line.value)?.after.push(index));
  const pairs = [...seen.values()]
    .filter((entry) => entry.before.length === 1 && entry.after.length === 1)
    .map((entry) => [entry.before[0]!, entry.after[0]!] as const)
    .sort((a, b) => a[0] - b[0]);
  const tails: number[] = [];
  const previous: number[] = [];
  pairs.forEach(([, j], index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pairs[tails[middle]!]![1] < j) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? tails[low - 1]! : -1;
    tails[low] = index;
  });
  if (tails.length === 0) return null;
  const anchors: (readonly [number, number])[] = [];
  for (let at = tails.at(-1)!; at >= 0; at = previous[at]!) anchors.unshift(pairs[at]!);
  const ops: AlignOp<Line>[] = [];
  let i = 0;
  let j = 0;
  for (const [anchorI, anchorJ] of [...anchors, [before.length, after.length] as const]) {
    const between = alignLines(before.slice(i, anchorI), after.slice(j, anchorJ));
    if (!between) return null;
    ops.push(...between);
    if (anchorI < before.length) {
      ops.push({ kind: 'same', template: before[anchorI]!, current: after[anchorJ]! });
    }
    i = anchorI + 1;
    j = anchorJ + 1;
  }
  return ops;
}

// A long annex is compared line by line first, then word by word within the lines that differ.
function alignWords(old: string, current: string, before: Word[], after: Word[]) {
  const direct = align(before, after);
  if (direct) return direct;
  const lineOps = alignLines(linesOf(old, before), linesOf(current, after));
  if (!lineOps) return null;
  const ops: AlignOp<Word>[] = [];
  let removed: Word[] = [];
  let added: Word[] = [];
  const flush = () => {
    if (removed.length === 0 && added.length === 0) return true;
    const inner = align(removed, added);
    if (!inner) return false;
    ops.push(...inner);
    removed = [];
    added = [];
    return true;
  };
  for (const op of lineOps) {
    if (op.kind === 'same') {
      if (!flush()) return null;
      op.template!.words.forEach((word, index) =>
        ops.push({ kind: 'same', template: word, current: op.current!.words[index]! })
      );
    } else if (op.template) removed.push(...op.template.words);
    else added.push(...op.current!.words);
  }
  return flush() ? ops : null;
}

// Null when the two are too long to compare even line by line.
export function lawHunks(old: string, current: string): LawHunk[] | null {
  const before = words(old);
  const after = words(current);
  const ops = alignWords(old, current, before, after);
  if (!ops) return null;
  const hunks: LawHunk[] = [];
  let open: { old: Word[]; new: Word[]; at: number } | null = null;
  let position = 0;
  const close = () => {
    if (!open) return;
    const first = open.at;
    const last = first + open.old.length;
    const slice = (text: string, from: Word[]) =>
      from.length === 0 ? '' : text.slice(from[0]!.start, from.at(-1)!.end);
    hunks.push({
      old: slice(old, open.old),
      new: slice(current, open.new),
      before: slice(old, before.slice(Math.max(0, first - context), first)),
      after: slice(old, before.slice(last, last + context)),
    });
    open = null;
  };
  for (const op of ops) {
    if (op.kind === 'same') {
      close();
      position += 1;
      continue;
    }
    open ??= { old: [], new: [], at: position };
    if (op.template) {
      open.old.push(op.template);
      position += 1;
    } else open.new.push(op.current!);
  }
  close();
  return hunks;
}

const hasWords = (unit: ActUnit): boolean =>
  unit.content.some((item) =>
    typeof item === 'string' ? /[\p{L}\p{N}]/u.test(item) : !isRepealed(item) && hasWords(item)
  );

// An amended marginal title is a change too.
const textOf = (unit: ActUnit | null) =>
  unit && !isRepealed(unit)
    ? unitLines(unit, { everyHeading: true })
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .join('\n')
    : null;

export function compareUnit(forms: Forms, unit: CitedUnit): UnitChange {
  let found = [findUnit(forms.verified, unit), findUnit(forms.current, unit)];
  if (unit.point !== null && found.every((each) => each === null)) {
    found = [findUnit(forms.verified, unit, true), findUnit(forms.current, unit, true)];
  }
  const [verified, current] = found;
  const old = textOf(verified ?? null);
  const now = textOf(current ?? null);
  if (old === null && now === null) return { unit, status: 'missing' };
  if (old === null) return { unit, status: 'added', new: now! };
  if (now === null) return { unit, status: 'repealed', old };
  if (!hasWords(verified!) || !hasWords(current!)) {
    return { unit, status: 'uncompared', reason: 'no_text', old, new: now };
  }
  if (old === now) return { unit, status: 'unchanged', text: now };
  const hunks = lawHunks(old, now);
  if (!hunks) return { unit, status: 'uncompared', reason: 'too_long', old, new: now };
  return hunks.length === 0
    ? { unit, status: 'unchanged', text: now }
    : { unit, status: 'changed', old, new: now, hunks };
}
