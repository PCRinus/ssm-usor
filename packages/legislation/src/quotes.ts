import { plainLabel } from './act-text';

export type Token = {
  value: string;
  start: number;
  end: number;
  // The alineat the token belongs to, "" before the first one.
  alineat: string;
};

const subscriptRun = /[₀₁₂₃₄₅₆₇₈₉]+/g;
const softHyphen = String.fromCharCode(0xad);

// The portal writes "CO_2" and "art. 80^1" where the templates have "CO₂" and "art. 80¹".
const fold = (word: string) =>
  plainLabel(word)
    .replace(
      subscriptRun,
      (run) => `_${[...run].map((character) => character.charCodeAt(0) - 0x2080).join('')}`
    )
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll(softHyphen, '')
    .toLowerCase();

const actKinds = [
  String.raw`Legea(?:-cadru)?`,
  String.raw`Legii(?:-cadru)?`,
  String.raw`Hotărârea Guvernului`,
  String.raw`Hotărârii Guvernului`,
  String.raw`Hotărârea`,
  String.raw`Hotărârii`,
  String.raw`H\.\s?G\.`,
  String.raw`Ordonanța de urgență a Guvernului`,
  String.raw`Ordonanței de urgență a Guvernului`,
  String.raw`Ordonanța de urgență`,
  String.raw`Ordonanței de urgență`,
  String.raw`O\.\s?U\.\s?G\.`,
  String.raw`Ordonanța Guvernului`,
  String.raw`Ordonanței Guvernului`,
  String.raw`Ordonanța`,
  String.raw`Ordonanței`,
  String.raw`O\.\s?G\.`,
  String.raw`Ordinul`,
  String.raw`Ordinului`,
  String.raw`OMAI`,
  String.raw`Decretul`,
  String.raw`Decretului`,
].join('|');
const titledKinds = [
  'Legea',
  'Legii',
  'Hotărârea Guvernului',
  'Hotărârii Guvernului',
  'Ordonanța de urgență a Guvernului',
  'Ordonanței de urgență a Guvernului',
  'Ordonanța Guvernului',
  'Ordonanței Guvernului',
  'Ordinul',
  'Ordinului',
].join('|');
const actNumber = String.raw`(\d{1,3}(?:\.\d{3})+|\d+(?:\/\d+)*)`;
// The portal names an act with its title or its issuing ministers before the number, "Legii
// securității și sănătății în muncă nr. 319/2006", where a template writes "Legii 319/2006".
const actMention = new RegExp(
  String.raw`(?<![\p{L}\d])(?:(?:${actKinds})\s+(?:nr\.\s*)?|(?:${titledKinds})\s+(?:(?!nr\.)[^\s;:.]+\s+){1,24}?nr\.\s*)` +
    String.raw`${actNumber}(?:\/(\d{4})|\s+din\s+\d{1,2}\s+\p{L}+\s+(\d{4}))(?!\d)`,
  'gu'
);

const word = new RegExp(
  String.raw`\d{1,3}(?:\.\d{3})+(?!\d)|[\p{L}\p{N}${softHyphen}]+(?:[\^_]\d+)?`,
  'gu'
);
const sup = '(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+|\\^\\d+)?';
const alineatLabel = new RegExp(String.raw`^\((\d+${sup})\)\s*`, 'u');
const listLabel = new RegExp(
  String.raw`^(?:[a-z]${sup}\)|[A-Z]\.?\)|\d+[a-z]\)|\d+${sup}(?:\.\d+)*\.)(?:\s+|$)`,
  'u'
);
const inlineLetter = new RegExp(String.raw`^[a-z]${sup}$`, 'u');

const mentionToken = (number: string, year: string) => `act:${number.replaceAll('.', '')}/${year}`;

export function actTokenOf(actId: string) {
  const match = /-(\d+(?:-\d+)*)-(\d{4})$/.exec(actId);
  return match ? mentionToken(match[1]!.replaceAll('-', '/'), match[2]!) : actId;
}

// Labels at the start of a line become boundaries, so alineate pair up by their numbers, and
// letters or points drop out, since a template often numbers its list with Word's own numbering.
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let alineat = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    let from = 0;
    const own = alineatLabel.exec(line);
    if (own) {
      alineat = plainLabel(own[1]!);
      tokens.push({ value: `¶${alineat}`, start: offset, end: offset + own[0].length, alineat });
      from = own[0].length;
    } else {
      const list = listLabel.exec(line);
      if (list) from = list[0].length;
    }
    const body = line.slice(from);
    const acts = [...body.matchAll(actMention)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      value: mentionToken(match[1]!, match[2] ?? match[3]!),
    }));
    let cursor = 0;
    const words = (until: number) => {
      for (const match of body.slice(cursor, until).matchAll(word)) {
        const at = cursor + match.index;
        const after = body[at + match[0].length];
        // A list item run into the line before it: "…la un sindicat; m¹) dreptul de…".
        if (
          after === ')' &&
          inlineLetter.test(match[0]) &&
          /(?:^|[;:])\s*$/.test(body.slice(0, at))
        ) {
          continue;
        }
        const start = offset + from + at;
        tokens.push({ value: fold(match[0]), start, end: start + match[0].length, alineat });
      }
    };
    for (const act of acts) {
      words(act.start);
      tokens.push({
        value: act.value,
        start: offset + from + act.start,
        end: offset + from + act.end,
        alineat,
      });
      cursor = act.end;
    }
    words(body.length);
    offset += line.length + 1;
  }
  return tokens;
}

type Op = { kind: 'same' | 'template' | 'current'; template?: Token; current?: Token };

function diff(template: Token[], current: Token[]): Op[] {
  const n = template.length;
  const m = current.length;
  const width = m + 1;
  if ((n + 1) * width > 2 ** 26) {
    throw new Error(`A passage of ${n} words is too long to compare with ${m}.`);
  }
  const table = new Uint32Array((n + 1) * width);
  const at = (i: number, j: number) => table[i * width + j]!;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      // An alineat's label counts as a few words, so alineate pair up rather than words that
      // happen to match across their boundary; a template that renumbers them still aligns.
      table[i * width + j] =
        template[i]!.value === current[j]!.value
          ? at(i + 1, j + 1) + (template[i]!.value.startsWith('¶') ? 8 : 1)
          : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && template[i]!.value === current[j]!.value) {
      ops.push({ kind: 'same', template: template[i]!, current: current[j]! });
      i += 1;
      j += 1;
    } else if (i < n && (j >= m || at(i + 1, j) >= at(i, j + 1))) {
      // On a tie the template's word goes first: passing over the current text instead would match
      // the template's next words further on, after words that only look alike.
      ops.push({ kind: 'template', template: template[i]! });
      i += 1;
    } else {
      ops.push({ kind: 'current', current: current[j]! });
      j += 1;
    }
  }
  return ops;
}

function commonLength(a: Token[], b: Token[]) {
  const row = new Array<number>(b.length + 1).fill(0);
  for (const left of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j]!;
      row[j] = left.value === b[j - 1]!.value ? diagonal + 1 : Math.max(row[j]!, row[j - 1]!);
      diagonal = above;
    }
  }
  return row[b.length]!;
}

// An extract compared with a whole annex matches its few words all over the annex; it is
// compared with the stretch that opens the way it does.
function excerptWindow(template: Token[], current: Token[]): [number, number] {
  const n = template.length;
  const m = current.length;
  if (m <= n + 40) return [0, m];
  const head = template.slice(0, Math.min(10, n));
  let best = -1;
  let from = 0;
  for (let j = 0; j < m; j += 1) {
    if (!head.slice(0, 3).some((token) => token.value === current[j]!.value)) continue;
    const score = commonLength(head, current.slice(j, j + head.length + 5));
    if (score > best) {
      best = score;
      from = j;
    }
  }
  const start = Math.max(0, from - 3);
  return [start, Math.min(m, start + 2 * n + 60)];
}

type Hunk = {
  template: Token[];
  current: Token[];
  // Words the two sides share between the previous change and this one.
  gap: number;
};

function hunksOf(ops: Op[]): Hunk[] {
  const hunks: Hunk[] = [];
  let open: Hunk | null = null;
  let gap = 0;
  for (const op of ops) {
    if (op.kind === 'same') {
      gap += 1;
      open = null;
      continue;
    }
    if (!open) {
      open = { template: [], current: [], gap };
      hunks.push(open);
      gap = 0;
    }
    if (op.template) open.template.push(op.template);
    else open.current.push(op.current!);
  }
  return hunks;
}

const connectors = new Set([
  'din',
  'la',
  'in',
  'de',
  'al',
  'a',
  'ale',
  'conform',
  'potrivit',
  'prevazut',
  'prevazuta',
  'prevazute',
  'prevazuti',
]);
const selfWords = new Set([
  'lege',
  'legi',
  'legea',
  'ordonanta',
  'ordonante',
  'ordonantei',
  'ordonantele',
  'urgenta',
  'de',
  'hotarare',
  'hotararea',
  'hotarari',
  'hotararii',
  'ordin',
  'ordinul',
  'ordinului',
  'norme',
  'normele',
  'normelor',
  'metodologice',
]);
const locatorWords = new Set(['art', 'alin', 'lit', 'pct']);
const locatorLabel = /^(?:\d+(?:\^\d+)?|[a-z](?:\^\d+)?|[ivxlc]+)$/;
const isLocator = (values: string[]) =>
  values.length > 0 &&
  locatorWords.has(values[0]!) &&
  values.every((value) => locatorWords.has(value) || locatorLabel.test(value));

// The templates name the act where it says "prezenta lege", and turn "alin. (1)" into "art. 5
// alin. (1) din Legea 319/2006", so that a reader of the extract knows which act is meant.
function addsActName(hunk: Hunk, actToken: string) {
  const template = hunk.template.map((token) => token.value);
  const current = hunk.current.map((token) => token.value);
  const acts = template.flatMap((value, index) => (value.startsWith('act:') ? [index] : []));
  if (acts.length !== 1) return false;
  const act = template[acts[0]!]!;
  const before = template.slice(0, acts[0]);
  const firstConnector = before.findIndex((value) => connectors.has(value));
  const locator = firstConnector < 0 ? before : before.slice(0, firstConnector);
  const joints = [
    ...(firstConnector < 0 ? [] : before.slice(firstConnector)),
    ...template.slice(acts[0]! + 1),
  ];
  if (!(locator.length === 0 || isLocator(locator))) return false;
  if (!joints.every((value) => connectors.has(value))) return false;
  if (current.length === 0) return true;
  if (locator.length > 0) return false;
  // Norms call the law they apply "legea", which the templates name.
  if (current.length === 1 && /^leg(ea|ii|e)$/.test(current[0]!)) return true;
  return (
    act === actToken &&
    /^prezent/.test(current[0]!) &&
    current.slice(1).every((value) => selfWords.has(value) || connectors.has(value))
  );
}

function presentational(hunks: Hunk[], actToken: string, article: string | null) {
  const kept = hunks.map((hunk) => addsActName(hunk, actToken));
  return hunks.map((hunk, index) => {
    if (kept[index]) return true;
    const template = hunk.template.map((token) => token.value);
    // "eveni-mentele" hyphenated across a line on the portal, "instruire - testare".
    if (template.length > 0 && template.join('') === hunk.current.map((t) => t.value).join('')) {
      return true;
    }
    if (hunk.current.length > 0 || !isLocator(template)) return false;
    if (article !== null && template.length === 2 && template[1] === article) return true;
    const next = hunks[index + 1];
    return next !== undefined && next.gap <= 12 && kept[index + 1] === true;
  });
}

export type QuoteChange = { template: string; current: string };

export type AlineatDifference = {
  // "2", "1^1"; "" for the words before the first alineat.
  alineat: string;
  template: string | null;
  current: string | null;
  changes: QuoteChange[];
};

export type QuoteComparison = {
  // Share of the template's words found in the current text, 0 to 1.
  similarity: number;
  differences: AlineatDifference[];
};

const span = (text: string, tokens: Token[]) =>
  tokens.length === 0 ? '' : text.slice(tokens[0]!.start, tokens.at(-1)!.end);

function segments(text: string, tokens: Token[]) {
  const ranges = new Map<string, { start: number; end: number }>();
  for (const token of tokens) {
    const range = ranges.get(token.alineat);
    if (range) range.end = token.end;
    else ranges.set(token.alineat, { start: token.start, end: token.end });
  }
  const lineEnd = (at: number) =>
    text.indexOf('\n', at) < 0 ? text.length : text.indexOf('\n', at);
  return new Map(
    [...ranges].map(([key, range]) => [
      key,
      text.slice(text.lastIndexOf('\n', range.start - 1) + 1, lineEnd(range.end)).trim(),
    ])
  );
}

export function compareTexts(
  templateText: string,
  currentText: string,
  options: { actToken: string; excerpt: boolean; article?: string | null }
): QuoteComparison {
  const template = tokenize(templateText);
  let current = tokenize(currentText);
  if (options.excerpt) {
    const [start, end] = excerptWindow(template, current);
    current = current.slice(start, end);
  }
  const ops = diff(template, current);
  const hunks = hunksOf(ops);
  if (options.excerpt) {
    const first = hunks[0];
    if (first && ops[0]?.kind !== 'same') first.current = [];
    const last = hunks.at(-1);
    if (last && ops.at(-1)?.kind !== 'same') last.current = [];
  }
  const labelled = (tokens: Token[]) => tokens.some((token) => token.value.startsWith('¶'));
  // One side numbering its alineate and the other not, "(1)" against "1.1.", says nothing.
  if (!labelled(template) || !labelled(current)) {
    for (const hunk of hunks) {
      hunk.template = hunk.template.filter((token) => !token.value.startsWith('¶'));
      hunk.current = hunk.current.filter((token) => !token.value.startsWith('¶'));
    }
  }
  const article = options.article ? fold(options.article) : null;
  const cosmetic = presentational(hunks, options.actToken, article);
  const templateSegments = segments(templateText, template);
  const currentSegments = segments(currentText, current);
  const byAlineat = new Map<string, AlineatDifference>();
  hunks.forEach((hunk, index) => {
    if (cosmetic[index] || (hunk.template.length === 0 && hunk.current.length === 0)) return;
    const key = (hunk.template[0] ?? hunk.current[0])!.alineat;
    let entry = byAlineat.get(key);
    if (!entry) {
      const only = (segments: Map<string, string>) =>
        segments.size === 1 ? [...segments.values()][0]! : null;
      entry = {
        alineat: key,
        template: templateSegments.get(key) ?? only(templateSegments),
        current: currentSegments.get(key) ?? only(currentSegments),
        changes: [],
      };
      byAlineat.set(key, entry);
    }
    entry.changes.push({
      template: span(templateText, hunk.template),
      current: span(currentText, hunk.current),
    });
  });
  const isWord = (token: Token) => !token.value.startsWith('¶');
  const words = template.filter(isWord).length;
  const matched =
    ops.filter((op) => op.kind === 'same' && isWord(op.template!)).length +
    hunks
      .filter((_, index) => cosmetic[index])
      .reduce((sum, hunk) => sum + hunk.template.filter(isWord).length, 0);
  return {
    similarity: words === 0 ? 1 : matched / words,
    differences: [...byAlineat.values()],
  };
}
