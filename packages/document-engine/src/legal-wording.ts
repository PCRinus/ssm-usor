import type { ActKind, ActName } from './citations';
import { superscriptDigits } from './text';
import { diff, tokenize } from './token-diff';

// The portal's consolidated text follows the act; the templates follow the wording pass
// (`tools/import/wording.ro.json`) and the act-name sweep. What this module brings over is
// spelling only: a word the portal changed stays changed.

const plain: Record<string, string> = {
  ă: 'a',
  â: 'a',
  î: 'i',
  ș: 's',
  ş: 's',
  ț: 't',
  ţ: 't',
  Ă: 'A',
  Â: 'A',
  Î: 'I',
  Ș: 'S',
  Ş: 'S',
  Ț: 'T',
  Ţ: 'T',
};
const quoteMarks = '«»„”“"‟″';
const fold = (text: string) =>
  [...text]
    .map((char) => plain[char] ?? (quoteMarks.includes(char) ? '"' : /\s/.test(char) ? ' ' : char))
    .join('');
const isMarked = (char: string) => char in plain;

const prefixes: Record<ActKind, string> = {
  lege: 'Legea',
  hg: 'H.G.',
  oug: 'O.U.G.',
  og: 'O.G.',
  ordin: 'Ordinul',
  omai: 'OMAI',
};
const genitives: Partial<Record<ActKind, string>> = { lege: 'Legii', ordin: 'Ordinului' };

type Case = 'nominative' | 'genitive';

/** How the act names itself in its own text, on the folded text: "prezenta lege". */
const selfReferences: Record<ActKind, Record<Case, string>> = {
  lege: { nominative: 'prezenta lege', genitive: 'prezentei legi' },
  hg: { nominative: 'prezenta hotarare', genitive: 'prezentei hotarari' },
  oug: {
    nominative: 'prezenta ordonanta de urgenta',
    genitive: 'prezentei ordonante de urgenta',
  },
  og: { nominative: 'prezenta ordonanta', genitive: 'prezentei ordonante' },
  ordin: { nominative: 'prezentul ordin', genitive: 'prezentului ordin' },
  omai: { nominative: 'prezentul ordin', genitive: 'prezentului ordin' },
};

export interface LineWording {
  text: string;
  /** What a reviewer should look at: spellings brought over, names put in, words left alone. */
  notes: string[];
}

export interface WordingContext {
  act: ActName;
  /** Words the wording pass restores diacritics in, without them → with them. */
  dictionary?: Record<string, string>;
}

const number = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)\s*\/\s*(\d{4})`;
const otherActs: [RegExp, (kind: string, num: string, year: string) => string][] = [
  [
    new RegExp(
      String.raw`\b(Ordonanta|Ordonantei) de urgenta a Guvernului (?:nr\.\s*)?${number}`,
      'gi'
    ),
    (_, num, year) => `O.U.G. ${num}/${year}`,
  ],
  [
    new RegExp(String.raw`\b(Ordonanta|Ordonantei) Guvernului (?:nr\.\s*)?${number}`, 'gi'),
    (_, num, year) => `O.G. ${num}/${year}`,
  ],
  [
    new RegExp(String.raw`\b(Hotararea|Hotararii) Guvernului (?:nr\.\s*)?${number}`, 'gi'),
    (_, num, year) => `H.G. ${num}/${year}`,
  ],
  [
    new RegExp(String.raw`\b(Legea|Legii|Ordinul|Ordinului) (?:nr\.\s*)?${number}`, 'gi'),
    (kind, num, year) => `${kind[0]!.toUpperCase()}${kind.slice(1).toLowerCase()} ${num}/${year}`,
  ],
  [
    new RegExp(String.raw`\b(H\.\s?G\.|O\.\s?U\.\s?G\.|O\.\s?G\.|OMAI) (?:nr\.\s*)?${number}`, 'g'),
    (kind, num, year) => `${kind.replace(/\s/g, '')} ${num}/${year}`,
  ],
];

/** Rewrites matches found on the folded text in the original, which has the same length. */
function replaceFolded(
  text: string,
  pattern: RegExp,
  replace: (match: RegExpMatchArray) => string
) {
  const folded = fold(text);
  let result = '';
  let last = 0;
  for (const match of folded.matchAll(pattern)) {
    result += text.slice(last, match.index);
    result += replace(match);
    last = match.index + match[0].length;
  }
  return result + text.slice(last);
}

export function normalizeIncoming(line: string) {
  return normalizeSpan(line).trim();
}

/** As `normalizeIncoming`, keeping the space at either end of a piece of a line. */
export function normalizeSpan(span: string) {
  let text = span
    .normalize('NFC')
    .replace(/[şŞţŢ]/g, (char) => ({ ş: 'ș', Ş: 'Ș', ţ: 'ț', Ţ: 'Ț' })[char]!)
    .replace(/\^\{?(\d+)\}?/g, (_, digits: string) =>
      [...digits].map((digit) => superscriptDigits[Number(digit)]).join('')
    )
    .replace(/\s+/g, ' ')
    .replace(/ - /g, ' – ')
    .replace(/ ([,;:.)])/g, '$1')
    .replace(/\( /g, '(');
  for (const [pattern, name] of otherActs) {
    text = replaceFolded(text, pattern, (match) =>
      name(match[1]!, match[2]!.replace(/\./g, ''), match[3]!)
    );
  }
  return text;
}

export interface Token {
  text: string;
  /** Set on the act's own name and on "prezenta lege" and its kin. */
  self?: { case: Case | 'any'; named: boolean };
}

function actNames(act: ActName) {
  const genitive = genitives[act.kind];
  const nominative = act.name;
  return {
    nominative,
    genitive: genitive ? nominative.replace(prefixes[act.kind], genitive) : nominative,
  };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export function wordingTokens(text: string, act: ActName): Token[] {
  const names = actNames(act);
  const references = selfReferences[act.kind];
  const spans: { start: number; end: number; self: NonNullable<Token['self']> }[] = [];
  const find = (pattern: RegExp, self: NonNullable<Token['self']>, on: string) => {
    for (const match of on.matchAll(pattern)) {
      spans.push({ start: match.index, end: match.index + match[0].length, self });
    }
  };
  const folded = fold(text);
  const bounded = (body: string) => new RegExp(`(?<![\\p{L}\\d.])${body}(?![\\p{L}\\d])`, 'giu');
  for (const kase of ['nominative', 'genitive'] as const) {
    find(bounded(escape(references[kase])), { case: kase, named: false }, folded);
  }
  if (names.nominative === names.genitive) {
    find(bounded(escape(names.nominative)), { case: 'any', named: true }, text);
  } else {
    find(bounded(escape(names.nominative)), { case: 'nominative', named: true }, text);
    find(bounded(escape(names.genitive)), { case: 'genitive', named: true }, text);
  }
  spans.sort((a, b) => a.start - b.start);
  const result: Token[] = [];
  let last = 0;
  for (const span of spans) {
    if (span.start < last) continue;
    result.push(...tokenize(text.slice(last, span.start)).map((each) => ({ text: each })));
    result.push({ text: text.slice(span.start, span.end), self: span.self });
    last = span.end;
  }
  result.push(...tokenize(text.slice(last)).map((each) => ({ text: each })));
  return result;
}

const sameSelf = (a: NonNullable<Token['self']>, b: NonNullable<Token['self']>) =>
  a.case === 'any' || b.case === 'any' || a.case === b.case;

export const sameWord = (template: Token, incoming: Token) =>
  template.self && incoming.self
    ? sameSelf(template.self, incoming.self)
    : !template.self && !incoming.self && fold(template.text) === fold(incoming.text);

/**
 * The template's spelling of a word the portal writes with other quote marks, or without the
 * diacritics of a line that has none; null where the portal adds, changes or drops a diacritic
 * in a line with diacritics, which makes it another word: "casca" in the template, "cască" in
 * the portal; "o măsură" in the template, "măsura" in the portal.
 */
function templateSpelling(template: string, incoming: string, portalHasDiacritics: boolean) {
  if (template === incoming) return template;
  const a = [...template];
  const b = [...incoming];
  if (a.length !== b.length) return null;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    if (!portalHasDiacritics && isMarked(a[index]!) && !isMarked(b[index]!)) continue;
    if (fold(a[index]!) === '"' || fold(a[index]!) === ' ') continue;
    return null;
  }
  return template;
}

// "art. 5 din prezenta lege" names the act in the templates ("art. 5 din Legea 319/2006"), the
// template not being the act; "prezenta lege se aplică" alone stays as the act wrote it.
function refersToArticle(before: string) {
  const window = before.slice(-80);
  const locators = [...window.matchAll(/\b(?:art|alin|lit|pct)\.|\banex/giu)];
  const last = locators.at(-1);
  if (!last) return false;
  return /^[^;]*\s(?:din|al|ale|a)\s$/u.test(window.slice(last.index));
}

function romanianQuote(mark: string, before: string) {
  if (mark === '«' || mark === '“') return '„';
  if (mark === '»') return '”';
  if (mark === '"') return before === '' || /[\s(]$/.test(before) ? '„' : '”';
  return mark;
}

function matchCase(source: string, target: string) {
  return /^\p{Lu}/u.test(source) ? target[0]!.toUpperCase() + target.slice(1) : target;
}

interface NewWords {
  act: ActName;
  dictionary: Record<string, string>;
  /** Whether the law's text has diacritics: a word without them is then not listed. */
  hasDiacritics: boolean;
  notes: string[];
  unchecked: Set<string>;
}

function appendNew(text: string, token: Token, words: NewWords) {
  const names = actNames(words.act);
  if (token.self && !token.self.named && refersToArticle(text)) {
    const name = token.self.case === 'genitive' ? names.genitive : names.nominative;
    words.notes.push(`"${token.text}" named as "${name}"`);
    return text + name;
  }
  if (!token.self && /^\p{L}+$/u.test(token.text) && !/[ăâîșț]/i.test(token.text)) {
    const restored = words.dictionary[token.text.toLowerCase()];
    if (restored) {
      const spelled = matchCase(token.text, restored);
      words.notes.push(`"${token.text}" spelled "${spelled}"`);
      return text + spelled;
    }
    if (!words.hasDiacritics) words.unchecked.add(token.text);
    return text + token.text;
  }
  return text + romanianQuote(token.text, text);
}

function closeNotes(words: NewWords) {
  if (words.unchecked.size) {
    words.notes.push(
      `written without diacritics, words the template lacks: ${[...words.unchecked].join(', ')}`
    );
  }
  return words.notes;
}

const hasDiacriticsIn = (text: string) =>
  /[ăâîșțĂÂÎȘȚ]/.test(text.normalize('NFC').replace(/[şţŞŢ]/g, 'ș'));

const newWords = (law: string, { act, dictionary = {} }: WordingContext): NewWords => ({
  act,
  dictionary,
  hasDiacritics: hasDiacriticsIn(law),
  notes: [],
  unchecked: new Set(),
});

/**
 * Words of the portal's that go after `before` in a template line, in the template's
 * conventions; `law` is the whole text of the law they come from.
 */
export function conformSpan(
  span: string,
  before: string,
  law: string,
  context: WordingContext
): LineWording {
  const words = newWords(law, context);
  let text = before;
  for (const token of wordingTokens(normalizeSpan(span), context.act)) {
    text = appendNew(text, token, words);
  }
  return { text: text.slice(before.length), notes: closeNotes(words) };
}

/**
 * The portal's line in the template's conventions. `template` is the line it replaces, whose
 * spellings, quote marks and names of the act are kept wherever the words are the same.
 */
export function conformLine(
  line: string,
  template: string | null,
  context: WordingContext
): LineWording {
  const words = newWords(line, context);
  const incoming = wordingTokens(normalizeIncoming(line), context.act);
  const old = template === null ? [] : wordingTokens(template, context.act);
  let text = '';
  for (const op of diff(old, incoming, sameWord)) {
    if (op.kind === 'delete') continue;
    if (op.kind === 'insert') {
      text = appendNew(text, op.after, words);
      continue;
    }
    const kept = op.before.self
      ? op.before.text
      : (templateSpelling(op.before.text, op.after.text, words.hasDiacritics) ?? op.after.text);
    if (
      kept !== op.before.text &&
      !op.before.self &&
      templateSpelling(op.before.text, op.after.text, false) !== null &&
      /\p{L}/u.test(kept)
    ) {
      words.notes.push(`took the portal's "${kept}" where the template wrote "${op.before.text}"`);
    }
    text += kept;
  }
  return { text: text.replace(/ {2,}/g, ' ').trim(), notes: closeNotes(words) };
}
