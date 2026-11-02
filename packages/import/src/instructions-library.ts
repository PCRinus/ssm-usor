import {
  foldText,
  type InstructionBlock,
  type InstructionCategory,
  type InstructionDomain,
  textHash,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { CompletionRequest } from './gateway';
import { foldName } from './match';
import { similarityModel } from './models';
import { dataNotInstructions } from './prompts';
import { type AnswerFormat, answerFormat } from './wire';

type Body = { blocks: readonly InstructionBlock[] };

export interface LibraryModule {
  id: string;
  title: string;
  category: InstructionCategory;
  domain: InstructionDomain;
  body: Body;
  // The stored `text_hash`; computed from the body when left out.
  textHash?: string;
}

export interface PackInstruction {
  key: string;
  title: string;
  body: Body;
}

export type WordChange = { text: string; change: 'same' | 'added' | 'removed' };

// Articles are numbered from 1 in each body: `article` in the pack's, `libraryArticle` in the
// module's.
export type ArticleDifference =
  | { kind: 'added'; article: number }
  | { kind: 'removed'; libraryArticle: number }
  | { kind: 'changed'; article: number; libraryArticle: number; words: WordChange[] };

export interface LibraryMatch {
  moduleId: string;
  title: string;
  // Word-trigram Jaccard of the folded bodies; 1 for an identical one.
  similarity: number;
  decidedBy: 'hash' | 'overlap' | 'model';
  differences: ArticleDifference[];
}

export type LibraryStatus = 'identical' | 'similar' | 'new';
export type LibraryChoice = 'use_existing' | 'add_new';

export interface ComparedInstruction {
  key: string;
  status: LibraryStatus;
  match: LibraryMatch | null;
  // Null for an identical instruction, which is not a decision.
  choice: LibraryChoice | null;
  // The title a new module would take: the client's name follows one the library already has.
  title: string;
  // Instructions of the pack with the same text, folded into this one.
  sameAs: string[];
}

export const similarThreshold = 0.5;
export const judgedThreshold = 0.25;
export const judgedCharacters = 2_000;
export const similarityOutputTokens = 4_000;

const words = (text: string) => foldText(text).split(' ').filter(Boolean);

function bodyWords(body: Body) {
  return body.blocks.flatMap((block) =>
    block.kind === 'heading' ? words(block.text) : block.paragraphs.flatMap(words)
  );
}

function trigrams(body: Body) {
  const list = bodyWords(body);
  const set = new Set<string>();
  for (let index = 0; index + 2 < list.length; index++) {
    set.add(`${list[index]} ${list[index + 1]} ${list[index + 2]}`);
  }
  return set;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

export function bodyText(body: Body) {
  let article = 0;
  return body.blocks
    .map((block) =>
      block.kind === 'heading' ? block.text : `Art. ${++article}. ${block.paragraphs.join('\n')}`
    )
    .join('\n');
}

const articlesOf = (body: Body) =>
  body.blocks
    .filter((block) => block.kind === 'article')
    .map((block) => block.paragraphs.join(' '));

function wordChanges(pack: string, library: string): WordChange[] {
  const a = library.split(/\s+/u).filter(Boolean);
  const b = pack.split(/\s+/u).filter(Boolean);
  if (a.length * b.length > 4_000_000) {
    return [
      { text: a.join(' '), change: 'removed' },
      { text: b.join(' '), change: 'added' },
    ];
  }
  const fa = a.map(foldText);
  const fb = b.map(foldText);
  const columns = b.length + 1;
  const table = new Uint32Array((a.length + 1) * columns);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * columns + j] =
        fa[i] === fb[j]
          ? table[(i + 1) * columns + j + 1]! + 1
          : Math.max(table[(i + 1) * columns + j]!, table[i * columns + j + 1]!);
    }
  }
  const changes: WordChange[] = [];
  const push = (text: string, change: WordChange['change']) => {
    const last = changes.at(-1);
    if (last?.change === change) last.text = `${last.text} ${text}`;
    else changes.push({ text, change });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && fa[i] === fb[j]) {
      push(b[j]!, 'same');
      i++;
      j++;
    } else if (
      j < b.length &&
      (i === a.length || table[i * columns + j + 1]! >= table[(i + 1) * columns + j]!)
    ) {
      push(b[j]!, 'added');
      j++;
    } else {
      push(a[i]!, 'removed');
      i++;
    }
  }
  return changes;
}

const wordSet = (text: string) => new Set(words(text));

export function articleDifferences(pack: Body, library: Body): ArticleDifference[] {
  const a = articlesOf(pack);
  const b = articlesOf(library);
  const fa = a.map(foldText);
  const fb = b.map(foldText);
  const columns = b.length + 1;
  const table = new Uint32Array((a.length + 1) * columns);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * columns + j] =
        fa[i] === fb[j]
          ? table[(i + 1) * columns + j + 1]! + 1
          : Math.max(table[(i + 1) * columns + j]!, table[i * columns + j + 1]!);
    }
  }
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (fa[i] === fb[j]) anchors.push([i++, j++]);
    else if (table[(i + 1) * columns + j]! >= table[i * columns + j + 1]!) i++;
    else j++;
  }
  anchors.push([a.length, b.length]);

  const differences: ArticleDifference[] = [];
  let i = 0;
  let j = 0;
  for (const [nextI, nextJ] of anchors) {
    const free = Array.from({ length: nextJ - j }, (_, offset) => j + offset);
    let after = j;
    for (; i < nextI; i++) {
      const own = wordSet(a[i]!);
      const partner = free.find(
        (candidate) => candidate >= after && jaccard(own, wordSet(b[candidate]!)) >= 0.5
      );
      if (partner === undefined) {
        differences.push({ kind: 'added', article: i + 1 });
        continue;
      }
      for (const skipped of free.filter((candidate) => candidate >= after && candidate < partner)) {
        differences.push({ kind: 'removed', libraryArticle: skipped + 1 });
      }
      differences.push({
        kind: 'changed',
        article: i + 1,
        libraryArticle: partner + 1,
        words: wordChanges(a[i]!, b[partner]!),
      });
      after = partner + 1;
    }
    for (const skipped of free.filter((candidate) => candidate >= after)) {
      differences.push({ kind: 'removed', libraryArticle: skipped + 1 });
    }
    i = nextI + 1;
    j = nextJ + 1;
  }
  return differences;
}

export interface JudgePair {
  id: string;
  key: string;
  moduleId: string;
  similarity: number;
}

interface Prepared {
  instruction: PackInstruction;
  hash: string;
  trigrams: Set<string>;
  sameAs: string[];
}

interface Candidate {
  module: LibraryModule;
  similarity: number;
}

async function prepare(instructions: readonly PackInstruction[]) {
  const kept: Prepared[] = [];
  for (const instruction of instructions) {
    const hash = await textHash(instruction.body);
    const same = kept.find((known) => known.hash === hash);
    if (same) same.sameAs.push(instruction.key);
    else kept.push({ instruction, hash, trigrams: trigrams(instruction.body), sameAs: [] });
  }
  return kept;
}

function ranked(
  item: Prepared,
  library: readonly LibraryModule[],
  trigramsOf: Map<string, Set<string>>
) {
  return library
    .map((module) => ({ module, similarity: jaccard(item.trigrams, trigramsOf.get(module.id)!) }))
    .sort((a, b) => b.similarity - a.similarity);
}

function libraryTrigrams(library: readonly LibraryModule[]) {
  return new Map(library.map((module) => [module.id, trigrams(module.body)]));
}

export interface CompareInput {
  domain: InstructionDomain;
  instructions: readonly PackInstruction[];
  // The organization's active modules; those of the other domain are left out here.
  library: readonly LibraryModule[];
  clientName: string;
  // The model's yes or no for each pair `similarityPairs` gave, by the pair's id.
  judged?: ReadonlyMap<string, boolean>;
}

async function identicalOf(item: Prepared, library: readonly LibraryModule[]) {
  for (const module of library) {
    if ((module.textHash ?? (await textHash(module.body))) === item.hash) return module;
  }
  return null;
}

export async function similarityPairs(
  input: Omit<CompareInput, 'clientName' | 'judged'>
): Promise<JudgePair[]> {
  const library = input.library.filter((module) => module.domain === input.domain);
  const trigramsOf = libraryTrigrams(library);
  const pairs: JudgePair[] = [];
  for (const item of await prepare(input.instructions)) {
    if (await identicalOf(item, library)) continue;
    const best = ranked(item, library, trigramsOf)[0];
    if (best && best.similarity >= judgedThreshold && best.similarity < similarThreshold) {
      pairs.push({
        id: `${input.domain}:${item.instruction.key}:${best.module.id}`,
        key: item.instruction.key,
        moduleId: best.module.id,
        similarity: best.similarity,
      });
    }
  }
  return pairs;
}

const takenTitle = (title: string, library: readonly LibraryModule[]) =>
  library.some((module) => foldText(module.title) === foldText(title));

export async function compareWithLibrary(input: CompareInput): Promise<ComparedInstruction[]> {
  const library = input.library.filter((module) => module.domain === input.domain);
  const trigramsOf = libraryTrigrams(library);
  const compared: ComparedInstruction[] = [];
  for (const item of await prepare(input.instructions)) {
    const title = takenTitle(item.instruction.title, library)
      ? `${item.instruction.title} (${input.clientName})`
      : item.instruction.title;
    const base = { key: item.instruction.key, title, sameAs: item.sameAs };
    const identical = await identicalOf(item, library);
    if (identical) {
      compared.push({
        ...base,
        status: 'identical',
        choice: null,
        match: {
          moduleId: identical.id,
          title: identical.title,
          similarity: 1,
          decidedBy: 'hash',
          differences: [],
        },
      });
      continue;
    }
    const best: Candidate | undefined = ranked(item, library, trigramsOf)[0];
    const judgedSame =
      best !== undefined &&
      input.judged?.get(`${input.domain}:${item.instruction.key}:${best.module.id}`) === true;
    if (
      best &&
      (best.similarity >= similarThreshold || (best.similarity >= judgedThreshold && judgedSame))
    ) {
      const differences = articleDifferences(item.instruction.body, best.module.body);
      compared.push({
        ...base,
        status: 'similar',
        // The library's text would drop what the pack adds, as a post's own article before
        // a shared office text, so a pack with articles the module lacks is added as new.
        choice: differences.some((difference) => difference.kind === 'added')
          ? 'add_new'
          : 'use_existing',
        match: {
          moduleId: best.module.id,
          title: best.module.title,
          similarity: best.similarity,
          decidedBy: best.similarity >= similarThreshold ? 'overlap' : 'model',
          differences,
        },
      });
      continue;
    }
    compared.push({ ...base, status: 'new', choice: null, match: null });
  }
  return compared;
}

export function namesClient(body: Body, legalName: string) {
  const name = foldName(legalName);
  if (name.length < 3) return false;
  return ` ${bodyWords(body).join(' ')} `.includes(` ${name} `);
}

const similaritySchema = z.object({
  pairs: z.array(z.object({ id: z.string(), same: z.boolean() })),
});

export type SimilarityAnswer = z.infer<typeof similaritySchema>;

export const similarityAnswer: AnswerFormat<SimilarityAnswer> = answerFormat(
  'import_instruction_similarity',
  similaritySchema
);

export const similaritySystemPrompt = `You compare safety instructions that a Romanian safety service wrote. Each pair holds the beginning of an instruction read from a client's pack (A) and the beginning of one in the service's library (B). ${dataNotInstructions}

For each pair say whether they say the same thing: the same activity, equipment or kind of space, with mostly the same rules, so that the library's instruction could be used in place of the pack's. Different wording of the same rules is the same; the same kind of text about another activity, equipment or space is not. Give one entry per pair, with its id exactly as given.`;

export function similarityRequest(
  pairs: readonly JudgePair[],
  instructions: readonly PackInstruction[],
  library: readonly LibraryModule[]
): Omit<CompletionRequest<SimilarityAnswer>, 'metadata'> {
  const byKey = new Map(instructions.map((instruction) => [instruction.key, instruction]));
  const byId = new Map(library.map((module) => [module.id, module]));
  const content = pairs
    .map((pair) => {
      const pack = byKey.get(pair.key)!;
      const module = byId.get(pair.moduleId)!;
      return [
        `=== PAIR ${pair.id} ===`,
        `--- A: ${pack.title} ---`,
        bodyText(pack.body).slice(0, judgedCharacters),
        `--- B: ${module.title} ---`,
        bodyText(module.body).slice(0, judgedCharacters),
      ].join('\n');
    })
    .join('\n\n');
  return {
    model: similarityModel,
    messages: [
      { role: 'system', content: similaritySystemPrompt },
      { role: 'user', content },
    ],
    answer: similarityAnswer,
    reasoningEffort: 'low',
    maxCompletionTokens: similarityOutputTokens,
  };
}

export const judgements = (answer: SimilarityAnswer) =>
  new Map(answer.pairs.map((pair) => [pair.id, pair.same]));
