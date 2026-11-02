import { foldText, type InstructionDomain } from '@ssm-usor/contracts';

import { type CutInstruction, type InstructionsFile, printedArticle } from './instructions-cut';
import type { CitationSection, InstructionsAnswer } from './instructions-request';
import { sameName } from './match';

// A pack numbers its common part and its subchapters in one sequence ("main"), and restarts
// the numbers in each block it numbers on its own ("I.P.S.S.M. 2.", "Anexa nr. 1": "own").
// Another file's own sequence is "apart": only a whole-document citation reaches it.
export type NumberingScope =
  { kind: 'main' } | { kind: 'own'; number: number } | { kind: 'apart'; file: string };

export type CitationReference =
  | { kind: 'articles'; scope: NumberingScope; from: number; to: number }
  | { kind: 'block'; number: number; written: string }
  | { kind: 'chapters'; from: number; to: number }
  | { kind: 'document' };

export type UndecidedReason =
  | { kind: 'number_twice'; scope: NumberingScope; number: number }
  | { kind: 'cuts_instruction'; instruction: string }
  | { kind: 'number_shared'; number: number }
  | { kind: 'missing_reference'; reference: string };

export type PostResolution =
  { kind: 'resolved'; instructions: string[] } | { kind: 'undecided'; reasons: UndecidedReason[] };

export interface PostCitation {
  section: CitationSection;
  citation: string;
  file: string;
  quote: string;
}

export interface ResolvedPosition {
  key: string;
  post: string;
  variant: string;
  clientPost: string | null;
  citations: PostCitation[];
  resolution: PostResolution;
  // Blocks or annexes the themes cite that the pack does not hold, left out of the resolution.
  missing: string[];
}

const documentWords: Record<InstructionDomain, string> = { ssm: 'ipssm', psi: 'ipsu' };

const foreignDocuments = new Set([
  'missmig',
  'missm',
  'mispsi',
  'misu',
  'tassm',
  'tasu',
  'hg',
  'lege',
  'legea',
  'legii',
  'og',
  'oug',
  'ordin',
  'ordinul',
  'omai',
  'ord',
]);
const annexWords = new Set(['anexa', 'anexe', 'anexei', 'anexele', 'anexelor']);
const articleWords = new Set(['art', 'arts', 'articol', 'articolul', 'articole', 'articolele']);
const chapterWords = new Set(['cap', 'capitol', 'capitolul', 'capitole', 'capitolele']);
const wholeWords = new Set(['integral', 'integrala', 'complet', 'completa', 'intreg', 'intregul']);
const skippedWords = new Set(['nr', 'si', 'and']);

const romanValues: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

function roman(word: string) {
  if (!/^[ivxlc]+$/u.test(word)) return null;
  let total = 0;
  for (let index = 0; index < word.length; index++) {
    const value = romanValues[word[index]!]!;
    const next = romanValues[word[index + 1] ?? ''] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

type Token =
  | { kind: 'number'; value: number; text: string }
  | { kind: 'word'; value: string }
  | { kind: 'dash' }
  | { kind: 'comma' };

function tokenize(citation: string): Token[] {
  const text = citation
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\bi[\W_]{0,3}p[\W_]{0,3}s[\W_]{0,3}s[\W_]{0,3}m\b/gu, ' ipssm ')
    .replace(/\bi[\W_]{0,3}p[\W_]{0,3}s[\W_]{0,3}u\b/gu, ' ipsu ')
    .replace(
      /\bm[\W_]{0,2}i[\W_]{0,2}s[\W_]{0,2}s[\W_]{0,2}m[\W_]{0,2}i[\W_]{0,2}g\b/gu,
      ' missmig '
    )
    .replace(/\bh[\W_]{0,2}g\b/gu, ' hg ');
  const tokens: Token[] = [];
  for (const match of text.matchAll(/(\d+)|([a-z]+)|([-–—])|([,;/+&])/gu)) {
    if (match[1]) tokens.push({ kind: 'number', value: Number(match[1]), text: match[1] });
    else if (match[2]) tokens.push({ kind: 'word', value: match[2] });
    else if (match[3]) tokens.push({ kind: 'dash' });
    else tokens.push({ kind: 'comma' });
  }
  return tokens;
}

export function parseCitation(domain: InstructionDomain, citation: string): CitationReference[] {
  const tokens = tokenize(citation);
  const references: CitationReference[] = [];
  let foreign = false;
  let scope: NumberingScope = { kind: 'main' };
  let mode: 'none' | 'document' | 'annexes' | 'articles' | 'chapters' = 'none';
  let lastBlock: { reference: CitationReference & { kind: 'block' }; at: number } | null = null;

  const numberAt = (index: number) => {
    const token = tokens[index];
    if (token?.kind === 'number') return token.value;
    if (mode === 'chapters' && token?.kind === 'word') return roman(token.value);
    return null;
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.kind === 'word') {
      const word = token.value;
      if (word === documentWords[domain]) {
        foreign = false;
        scope = { kind: 'main' };
        mode = 'document';
        lastBlock = null;
        continue;
      }
      if (Object.values(documentWords).includes(word) || foreignDocuments.has(word)) {
        foreign = true;
        mode = 'none';
        continue;
      }
      if (foreign) continue;
      if (articleWords.has(word)) {
        if (lastBlock && lastBlock.at === index - 1) {
          references.splice(references.indexOf(lastBlock.reference), 1);
          scope = { kind: 'own', number: lastBlock.reference.number };
        } else if (mode === 'document') {
          scope = { kind: 'main' };
        }
        lastBlock = null;
        mode = 'articles';
        continue;
      }
      if (annexWords.has(word)) {
        mode = 'annexes';
        lastBlock = null;
        continue;
      }
      if (chapterWords.has(word)) {
        mode = 'chapters';
        lastBlock = null;
        continue;
      }
      if (wholeWords.has(word) && mode === 'document') {
        references.push({ kind: 'document' });
        mode = 'none';
        continue;
      }
      if (skippedWords.has(word)) continue;
      if (mode !== 'chapters' || roman(word) === null) {
        mode = 'none';
        lastBlock = null;
        continue;
      }
    }
    if (token.kind === 'comma' || token.kind === 'dash' || foreign || mode === 'none') continue;
    const from = numberAt(index);
    if (from === null) continue;
    let to = from;
    if (tokens[index + 1]?.kind === 'dash' && numberAt(index + 2) !== null) {
      to = numberAt(index + 2)!;
      index += 2;
    }
    if (mode === 'articles') {
      references.push({ kind: 'articles', scope, from, to });
    } else if (mode === 'chapters') {
      references.push({ kind: 'chapters', from, to });
    } else if (mode === 'document' && to !== from) {
      references.push({ kind: 'articles', scope: { kind: 'main' }, from, to });
      mode = 'articles';
    } else {
      const label = mode === 'annexes' ? 'Anexa' : documentWords[domain].toUpperCase();
      for (let number = from; number <= Math.min(to, from + 50); number++) {
        const reference = { kind: 'block' as const, number, written: `${label} ${number}` };
        references.push(reference);
        lastBlock = { reference, at: index };
      }
      if (to !== from) lastBlock = null;
    }
  }
  return references;
}

const ownNumber = /^0*(\d{1,3})\.?$/u;
const ownHeading =
  /^\s*(?:anexa(?:\s+nr\.?)?|i[\W_]{0,3}p[\W_]{0,3}s[\W_]{0,3}(?:s[\W_]{0,3}m|u))[\s.]*0*(\d{1,3})\b/iu;

export function scopeOf(instruction: CutInstruction, file?: InstructionsFile): NumberingScope {
  const printed = ownNumber.exec(instruction.number.trim());
  if (printed) return { kind: 'own', number: Number(printed[1]) };
  if (instruction.number.trim() === '' && file) {
    const heading = ownHeading.exec(
      file.paragraphs[instruction.location.firstParagraph]?.text ?? ''
    );
    if (heading) return { kind: 'own', number: Number(heading[1]) };
  }
  return { kind: 'main' };
}

const chapterOf = (number: string) => roman(foldText(number).split(' ')[0] ?? '');

interface Numbered {
  region: string;
  number: number;
}

interface Scoped {
  instruction: CutInstruction;
  scope: NumberingScope;
  numbers: number[];
}

// The main sequence's numbers outside the instructions. A stretch that starts again at Art. 1
// after the main numbers began is another numbering, as an instruction the answer left out.
function commonNumbers(files: readonly InstructionsFile[], scoped: Scoped[]): Numbered[] {
  const numbered: Numbered[] = [];
  for (const file of files) {
    const cuts = scoped
      .filter(({ instruction }) => instruction.file === file.path)
      .sort(
        (a, b) => a.instruction.location.firstParagraph - b.instruction.location.firstParagraph
      );
    let started = false;
    let at = 0;
    const gap = (from: number, to: number) => {
      const numbers = file.paragraphs
        .slice(from, to)
        .map(printedArticle)
        .filter((number) => number !== null);
      if (numbers.length === 0) return;
      if (started && numbers[0] === 1) return;
      started = true;
      const region = `${file.path}#${from}`;
      for (const number of numbers) numbered.push({ region, number });
    };
    for (const cut of cuts) {
      gap(at, cut.instruction.location.firstParagraph);
      if (cut.scope.kind === 'main' && cut.numbers.length > 0) started = true;
      at = Math.max(at, cut.instruction.location.lastParagraph + 1);
    }
    gap(at, file.paragraphs.length);
  }
  return numbered;
}

function sameScope(a: NumberingScope, b: NumberingScope) {
  if (a.kind === 'own' && b.kind === 'own') return a.number === b.number;
  if (a.kind === 'apart' && b.kind === 'apart') return a.file === b.file;
  return a.kind === b.kind;
}

// The bound document whose numbers the bare "Art." of the themes cite: the file with the most
// articles outside the blocks numbered on their own.
function mainFile(files: readonly InstructionsFile[], scoped: Scoped[]) {
  let best: { path: string; count: number } | null = null;
  for (const file of files) {
    const own = scoped.filter(
      (item) => item.instruction.file === file.path && item.scope.kind === 'own'
    );
    const count = file.paragraphs.filter(
      (paragraph, index) =>
        printedArticle(paragraph) !== null &&
        !own.some(
          ({ instruction: { location } }) =>
            index >= location.firstParagraph && index <= location.lastParagraph
        )
    ).length;
    if (!best || count > best.count) best = { path: file.path, count };
  }
  return best?.path ?? null;
}

interface Group {
  post: string;
  variant: string;
  clientPost: string | null;
  citations: PostCitation[];
}

function groupPositions(positions: readonly InstructionsAnswer['positions'][number][]): Group[] {
  const groups: Group[] = [];
  for (const position of positions) {
    const clientPost = position.clientPost.trim() || null;
    const variant = foldText(position.variant);
    const group = groups.find(
      (known) =>
        foldText(known.variant) === variant &&
        (clientPost !== null && known.clientPost !== null
          ? foldText(known.clientPost) === foldText(clientPost)
          : sameName(known.post, position.post))
    );
    const citation: PostCitation = {
      section: position.section,
      citation: position.citation,
      file: position.file,
      quote: position.quote,
    };
    if (group) {
      group.citations.push(citation);
      group.clientPost ??= clientPost;
    } else {
      groups.push({
        post: position.post,
        variant: position.variant,
        clientPost,
        citations: [citation],
      });
    }
  }
  return groups;
}

export interface ResolveInput {
  domain: InstructionDomain;
  files: readonly InstructionsFile[];
  instructions: readonly CutInstruction[];
  positions: readonly InstructionsAnswer['positions'][number][];
}

// Code, never the model, says which instructions a post takes (ADR 034). Each post is read on
// the union of all its citations, since the periodic training splits one instruction over months.
export function resolvePositions(input: ResolveInput): ResolvedPosition[] {
  const filesByPath = new Map(input.files.map((file) => [file.path, file]));
  const scoped: Scoped[] = input.instructions.map((instruction) => ({
    instruction,
    scope: scopeOf(instruction, filesByPath.get(instruction.file)),
    numbers: [
      ...instruction.articles.map((article, index) => article.sourceNumber ?? index + 1),
      ...instruction.flags.flatMap((flag) => (flag.kind === 'empty_article' ? [flag.number] : [])),
    ],
  }));
  const main = mainFile(input.files, scoped);
  for (const item of scoped) {
    if (item.scope.kind === 'main' && item.instruction.file !== main) {
      item.scope = { kind: 'apart', file: item.instruction.file };
    }
  }
  const common = commonNumbers(
    input.files.filter((file) => file.path === main),
    scoped
  );

  const occurrences = (scope: NumberingScope, number: number) => {
    const regions = new Set(
      scoped
        .filter((item) => sameScope(item.scope, scope) && item.numbers.includes(number))
        .map((item) => item.instruction.key)
    );
    if (scope.kind === 'main') {
      for (const entry of common) if (entry.number === number) regions.add(entry.region);
    }
    return regions;
  };

  return groupPositions(input.positions).map((group, index) => {
    const references = group.citations.flatMap((citation) =>
      parseCitation(input.domain, citation.citation)
    );
    const named = new Set<string>();
    const reasons: UndecidedReason[] = [];
    const missing = new Set<string>();
    const reason = (next: UndecidedReason) => {
      if (!reasons.some((known) => JSON.stringify(known) === JSON.stringify(next))) {
        reasons.push(next);
      }
    };

    for (const reference of references) {
      if (reference.kind === 'document') {
        for (const item of scoped) named.add(item.instruction.key);
      } else if (reference.kind === 'block') {
        const matches = scoped.filter(
          (item) => item.scope.kind === 'own' && item.scope.number === reference.number
        );
        if (matches.length === 0) missing.add(reference.written);
        else if (matches.length > 1) reason({ kind: 'number_shared', number: reference.number });
        else named.add(matches[0]!.instruction.key);
      } else if (reference.kind === 'chapters') {
        for (const item of scoped) {
          const chapter = item.scope.kind === 'main' ? chapterOf(item.instruction.number) : null;
          if (chapter !== null && chapter >= reference.from && chapter <= reference.to) {
            named.add(item.instruction.key);
          }
        }
      }
    }

    const ranges = references.filter((reference) => reference.kind === 'articles');
    const scopes: NumberingScope[] = [];
    for (const range of ranges) {
      if (!scopes.some((known) => sameScope(known, range.scope))) scopes.push(range.scope);
    }
    for (const scope of scopes) {
      const inScope = ranges.filter((range) => sameScope(range.scope, scope));
      const members = scoped.filter((item) => sameScope(item.scope, scope));
      if (scope.kind === 'own' && members.length === 0) {
        missing.add(`${documentWords[input.domain].toUpperCase()} ${scope.number}`);
        continue;
      }
      if (scope.kind === 'own' && members.length > 1) {
        reason({ kind: 'number_shared', number: scope.number });
        continue;
      }
      for (const range of inScope) {
        for (const bound of new Set([range.from, range.to])) {
          if (occurrences(scope, bound).size > 1)
            reason({ kind: 'number_twice', scope, number: bound });
        }
      }
      const covered = (number: number) =>
        inScope.some((range) => number >= range.from && number <= range.to);
      for (const item of members) {
        const inside = item.numbers.filter(covered).length;
        if (inside === 0) continue;
        if (inside === item.numbers.length) named.add(item.instruction.key);
        else reason({ kind: 'cuts_instruction', instruction: item.instruction.key });
      }
    }

    if (reasons.length === 0 && named.size === 0 && missing.size > 0) {
      for (const reference of missing) reason({ kind: 'missing_reference', reference });
    }
    const order = new Map(scoped.map((item, position) => [item.instruction.key, position]));
    return {
      key: `${input.domain}-post-${index + 1}`,
      post: group.post,
      variant: group.variant,
      clientPost: group.clientPost,
      citations: group.citations,
      resolution:
        reasons.length > 0
          ? { kind: 'undecided', reasons }
          : {
              kind: 'resolved',
              instructions: [...named].sort((a, b) => order.get(a)! - order.get(b)!),
            },
      missing: [...missing],
    };
  });
}

export function undecidedMessage(
  reason: UndecidedReason,
  titleOf: (key: string) => string = (key) => key
) {
  switch (reason.kind) {
    case 'number_twice':
      return `Art. ${reason.number}${reason.scope.kind === 'own' ? ` din blocul ${reason.scope.number}` : ''} apare de două ori în document, în locuri diferite.`;
    case 'cuts_instruction':
      return `Citarea cuprinde doar o parte din „${titleOf(reason.instruction)}”.`;
    case 'number_shared':
      return `Mai multe instrucțiuni din pachet au numărul ${reason.number}.`;
    case 'missing_reference':
      return `${reason.reference} nu există în pachet.`;
  }
}
