import {
  instructionCategoriesByDomain,
  type InstructionCategory,
  type InstructionDomain,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { CompletionRequest } from './gateway';
import { instructionsModel } from './models';
import { type ChatMessage, dataNotInstructions, fileHeader } from './prompts';
import { type AnswerFormat, answerFormat } from './wire';

export interface InstructionsTextFile {
  path: string;
  // For an own-instructions file, `readInstructionsDocx(...).text`: one line per paragraph, its
  // printed number first, the notes after the body.
  text: string;
}

export interface InstructionsRequestInput {
  domain: InstructionDomain;
  instructions: InstructionsTextFile[];
  themes: InstructionsTextFile[];
  posts: string[];
}

// Below the 272,000 prompt tokens past which the model prices the whole request higher (ADR 034).
export const instructionsCharacters = 800_000;
export const instructionsOutputTokens = 16_000;

export class InstructionsTooLargeError extends Error {
  constructor(readonly characters: number) {
    super(
      `The own instructions and themes hold ${characters} characters, more than ${instructionsCharacters}.`
    );
    this.name = 'InstructionsTooLargeError';
  }
}

export const citationSections = ['workplace', 'periodic', 'other'] as const;

export type CitationSection = (typeof citationSections)[number];

const answerSchema = (domain: InstructionDomain) =>
  z.object({
    instructions: z.array(
      z.object({
        file: z.string(),
        number: z.string(),
        title: z.string(),
        category: z.enum(instructionCategoriesByDomain[domain]),
        startWords: z.string(),
        endWords: z.string(),
      })
    ),
    positions: z.array(
      z.object({
        post: z.string(),
        variant: z.string(),
        clientPost: z.string(),
        section: z.enum(citationSections),
        citation: z.string(),
        file: z.string(),
        quote: z.string(),
      })
    ),
  });

export interface InstructionsAnswer {
  instructions: {
    file: string;
    number: string;
    title: string;
    category: InstructionCategory;
    startWords: string;
    endWords: string;
  }[];
  positions: {
    post: string;
    // The words the themes add to tell two entries of one post apart ("FARA CONDUCERE AUTO").
    variant: string;
    // As the client proposal names it; "" when the post is none of the proposal's.
    clientPost: string;
    section: CitationSection;
    citation: string;
    file: string;
    quote: string;
  }[];
}

const answers = {
  ssm: answerFormat('import_instructions_ssm', answerSchema('ssm')),
  psi: answerFormat('import_instructions_psi', answerSchema('psi')),
};

export const instructionsAnswer = (domain: InstructionDomain): AnswerFormat<InstructionsAnswer> =>
  answers[domain];

export const instructionsSystemPrompt = `You read the own instructions (instrucțiuni proprii) and the training themes (tematica de instruire) that a Romanian external safety service wrote for one client company. Your answer tells code where each client-specific instruction starts and ends, so that code can cut its text out of the file, and which instructions each post is trained on. ${dataNotInstructions} The task follows the files.`;

const instructionsRules: Record<InstructionDomain, string> = {
  ssm: `The files are the client's own instructions for occupational safety and health (IPSSM, "Instrucțiuni proprii de securitate și sănătate în muncă") and its SSM training themes.

instructions: every client-specific instruction, in the order it stands in each file.
- An IPSSM is one bound document. Its chapters I to XII (general information, training, conduct, traffic, electrical equipment, first aid, fire, hygiene, vulnerable groups, manual handling, protective equipment) and all their subchapters are the same in every pack, even where they name the client, and are never listed. The client-specific instructions follow them: each subchapter of chapter XIII and of any later chapter ("Subcapitolul XIII.I. Instrucțiuni proprii … privind utilizarea autoturismelor …"), each block numbered on its own ("I.P.S.S.M. 2. Instrucțiuni proprii … privind activitățile desfășurate de recepționeri de hotel"), and a file that holds a single instruction.
- number: as its heading prints it, without the label: "XIII.VIII" for "Subcapitolul XIII.VIII.", "2" for "I.P.S.S.M. 2.", "" when it has none.
- category: work_equipment for the use of a machine, tool, appliance, vehicle, lift or other piece of work equipment; protective_equipment for wearing protective equipment; work_activity for an activity, a trade or the work of a post, even when it has sections on the equipment the post uses.`,
  psi: `The files are the client's own instructions for emergencies and fire safety (IPSU, "Instrucțiuni proprii … în domeniul situațiilor de urgență") and its training themes for emergencies (SU, PSI).

instructions: every client-specific instruction, in the order it stands in each file.
- An IPSU's body, its articles from 1 to about 190 under chapters I to XXXII, is the same in every pack and is never listed. The client-specific instructions are its annexes ("Anexa nr. 1 INSTRUCȚIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR SPECIFICE ACTIVITĂȚILOR DESFĂȘURATE ÎN …"), which usually stand in the file's notes, after its body, each numbered from Art. 1 again; and a file that holds a single instruction.
- number: as its heading prints it, without the label: "1" for "Anexa nr. 1", "" when it has none.
- category: premises_activity for the rules of a kind of space or activity (offices, shops, workshops, accommodation and catering, health units); installation_equipment for an installation or a piece of equipment (heating, gas, electrical, ventilation); hazardous_work for dangerous work, such as work with an open flame.`,
};

const citationExamples: Record<InstructionDomain, string> = {
  ssm: '"IPSSM Art. 1 – 296 ; 331 – 353 ; IPSSM 2. Art.1 – 16", "I.P.S.S.M. Art. 96 – 166 ; I.P.S.S.M. 1 Art. 1 - 22 ;"',
  psi: '"IPSU Art. 84 – 104, 114 – 129 ; IPSU Cap. XXV – XXXII ; IPSU Anexa 1"',
};

const documentName: Record<InstructionDomain, string> = { ssm: 'IPSSM', psi: 'IPSU' };

function rulesPrompt(domain: InstructionDomain, posts: string[]) {
  const name = documentName[domain];
  const postList =
    posts.length > 0 ? posts.map((post) => `- ${post}`).join('\n') : '(the proposal has no posts)';
  return `${instructionsRules[domain]}
- One instruction is one entry. Its sections, such as one on a piece of equipment the post uses ("Instrucțiuni … la utilizarea feliatorului") or its own "CAPITOLUL I" headings, belong to it and are never entries of their own.
- file: the path exactly as given. title: as its heading writes it, without the label and the number.
- startWords: the instruction's first 15 to 25 words, starting with the label of its heading ("Subcapitolul", "I.P.S.S.M.", "Anexa nr.").
- endWords: its last 15 to 25 words, ending with the last word of its last paragraph, the line before the next instruction's heading or the end of the file.
- Each line of an own-instructions file is one paragraph, with the number Word prints before it ("Art. 288.", "a)", "–"). Copy startWords and endWords character for character from the file, with numbers, punctuation and missing diacritics as they stand: code searches the file for them. Never shorten, correct, reorder or join words from different places.

positions: the posts the training themes name, with the citations of the ${name} that say what each post is trained on.
- The workplace training (chapter II, "INSTRUIREA LA LOCUL DE MUNCĂ") gives each post ("FUNCȚIA : …") one citation, under "CONȚINUTUL MATERIALULUI DE INSTRUIRE": section "workplace". The periodic training (chapter III) gives it a citation for each month or period: section "periodic", one entry for each. Any other citation of a post: section "other".
- citation: verbatim, from the first reference to the ${name} to the last, with the article ranges, block numbers, chapters and annexes between them (${citationExamples[domain]}). Leave out the laws (HG …), the practical demonstrations and the tests.
- The introductory-general training of the whole staff ("Întreg personalul", "Conform MISSMIG Art. 1 – 327") cites the general training material: it is never a post. The plan tables of a training ("Nr. crt. | Conținutul materialului de instruire | Planul de desfășurare") are not per post: skip them.
- post: as written. A heading that names several posts ("Personal de execuție ( Mecanic utilaj , Operator mecanic )") gives one entry for each post it names, each with the whole citation; a category heading that names no post is the post as written.
- variant: the words the themes add to a post to tell two of its entries apart ("FARA CONDUCERE AUTO"), "" otherwise.
- clientPost: the client's post from the list below that the post is, written as the list writes it; "" when none is.
- file: the themes' path; quote: a verbatim passage of it, at most 200 characters: the post's name, "…", then the citation.

The client's posts:
${postList}`;
}

export function instructionsInputCharacters(input: InstructionsRequestInput) {
  return [...input.instructions, ...input.themes].reduce((sum, file) => sum + file.text.length, 0);
}

// The files come before the task so that a repeated request ("Citește din nou") reads them from
// the provider's cache; only the task, with the posts, changes between imports.
export function instructionsMessages(input: InstructionsRequestInput): ChatMessage[] {
  const files = [...input.instructions, ...input.themes]
    .map((file) => `${fileHeader(file.path)}\n${file.text}`)
    .join('\n\n');
  return [
    { role: 'system', content: instructionsSystemPrompt },
    { role: 'user', content: files },
    { role: 'system', content: rulesPrompt(input.domain, input.posts) },
  ];
}

export function instructionsRequest(
  input: InstructionsRequestInput
): Omit<CompletionRequest<InstructionsAnswer>, 'metadata'> {
  const characters = instructionsInputCharacters(input);
  if (characters > instructionsCharacters) throw new InstructionsTooLargeError(characters);
  return {
    model: instructionsModel,
    messages: instructionsMessages(input),
    answer: instructionsAnswer(input.domain),
    reasoningEffort: 'medium',
    maxCompletionTokens: instructionsOutputTokens,
  };
}
