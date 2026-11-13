import {
  conformLine,
  conformSpan,
  normalizeIncoming,
  sameWord,
  type Token,
  wordingTokens,
} from './legal-wording';
import {
  applyPassage,
  labelOf,
  type Passage,
  type PassageLine,
  planPassage,
  type QuotedCitation,
  type QuoteReplacementOptions,
  readPassage,
} from './quote-replacement';
import { superscriptDigits } from './text';
import { textHunks } from './token-diff';

/**
 * One alineat or letter of the law before and after the change: `old` null for one the change
 * adds, `new` null for one it repeals. The words around a change are taken from the alineat.
 */
export interface AlineatEdit {
  old: string | null;
  new: string | null;
  /**
   * The law's unit, "Art. 13 alin. (2) lit. b)": the alineat a letter belongs to. Without it,
   * the unit is read from the label the text opens with and from the marker's locator.
   */
  unit?: string;
}

/** Each `old` with the words around the change that find it in the template. */
export interface AlineatHunks {
  hunks: { old: string; new: string }[];
}

export type LawChange = AlineatEdit | AlineatHunks;

export interface QuotePatch {
  citation: QuotedCitation;
  changes: LawChange[];
  locator?: string;
}

export interface PatchProblem {
  /** The alineat or letter the law's text opens with: "2", "1¹", "b". */
  alineat: string | null;
  old: string | null;
  new: string | null;
  reason: string;
}

export type PatchResult =
  | ({ status: 'applied' } & ReturnType<typeof applyPassage>)
  | { status: 'needs-review'; problems: PatchProblem[] }
  /** Every change fell outside what the quote holds: the notes say where each went. */
  | { status: 'nothing-to-apply'; notes: string[] };

type Located = Token & { start: number; end: number };

const locate = (tokens: Token[]): Located[] => {
  let at = 0;
  return tokens.map((token) => {
    const start = at;
    at += token.text.length;
    return { ...token, start, end: at };
  });
};
const words = (tokens: Located[]) => tokens.filter((token) => /\S/.test(token.text));

interface Anchor {
  line: number;
  /** The template's characters the change replaces, in that line. */
  start: number;
  end: number;
  /** The law's new words for them, before the template's conventions. */
  replacement: string;
}

/**
 * Where a change of the law's text sits among the template's lines: its old words between the
 * same words as in the law. Words around are added until the law holds them once; the template
 * must then hold them once too, or a person decides.
 */
function anchorHunk(
  lawOld: string,
  hunk: { start: number; end: number; insert: string },
  lines: string[],
  passage: Passage,
  wholeContext: boolean
): Anchor | string {
  const law = locate(wordingTokens(lawOld, passage.act));
  const start = Math.min(hunk.start, ...law.filter((t) => t.end > hunk.start).map((t) => t.start));
  const end = Math.max(hunk.end, ...law.filter((t) => t.start < hunk.end).map((t) => t.end));
  const inside = words(law.filter((t) => t.start >= start && t.end <= end));
  const before = words(law.filter((t) => t.end <= start));
  const after = words(law.filter((t) => t.start >= end));
  const lawWords = words(law);
  const templates = lines.map((line) => words(locate(wordingTokens(line, passage.act))));
  const patternOf = (n: number) => [
    ...before.slice(Math.max(0, before.length - n)),
    ...inside,
    ...after.slice(0, n),
  ];
  const occurrences = (tokens: Token[], pattern: Token[]) => {
    const at: number[] = [];
    for (let index = 0; index + pattern.length <= tokens.length; index += 1) {
      if (pattern.every((token, offset) => sameWord(tokens[index + offset]!, token))) {
        at.push(index);
      }
    }
    return at;
  };

  const most = Math.max(before.length, after.length);
  let found: { line: number; at: number; n: number }[] = [];
  let many = 0;
  let inLaw = 1;
  let heldOnce = false;
  for (let n = wholeContext ? most : Math.min(1, most); n <= most; n += 1) {
    const pattern = patternOf(n);
    found = templates.flatMap((tokens, line) =>
      occurrences(tokens, pattern).map((at) => ({ line, at, n }))
    );
    if (found.length > 1) many = found.length;
    if (found.length === 1) heldOnce = true;
    if (!found.length) break;
    inLaw = occurrences(lawWords, pattern).length;
    if (found.length === 1 && inLaw === 1) break;
  }
  if (found.length > 1 || (!found.length && many)) {
    return `the old words are in the template ${Math.max(many, found.length)} times`;
  }
  if (!found.length && heldOnce) {
    return `the old words are in the law ${inLaw} times, and the template does not hold the words around them that tell which`;
  }
  if (!found.length) return "the template's passage does not hold the old words";

  const { line, at, n } = found[0]!;
  const left = before.slice(Math.max(0, before.length - n));
  const right = after.slice(0, n);
  const pattern = [...left, ...inside, ...right];
  const matched = templates[line]!.slice(at, at + pattern.length);
  const first = left.length ? left.length - 1 : 0;
  const last = right.length ? left.length + inside.length : pattern.length - 1;
  const opening = left.length ? 'end' : 'start';
  const closing = right.length ? 'start' : 'end';
  const from = { law: pattern[first]![opening], template: matched[first]![opening] };
  const to = { law: pattern[last]![closing], template: matched[last]![closing] };
  return {
    line,
    start: from.template,
    end: to.template,
    replacement: lawOld.slice(from.law, hunk.start) + hunk.insert + lawOld.slice(hunk.end, to.law),
  };
}

const superscriptValue = (text: string) =>
  [...text].reduce((value, char) => value * 10 + superscriptDigits.indexOf(char), 0);

/** An alineat's or letter's rank: (1) < (1¹) < (1²) < (2); a) < a¹) < b). */
function rank(label: string | null) {
  const match = new RegExp(`^(\\d+|[a-z])([${superscriptDigits}]*)$`, 'u').exec(label ?? '');
  if (!match) return null;
  const base = /\d/.test(match[1]!) ? Number(match[1]) : match[1]!.charCodeAt(0) - 96;
  return { base, sup: superscriptValue(match[2]!) };
}

const compareRanks = (a: string | null, b: string | null) => {
  const [x, y] = [rank(a), rank(b)];
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  return x.base - y.base || x.sup - y.sup;
};

// A label says which alineat comes right before it, (1²) after (1¹), (2) after some (1), and
// which may come right after it; the law's own list of alineate is not at hand.
function precedes(previous: string | null, label: string) {
  const [a, b] = [rank(previous), rank(label)];
  if (!a || !b) return false;
  return b.sup > 0 ? a.base === b.base && a.sup === b.sup - 1 : a.base === b.base - 1;
}
function follows(label: string, next: string | null) {
  const [b, c] = [rank(label), rank(next)];
  if (!b || !c) return false;
  return (c.base === b.base && c.sup === b.sup + 1) || (c.base === b.base + 1 && c.sup === 0);
}

/**
 * Where a line of the quote, or a unit of the law, sits. A letter's alineat is undefined where
 * it is not known; null for both is the whole of an article.
 */
interface Place {
  alineat: string | null | undefined;
  letter: string | null;
}

const isAlineat = (label: string) => /^\d/.test(label);
const supers = `[${superscriptDigits}]*`;

/** The alineate and letters a marker names; null where it names none, quoting them all. */
interface Scope {
  alineate: { labels: string[]; range: boolean } | null;
  letters: string[] | null;
}

function scopeOf(locator: string): Scope {
  const alineate = new RegExp(`alin\\. ((?:\\(\\d+${supers}\\)(?:, | și | ?– ?)?)+)`, 'u').exec(
    locator
  )?.[1];
  const letters = new RegExp(`lit\\. ((?:[a-z]${supers}\\)(?:, | și )?)+)`, 'u').exec(locator)?.[1];
  return {
    alineate: alineate
      ? {
          labels: [...alineate.matchAll(new RegExp(`\\((\\d+${supers})\\)`, 'gu'))].map(
            (match) => match[1]!
          ),
          range: alineate.includes('–'),
        }
      : null,
    letters: letters
      ? [...letters.matchAll(new RegExp(`([a-z]${supers})\\)`, 'gu'))].map((match) => match[1]!)
      : null,
  };
}

function covers(scope: Scope, unit: Place) {
  const { alineate, letters } = scope;
  if (unit.alineat && alineate) {
    const named = alineate.range
      ? compareRanks(alineate.labels[0]!, unit.alineat) <= 0 &&
        compareRanks(unit.alineat, alineate.labels.at(-1)!) <= 0
      : alineate.labels.includes(unit.alineat);
    if (!named) return false;
  }
  return !unit.letter || !letters || letters.includes(unit.letter);
}

function placesOf(lines: (string | null)[], scope: Scope): Place[] {
  let alineat = scope.alineate?.labels.length === 1 ? scope.alineate.labels[0]! : null;
  let letter = scope.letters?.length === 1 ? scope.letters[0]! : null;
  return lines.map((line) => {
    const label = line === null ? null : labelOf(line);
    if (label && isAlineat(label)) {
      alineat = label;
      letter = null;
    } else if (label) letter = label;
    return { alineat, letter };
  });
}

function unitOf(given: string | undefined, text: string, scope: Scope): Place {
  if (given !== undefined) {
    return {
      alineat: new RegExp(`alin\\. \\((\\d+${supers})\\)`, 'u').exec(given)?.[1] ?? null,
      letter: new RegExp(`lit\\. ([a-z]${supers})\\)`, 'u').exec(given)?.[1] ?? null,
    };
  }
  const label = labelOf(text);
  if (label === null) return { alineat: null, letter: null };
  if (isAlineat(label)) return { alineat: label, letter: null };
  const alineat = scope.alineate?.labels.length === 1 ? scope.alineate.labels[0] : undefined;
  return { alineat, letter: label };
}

const holds = (line: Place, unit: Place) =>
  (unit.alineat === undefined || line.alineat === unit.alineat) &&
  (unit.letter === null || line.letter === unit.letter);

/**
 * Applies the law's own change, old words → new words, to a quote, and only where the quote
 * still holds the old words: the provider's rewording and the merge fields around the change
 * stay. Either every change is placed or nothing is, and the result names what was not.
 */
export function patchQuote(
  source: Uint8Array,
  patch: QuotePatch,
  options: QuoteReplacementOptions = {}
): PatchResult {
  const passage = readPassage(source, patch.citation);
  const context = { act: passage.act, dictionary: options.dictionary };
  const scope = scopeOf(passage.quote.locator!);
  const lines: PassageLine[] = passage.owners.map((owner) => ({
    offset: owner.offset,
    before: owner.line,
    after: owner.line,
  }));
  const problems: PatchProblem[] = [];
  const notes: string[] = [];
  const anchors: (Omit<Anchor, 'line'> & {
    line: PassageLine;
    law: string;
    alineat: string | null;
  })[] = [];
  const noted = (label: string | null, note: string) => (label ? `(${label}) ${note}` : note);
  const placesNow = () =>
    placesOf(
      lines.map((line) => line.before ?? line.after),
      scope
    );

  const anchorIn = (
    oldText: string,
    hunk: { start: number; end: number; insert: string },
    targets: PassageLine[],
    newText: string,
    wholeContext: boolean,
    problem: (reason: string) => void
  ) => {
    const anchor = anchorHunk(
      oldText,
      hunk,
      targets.map((line) => line.before!),
      passage,
      wholeContext
    );
    if (typeof anchor === 'string') {
      problem(
        `${anchor}: "${oldText.slice(hunk.start, hunk.end).trim()}" → "${hunk.insert.trim()}"`
      );
    } else {
      anchors.push({
        ...anchor,
        line: targets[anchor.line]!,
        law: newText,
        alineat: labelOf(oldText),
      });
    }
  };

  /** The template's lines that hold the unit, none when it quotes none; why, when it cannot tell. */
  const linesOf = (unit: Place): PassageLine[] | string => {
    const quoted = lines.filter((line) => line.before !== null);
    if (unit.alineat === null && unit.letter === null) return quoted;
    const places = placesNow();
    const held = lines.filter((line, index) => line.before !== null && holds(places[index]!, unit));
    const label = unit.letter ?? unit.alineat;
    const heads = held.filter((line) => labelOf(line.before!) === label);
    if (heads.length > 1) return `the template quotes (${label}) ${heads.length} times`;
    if (held.length) return held;
    // A quote of one line whose label the provider left out, under a marker that names the unit.
    const [only] = quoted;
    return quoted.length === 1 && labelOf(only!.before!) === null && covers(scope, unit)
      ? [only!]
      : [];
  };

  const insertionPoint = (unit: Place): number | string | null => {
    const places = placesNow();
    const label = (unit.letter ?? unit.alineat)!;
    const byLetter = unit.letter !== null;
    const key = (at: Place) => (byLetter ? at.letter : at.alineat);
    const inUnit = (at: Place | undefined) =>
      at !== undefined && (!byLetter || unit.alineat === undefined || at.alineat === unit.alineat);
    const points = places.flatMap((here, index) => {
      const next = places[index + 1];
      if (!inUnit(here) || !precedes(key(here) ?? null, label)) return [];
      if (!inUnit(next) || (byLetter && next!.alineat !== here.alineat)) return [];
      return follows(label, key(next!) ?? null) ? [index + 1] : [];
    });
    if (points.length > 1)
      return `the template quotes the place of (${label}) ${points.length} times`;
    return points[0] ?? null;
  };

  const additions: { change: AlineatEdit; text: string; unit: Place }[] = [];

  for (const change of patch.changes) {
    if ('hunks' in change) {
      for (const hunk of change.hunks) {
        const oldText = normalizeIncoming(hunk.old);
        const newText = normalizeIncoming(hunk.new);
        const pieces = textHunks(oldText, newText);
        if (!pieces.length) continue;
        const merged = {
          start: pieces[0]!.start,
          end: pieces.at(-1)!.end,
          insert: newText.slice(
            pieces[0]!.start,
            newText.length - (oldText.length - pieces.at(-1)!.end)
          ),
        };
        anchorIn(
          oldText,
          merged,
          lines.filter((line) => line.before !== null),
          newText,
          true,
          (reason) =>
            problems.push({ alineat: labelOf(oldText), old: hunk.old, new: hunk.new, reason })
        );
      }
      continue;
    }

    const oldText = change.old === null ? null : normalizeIncoming(change.old);
    const newText = change.new === null ? null : normalizeIncoming(change.new);
    const unit = unitOf(change.unit, oldText ?? newText ?? '', scope);
    const label = unit.letter ?? unit.alineat ?? null;
    const problem = (reason: string) =>
      problems.push({ alineat: label, old: change.old, new: change.new, reason });
    const unquoted = (note: string) => {
      const cited = (scope.alineate !== null || scope.letters !== null) && covers(scope, unit);
      if (cited) problem('the marker cites it, but the quote holds no line of it');
      else notes.push(noted(label, note));
    };

    if (oldText === null && newText === null) {
      problem('the change has neither an old nor a new text');
    } else if (oldText === null) {
      if (label === null) problem('an added alineat must open with its number or letter');
      else additions.push({ change, text: newText!, unit });
    } else if (newText === null) {
      const targets =
        label === null ? 'a repealed alineat must open with its number or letter' : linesOf(unit);
      if (typeof targets === 'string') problem(targets);
      else if (!targets.length) unquoted('repealed; the template does not quote it');
      else if (targets.some((line) => line.offset === 0)) {
        problem('the repealed alineat shares the marker paragraph');
      } else if (targets.length === lines.filter((line) => line.before !== null).length) {
        problem('the change repeals all the quote holds');
      } else for (const line of targets) line.after = null;
    } else {
      const targets = linesOf(unit);
      if (typeof targets === 'string') problem(targets);
      else if (!targets.length) unquoted('not changed; the template does not quote it');
      else {
        for (const hunk of textHunks(oldText, newText)) {
          anchorIn(oldText, hunk, targets, newText, false, problem);
        }
      }
    }
  }

  // Lines a patch adds are the neighbours of the next it adds: (1²) goes after the (1¹) added.
  additions.sort(
    (a, b) =>
      compareRanks(a.unit.alineat ?? null, b.unit.alineat ?? null) ||
      compareRanks(a.unit.letter, b.unit.letter)
  );
  for (const { change, text, unit } of additions) {
    const label = (unit.letter ?? unit.alineat)!;
    const at = insertionPoint(unit);
    if (typeof at === 'string') {
      problems.push({ alineat: label, old: change.old, new: change.new, reason: at });
    } else if (at === null) {
      if (covers(scope, unit)) {
        problems.push({
          alineat: label,
          old: change.old,
          new: change.new,
          reason: 'it falls within the quote, but not between two lines the template quotes',
        });
      } else {
        notes.push(noted(label, 'not added: the template does not quote the alineate around it'));
      }
    } else {
      const wording = conformLine(text, null, context);
      notes.push(...wording.notes.map((note) => noted(label, note)));
      lines.splice(at, 0, { offset: null, before: null, after: wording.text });
    }
  }

  for (const line of lines) {
    const placed = anchors
      .filter((anchor) => anchor.line === line)
      .sort((a, b) => b.start - a.start);
    if (!placed.length) continue;
    if (placed.some((anchor, at) => at > 0 && anchor.end > placed[at - 1]!.start)) {
      problems.push({
        alineat: placed[0]!.alineat,
        old: null,
        new: null,
        reason: 'two changes fall on the same words of the template',
      });
      continue;
    }
    if (line.after === null) continue;
    let text = line.before!;
    for (const anchor of placed) {
      const head = text.slice(0, anchor.start);
      const tail = text.slice(anchor.end);
      const wording = conformSpan(anchor.replacement, head, anchor.law, context);
      notes.push(...wording.notes.map((note) => noted(anchor.alineat, note)));
      let middle = wording.text;
      if (/\s$/.test(head)) middle = middle.replace(/^\s+/, '');
      if (/^\s/.test(tail)) middle = middle.replace(/\s+$/, '');
      text = head + middle + tail;
    }
    line.after = text;
  }

  if (problems.length) return { status: 'needs-review', problems };
  const planned = planPassage(passage, lines, patch.locator ?? passage.quote.locator!, notes);
  if (!planned.summary.changes.length && planned.summary.locator === passage.quote.locator) {
    return { status: 'nothing-to-apply', notes: planned.summary.notes };
  }
  return { status: 'applied', ...applyPassage(source, planned) };
}
