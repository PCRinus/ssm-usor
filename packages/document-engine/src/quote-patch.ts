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
  | { status: 'needs-review'; problems: PatchProblem[] };

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
 * same words as in the law, found once. Words around are added until they are found once; old
 * words found nowhere, or still found more than once, need a person.
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
  const templates = lines.map((line) => words(locate(wordingTokens(line, passage.act))));

  const most = Math.max(before.length, after.length);
  let found: { line: number; at: number; n: number }[] = [];
  let many = 0;
  for (let n = wholeContext ? most : Math.min(1, most); n <= most; n += 1) {
    const pattern = [
      ...before.slice(Math.max(0, before.length - n)),
      ...inside,
      ...after.slice(0, n),
    ];
    found = [];
    templates.forEach((tokens, line) => {
      for (let at = 0; at + pattern.length <= tokens.length; at += 1) {
        if (pattern.every((token, index) => sameWord(tokens[at + index]!, token))) {
          found.push({ line, at, n });
        }
      }
    });
    if (found.length <= 1) break;
    many = found.length;
  }
  if (found.length > 1 || (!found.length && many)) {
    return `the old words are in the template ${Math.max(many, found.length)} times`;
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

/** An alineat's or letter's place: (1) < (1¹) < (1²) < (2); a) < a¹) < b). */
function place(label: string | null) {
  const match = new RegExp(`^(\\d+|[a-z])([${superscriptDigits}]*)$`, 'u').exec(label ?? '');
  if (!match) return null;
  const base = /\d/.test(match[1]!) ? Number(match[1]) : match[1]!.charCodeAt(0) - 96;
  return { base, sup: superscriptValue(match[2]!) };
}

// A label says which alineat comes right before it, (1²) after (1¹), (2) after some (1), and
// which may come right after it; the law's own list of alineate is not at hand.
function between(previous: string | null, label: string, next: string | null) {
  const [a, b, c] = [place(previous), place(label), place(next)];
  if (!a || !b || !c) return false;
  const precedes = b.sup > 0 ? a.base === b.base && a.sup === b.sup - 1 : a.base === b.base - 1;
  const follows =
    (c.base === b.base && c.sup === b.sup + 1) || (c.base === b.base + 1 && c.sup === 0);
  return precedes && follows;
}

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
    const label = labelOf(oldText ?? newText ?? '');
    const problem = (reason: string) =>
      problems.push({ alineat: label, old: change.old, new: change.new, reason });
    const quoted = lines.find((line) => line.before !== null && labelOf(line.before) === label);

    if (oldText === null && newText === null) {
      problem('the change has neither an old nor a new text');
    } else if (oldText === null) {
      const at = lines.findIndex(
        (line, index) =>
          line.before !== null &&
          between(labelOf(line.before), label ?? '', labelOf(lines[index + 1]?.before ?? ''))
      );
      if (label === null) problem('an added alineat must open with its number or letter');
      else if (at === -1) {
        notes.push(noted(label, 'not added: the template does not quote the alineate around it'));
      } else {
        const wording = conformLine(newText!, null, context);
        notes.push(...wording.notes.map((note) => noted(label, note)));
        lines.splice(at + 1, 0, { offset: null, before: null, after: wording.text });
      }
    } else if (newText === null) {
      if (label === null) problem('a repealed alineat must open with its number or letter');
      else if (!quoted) notes.push(noted(label, 'repealed; the template does not quote it'));
      else if (quoted.offset === 0) problem('the repealed alineat shares the marker paragraph');
      else quoted.after = null;
    } else {
      const targets = quoted ? [quoted] : lines.filter((line) => line.before !== null);
      for (const hunk of textHunks(oldText, newText)) {
        anchorIn(oldText, hunk, targets, newText, false, problem);
      }
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
  return { status: 'applied', ...applyPassage(source, planned) };
}
