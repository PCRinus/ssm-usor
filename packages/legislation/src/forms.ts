import { type ActText, type ActUnit, isRepealed, plainLabel, unitLines, unitsOf } from './act-text';
import { children, type CitedPassage, findPoint, parseLocator } from './locator';
import { align } from './quotes';
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
  | { unit: CitedUnit; status: 'missing' };

type Forms = { verified: ActText; current: ActText };

function unitLabel(unit: Omit<CitedUnit, 'label'>) {
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

function findUnit(text: ActText, unit: CitedUnit): ActUnit | null {
  if (unit.article === null) {
    if (unit.point !== null) {
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
  if (holder && unit.point !== null) return findPoint(holder, unit.point);
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

export function lawHunks(old: string, current: string): LawHunk[] {
  const before = words(old);
  const after = words(current);
  const ops = align(before, after);
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

const textOf = (unit: ActUnit | null) =>
  unit && !isRepealed(unit)
    ? unitLines(unit)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .join('\n')
    : null;

export function compareUnit(forms: Forms, unit: CitedUnit): UnitChange {
  const old = textOf(findUnit(forms.verified, unit));
  const current = textOf(findUnit(forms.current, unit));
  if (old === null && current === null) return { unit, status: 'missing' };
  if (old === null) return { unit, status: 'added', new: current! };
  if (current === null) return { unit, status: 'repealed', old };
  const hunks = old === current ? [] : lawHunks(old, current);
  return hunks.length === 0
    ? { unit, status: 'unchanged', text: current }
    : { unit, status: 'changed', old, new: current, hunks };
}
