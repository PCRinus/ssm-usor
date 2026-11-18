import { z } from 'zod';

/**
 * One piece of a citation's text, in order: the pieces joined give the citation back. A piece
 * that names a watched act carries its id, and the article or annex when it names one; the rest
 * is plain text.
 */
export type CitationReference = {
  text: string;
  act: string | null;
  article: string | null;
  annex: string | null;
};

const superscriptDigits: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

/** "80¹" and "80^1" are one article, written as the legislation check stores it: "80^1". */
export const articleLabel = (number: string) =>
  number
    .replace(/\s+/g, '')
    .replace(/\^?([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu, (_, run: string) =>
      [...run].reduce((label, digit) => label + superscriptDigits[digit], '^')
    );

type ActKind = 'lege' | 'hg' | 'oug' | 'og' | 'omai' | 'ordin';

// Longest spelling first within a kind; OUG before OG so the urgency ordinance is not cut short.
const actSpellings: [ActKind, string][] = [
  ['lege', String.raw`[Ll]egea|[Ll]egii|[Ll]ege|L\.`],
  ['hg', String.raw`H\.\s?G\.|HG|Hotărârea Guvernului|Hotărârii Guvernului|Hotărârea|Hotărârii`],
  [
    'oug',
    String.raw`O\.\s?U\.\s?G\.|OUG|Ordonanța de urgență a Guvernului|Ordonanței de urgență a Guvernului|Ordonanța de urgență`,
  ],
  ['og', String.raw`O\.\s?G\.|OG|Ordonanța Guvernului|Ordonanței Guvernului|Ordonanța`],
  [
    'omai',
    String.raw`O\.\s?M\.\s?A\.\s?I\.|OMAI|Ordinul (?:M\.\s?A\.\s?I\.|MAI|ministrului administrației și internelor)`,
  ],
  ['ordin', String.raw`Ordinul|Ordinului|Ord\.`],
];

const superscript = '[⁰¹²³⁴⁵⁶⁷⁸⁹]';
const number = String.raw`\d+(?:\^\d+|${superscript}+)?`;
// A Roman numeral only where nothing but a separator follows: "I.P.S.S.M." and "Codul" open with
// one.
const articleNumber = String.raw`(?:${number}(?![\d/])|[IVXLC]+(?![\p{L}\p{N}./]))`;
const alineat = String.raw`\(\s*${number}\s*\)`;
const letter = String.raw`[a-z]${superscript}*\)`;
const qualifiers =
  String.raw`(?:\s*,?\s*alin\.\s*${alineat}(?:\s*(?:,|și|–|-)\s*${alineat})*)?` +
  String.raw`(?:\s*,?\s*lit\.\s*${letter}(?:\s*(?:,|și)\s*${letter})*)?` +
  String.raw`(?:\s*,?\s*pct\.\s*\d+)?`;

const actMention = new RegExp(
  String.raw`(?<![\p{L}\p{N}.])(?<spelling>${actSpellings.map(([, spelling]) => `(?:${spelling})`).join('|')})` +
    String.raw`\s*(?:nr\.\s*)?(?<number>\d+(?:\/\d+)?)\s*\/\s*(?<year>\d{4})(?!\d)`,
  'gu'
);
const articleHead = new RegExp(
  String.raw`(?<![\p{L}])(?:[Aa]rt\.|[Aa]rticolul|[Aa]rticolului|[Aa]rticolele)\s*(?<article>${articleNumber})${qualifiers}`,
  'gu'
);
const articleMore = new RegExp(
  String.raw`^(?<gap>\s*(?:,|și)\s*)(?<article>${articleNumber})${qualifiers}`,
  'u'
);
const annexHead = new RegExp(
  String.raw`(?<![\p{L}])[Aa]nex(?:a|ei|ele)\s*(?:nr\.\s*)?(?<annex>\d+[A-Z]?)(?![\d/])`,
  'gu'
);

type Token =
  | { kind: 'act'; start: number; end: number; id: string }
  // `head` for one that opens with "art." or "anexa", not a number continuing a list.
  | { kind: 'article' | 'annex'; start: number; end: number; label: string; head: boolean };

function kindOf(spelling: string): ActKind {
  for (const [kind, pattern] of actSpellings) {
    if (new RegExp(`^(?:${pattern})$`, 'u').test(spelling)) return kind;
  }
  return 'ordin';
}

/**
 * The id the act would have among the watched ones, `lege-319-2006`; an order named without its
 * issuer is the Ministry's when only the Ministry's is watched.
 */
function actIdOf(
  spelling: string,
  actNumber: string,
  year: string,
  isWatched: (id: string) => boolean
) {
  const kind = kindOf(spelling);
  const id = (each: ActKind) => `${each}-${actNumber.replace(/\//g, '-')}-${year}`;
  if (kind === 'ordin' && !isWatched(id('ordin')) && isWatched(id('omai'))) return id('omai');
  return id(kind);
}

function tokensOf(text: string, isWatched: (id: string) => boolean): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(actMention)) {
    const { spelling, number: actNumber, year } = match.groups!;
    tokens.push({
      kind: 'act',
      start: match.index,
      end: match.index + match[0].length,
      id: actIdOf(spelling!, actNumber!, year!, isWatched),
    });
  }
  const insideAct = (at: number) => tokens.some((token) => at >= token.start && at < token.end);
  for (const match of text.matchAll(articleHead)) {
    if (insideAct(match.index)) continue;
    let end = match.index + match[0].length;
    tokens.push({
      kind: 'article',
      start: match.index,
      end,
      label: articleLabel(match.groups!.article!),
      head: true,
    });
    for (
      let more = articleMore.exec(text.slice(end));
      more;
      more = articleMore.exec(text.slice(end))
    ) {
      const start = end + more.groups!.gap!.length;
      end += more[0].length;
      tokens.push({
        kind: 'article',
        start,
        end,
        label: articleLabel(more.groups!.article!),
        head: false,
      });
    }
  }
  for (const match of text.matchAll(annexHead)) {
    if (insideAct(match.index)) continue;
    tokens.push({
      kind: 'annex',
      start: match.index,
      end: match.index + match[0].length,
      label: match.groups!.annex!,
      head: true,
    });
  }
  return tokens
    .sort((a, b) => a.start - b.start)
    .filter((token, index, all) => index === 0 || token.start >= all[index - 1]!.end);
}

const separatorsOnly = /^(?:[\s,;:–-]|și)*$/u;
// "art. 20 din Legea 319/2006", "anexa 2 la H.G. 1425/2006", "art. 242 din Codul muncii".
const linker = /^\s*,?\s*(?:din|al|a|ale|la)\s/u;
const actFollows = /^\s*,?\s*(?:din|al|a|ale|la)\s+$/u;

/**
 * Splits a citation into the acts, articles and annexes it names. An article or annex belongs to
 * the act that follows it with "din" or "la", otherwise to the act it follows with nothing but
 * separators between; one that belongs to no watched act, like the provider's own instructions'
 * "IPSU, art. 151", stays plain text. A wrong link is worse than none: in "Legea 319/2006, art. 5
 * și art. 7 din H.G. 1425/2006" only art. 7 is the decision's, and art. 242 of "art. 12 și
 * art. 242 din Codul muncii" is never given to the act before it.
 */
export function parseCitation(
  text: string,
  isWatched: (actId: string) => boolean
): CitationReference[] {
  const tokens = tokensOf(text, isWatched);
  const actOf = new Map<Token, string | null>();
  let chain: Token[] = [];
  const closeChain = (next: Token | undefined, previous: Token | undefined) => {
    if (chain.length === 0) return;
    const first = chain[0]!;
    const last = chain.at(-1)!;
    const before =
      previous?.kind === 'act' && separatorsOnly.test(text.slice(previous.end, first.start))
        ? previous.id
        : null;
    const after = text.slice(last.end, next?.start ?? text.length);
    let split = chain.length;
    let act: string | null = null;
    if (linker.test(after)) {
      split = 0;
      chain.forEach((token, index) => {
        if (token.kind !== 'act' && token.head) split = index;
      });
      act = next?.kind === 'act' && actFollows.test(after) ? next.id : null;
    }
    chain.forEach((token, index) => actOf.set(token, index < split ? before : act));
    chain = [];
  };
  let beforeChain: Token | undefined;
  tokens.forEach((token, index) => {
    if (token.kind === 'act') {
      closeChain(token, beforeChain);
      beforeChain = token;
      return;
    }
    const previous = tokens[index - 1];
    if (chain.length > 0 && !separatorsOnly.test(text.slice(previous!.end, token.start))) {
      closeChain(token, beforeChain);
    }
    if (chain.length === 0) beforeChain = previous;
    chain.push(token);
  });
  closeChain(undefined, beforeChain);

  const parts: CitationReference[] = [];
  const plain = (piece: string) => {
    if (!piece) return;
    const last = parts.at(-1);
    if (last && last.act === null) last.text += piece;
    else parts.push({ text: piece, act: null, article: null, annex: null });
  };
  let at = 0;
  for (const token of tokens) {
    plain(text.slice(at, token.start));
    const piece = text.slice(token.start, token.end);
    at = token.end;
    const act = token.kind === 'act' ? token.id : (actOf.get(token) ?? null);
    if (act === null || !isWatched(act)) {
      plain(piece);
      continue;
    }
    parts.push({
      text: piece,
      act,
      article: token.kind === 'article' ? token.label : null,
      annex: token.kind === 'annex' ? token.label : null,
    });
  }
  plain(text.slice(at));
  return parts;
}

/**
 * The one place the act's current form gives the article or annex; null when it gives none, or
 * more than one: an order's own art. 1 beside art. 1 of the norms it approves is not guessed at.
 */
export function anchorOf<Anchor extends Pick<CitationReference, 'article' | 'annex'>>(
  anchors: readonly Anchor[],
  reference: Pick<CitationReference, 'article' | 'annex'>
): Anchor | null {
  const found =
    reference.article !== null
      ? anchors.filter((anchor) => anchor.article === reference.article)
      : reference.annex !== null
        ? anchors.filter((anchor) => anchor.article === null && anchor.annex === reference.annex)
        : [];
  return found.length === 1 ? found[0]! : null;
}

export const citationLinkTargets = ['article', 'annex', 'act'] as const;
export const citationLinkTargetSchema = z.enum(citationLinkTargets);
export type CitationLinkTarget = z.infer<typeof citationLinkTargetSchema>;

export const citationPartSchema = z
  .object({
    text: z.string(),
    // The watched act the part names, `lege-319-2006`; null for plain text.
    act: z.string().nullable(),
    // "23", "80^1": the article the part names, in the act or in the norms it approves.
    article: z.string().nullable(),
    annex: z.string().nullable(),
    // On legislatie.just.ro: the article or annex itself when its place in the act's current form
    // is known, the act's page when not; null for plain text.
    url: z.url().nullable(),
    target: citationLinkTargetSchema.nullable(),
  })
  .meta({ id: 'CitationPart' });

export type CitationPart = z.infer<typeof citationPartSchema>;
