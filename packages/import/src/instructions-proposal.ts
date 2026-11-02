import {
  foldText,
  type InstructionBlock,
  type InstructionCategory,
  type InstructionDomain,
  type SplitFlag,
} from '@ssm-usor/contracts';

import { type ResolvedPosition, resolvePositions } from './instructions-citations';
import {
  type CutFlag,
  type CutInstruction,
  cutInstructions,
  type InstructionsFile,
  type SourceLocation,
  type UnreadInstruction,
} from './instructions-cut';
import {
  compareWithLibrary,
  type LibraryChoice,
  type LibraryMatch,
  type LibraryModule,
  type LibraryStatus,
  namesClient,
  type PackInstruction,
  similarityPairs,
} from './instructions-library';
import type { InstructionsAnswer } from './instructions-request';

export type InstructionFlag = SplitFlag | CutFlag | { kind: 'client_name'; name: string };

export interface ProposedInstruction {
  key: string;
  file: string;
  number: string;
  // As the pack's heading writes it.
  writtenTitle: string;
  // Proposed for the library, editable: the heading without its common lead, and the client's
  // name after one the library already has.
  title: string;
  category: InstructionCategory;
  body: { blocks: InstructionBlock[] };
  articleCount: number;
  // The pack's number of each article, which the themes cite; null where it printed none.
  sourceNumbers: (number | null)[];
  location: SourceLocation;
  status: LibraryStatus;
  match: LibraryMatch | null;
  choice: LibraryChoice | null;
  // Keys of the positions it applies to.
  posts: string[];
  flags: InstructionFlag[];
  sameAs: string[];
}

export interface InstructionsProposal {
  domain: InstructionDomain;
  instructions: ProposedInstruction[];
  unread: UnreadInstruction[];
  positions: ResolvedPosition[];
}

export interface ReadInstructions {
  domain: InstructionDomain;
  instructions: CutInstruction[];
  unread: UnreadInstruction[];
  positions: ResolvedPosition[];
}

export function readInstructionsAnswer(
  domain: InstructionDomain,
  files: readonly InstructionsFile[],
  answer: InstructionsAnswer
): ReadInstructions {
  const cuts = cutInstructions(domain, files, answer.instructions);
  const positions = resolvePositions({
    domain,
    files,
    instructions: cuts.instructions,
    positions: answer.positions,
  });
  return { domain, ...cuts, positions };
}

const acronym =
  /^(?:ssm|psi|isu|igsu|eip|iscir|itm|ipssm|ipsu|rsvti|sc|srl|pfa|hg|oug|ue|gpl|pram|pc|tva|anre|dsp|dsv|adr|cnp|ups)$/u;

const keptAsWritten = (word: string) =>
  acronym.test(word.toLowerCase().replace(/[^\p{L}]/gu, '')) ||
  /\d/u.test(word) ||
  /\p{L}\.\p{L}/u.test(word) ||
  (/\p{Ll}/u.test(word) && (word.match(/\p{Lu}/gu)?.length ?? 0) >= 2);

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function sentenceCase(text: string) {
  const words = text.split(/\s+/u).filter(Boolean);
  const plain = words.filter((word) => /\p{L}.*\p{L}/u.test(word) && !keptAsWritten(word));
  if (plain.length === 0 || plain.some((word) => word !== word.toUpperCase())) return text;
  return capitalized(
    words.map((word) => (keptAsWritten(word) ? word : word.toLowerCase())).join(' ')
  );
}

const leadEnds = new Set(['munca', 'muncii', 'incendiilor', 'urgenta']);
const connectors = new Set(['privind', 'pentru', 'la', 'specifice', 'specifica', 'din', 'cadrul']);
const genitiveLead = /^activitatilor desfasurate (?:in|la) /u;

// "Instrucțiuni proprii în domeniul securității și sănătății în muncă privind utilizarea
// autoturismelor" names the library's module "Utilizarea autoturismelor".
export function libraryTitle(written: string) {
  const words = written.trim().split(/\s+/u);
  const folded = words.map((word) => foldText(word));
  const subjectEnd = folded.slice(0, 14).findIndex((word) => leadEnds.has(word));
  const leadEnd = subjectEnd !== -1 ? subjectEnd : folded.slice(0, 5).indexOf('privind') - 1;
  if (!/^instruc/u.test(folded[0] ?? '') || leadEnd < 0) return sentenceCase(written.trim());
  let at = leadEnd + 1;
  while (at < words.length && connectors.has(foldText(words[at]!))) at++;
  if (genitiveLead.test(`${foldText(words.slice(at, at + 3).join(' '))} `)) at += 3;
  const rest = words.slice(at).join(' ');
  if (rest.length < 3) return sentenceCase(written.trim());
  return capitalized(sentenceCase(rest));
}

const packInstructions = (read: ReadInstructions): PackInstruction[] =>
  read.instructions.map((instruction) => ({
    key: instruction.key,
    title: libraryTitle(instruction.title),
    body: instruction.body,
  }));

export function pairsToJudge(read: ReadInstructions, library: readonly LibraryModule[]) {
  return similarityPairs({ domain: read.domain, instructions: packInstructions(read), library });
}

export interface ProposeInput {
  read: ReadInstructions;
  library: readonly LibraryModule[];
  client: { name: string; legalName: string };
  judged?: ReadonlyMap<string, boolean>;
}

export async function proposeInstructions(input: ProposeInput): Promise<InstructionsProposal> {
  const { read } = input;
  const compared = await compareWithLibrary({
    domain: read.domain,
    instructions: packInstructions(read),
    library: input.library,
    clientName: input.client.name,
    judged: input.judged,
  });
  const keptOf = new Map<string, string>();
  for (const item of compared) {
    keptOf.set(item.key, item.key);
    for (const same of item.sameAs) keptOf.set(same, item.key);
  }
  const positions = read.positions.map((position) =>
    position.resolution.kind === 'resolved'
      ? {
          ...position,
          resolution: {
            kind: 'resolved' as const,
            instructions: [
              ...new Set(position.resolution.instructions.map((key) => keptOf.get(key) ?? key)),
            ],
          },
        }
      : position
  );
  const byKey = new Map(read.instructions.map((instruction) => [instruction.key, instruction]));
  const instructions = compared.map((item): ProposedInstruction => {
    const cut = byKey.get(item.key)!;
    const flags: InstructionFlag[] = [...cut.flags];
    if (namesClient(cut.body, input.client.legalName)) {
      flags.push({ kind: 'client_name', name: input.client.legalName });
    }
    return {
      key: item.key,
      file: cut.file,
      number: cut.number,
      writtenTitle: cut.title,
      title: item.title,
      category: cut.category,
      body: cut.body,
      articleCount: cut.articles.length,
      sourceNumbers: cut.articles.map((article) => article.sourceNumber),
      location: cut.location,
      status: item.status,
      match: item.match,
      choice: item.choice,
      posts: positions
        .filter(
          (position) =>
            position.resolution.kind === 'resolved' &&
            position.resolution.instructions.includes(item.key)
        )
        .map((position) => position.key),
      flags,
      sameAs: item.sameAs,
    };
  });
  return { domain: read.domain, instructions, unread: read.unread, positions };
}
