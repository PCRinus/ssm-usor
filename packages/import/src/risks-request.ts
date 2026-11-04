import {
  foldText,
  type PreventionMeasureKind,
  preventionMeasureKinds,
  type RiskEvaluationKind,
  riskEvaluationKinds,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import { type CompletionRequest, ModelAnswerError } from './gateway';
import { risksModel } from './models';
import { type ChatMessage, type ContentPart, dataNotInstructions, fileHeader } from './prompts';
import { classOf } from './risks-read';
import { hasRows, type NumberedRows, numberRows, type RisksTextFile } from './risks-rows';
import { type AnswerFormat, answerFormat } from './wire';

export interface RisksRequestInput {
  files: RisksTextFile[];
  // The client proposal's posts, as it names them.
  posts: string[];
}

// Below the 272,000 prompt tokens past which the model prices the whole request higher, as for
// the own instructions (ADR 034).
export const risksCharacters = 800_000;
export const risksOutputTokens = 32_000;
// Measured on 2026-11-04 on two archives printed to PDF (ADR 036): a factor written out with its
// measures and plan fields took up to 300 output tokens a request, reasoning included.
export const retypedFactorTokens = 300;
// A third of the output limit: one answer cut at the limit costs the whole limit, and a model
// asked for a long list has also been seen to stop after the first sheets and say nothing of it.
export const retypedFactorsPerRequest = Math.floor(risksOutputTokens / 3 / retypedFactorTokens);
// For a sheet the first answer gave no count for: more than any of the five archives' sheets.
export const assumedFactorCount = 50;
const retypeConcurrency = 4;

export class RisksTooLargeError extends Error {
  constructor(readonly characters: number) {
    super(`The risk assessment holds ${characters} characters, more than ${risksCharacters}.`);
    this.name = 'RisksTooLargeError';
  }
}

const cell = z.int().min(1).max(30).nullable();
const span = z.object({ startWords: z.string(), endWords: z.string() });

const retypedFactor = z.object({
  component: z.string(),
  group: z.string(),
  description: z.string(),
  consequence: z.string(),
  gravity: z.string(),
  probability: z.string(),
  level: z.string(),
  quote: z.string(),
  measuresFrom: z.enum(['plan', 'sheet']).nullable(),
  measures: z.array(z.object({ kind: z.enum(preventionMeasureKinds), description: z.string() })),
  actions: z.string().nullable(),
  deadline: z.string().nullable(),
  responsiblePerson: z.string().nullable(),
  observations: z.string().nullable(),
});

const sheetSchema = z.object({
  file: z.string(),
  heading: z.string(),
  kind: z.enum(riskEvaluationKinds),
  name: z.string(),
  posts: z.array(z.string()),
  firstRow: z.string(),
  lastRow: z.string(),
  columns: z.object({
    component: cell,
    group: cell,
    description: cell,
    consequence: cell,
    gravity: cell,
    probability: cell,
    level: cell,
  }),
  meansOfProduction: span,
  workEnvironment: span,
  exposure: span,
  factorCount: z.int().nullable(),
});

const answerSchema = z.object({
  sheets: z.array(sheetSchema),
  measures: z.array(
    z.object({
      row: z.string(),
      factorRow: z.string(),
      column: cell,
      parts: z.array(z.object({ kind: z.enum(preventionMeasureKinds), startWords: z.string() })),
    })
  ),
  planTables: z.array(
    z.object({
      file: z.string(),
      firstRow: z.string(),
      lastRow: z.string(),
      columns: z.object({
        post: cell,
        risk: cell,
        technical: cell,
        organizational: cell,
        hygienicSanitary: cell,
        other: cell,
        actions: cell,
        deadline: cell,
        responsible: cell,
        observations: cell,
      }),
    })
  ),
  plan: z.array(z.object({ row: z.string(), factorRows: z.array(z.string()) })),
});

export type RetypedFactor = z.infer<typeof retypedFactor>;

export interface RisksAnswer {
  sheets: {
    file: string;
    // As the pack writes it.
    heading: string;
    kind: RiskEvaluationKind;
    // The post, group or other name as the heading writes it.
    name: string;
    // The proposal's posts the sheet evaluates, as the list writes them.
    posts: string[];
    // Row ids, "R212"; "" for a sheet whose factors have no rows.
    firstRow: string;
    lastRow: string;
    // The 1-based cell of each role in a factor row; null where the table has none.
    columns: Record<
      'component' | 'group' | 'description' | 'consequence' | 'gravity' | 'probability' | 'level',
      number | null
    >;
    meansOfProduction: { startWords: string; endWords: string };
    workEnvironment: { startWords: string; endWords: string };
    exposure: { startWords: string; endWords: string };
    // The factor rows of its table, as the model counted them; null when it gave none.
    factorCount: number | null;
    // Empty in the first answer: a sheet with no rows is written out by the later requests.
    factors: RetypedFactor[];
  }[];
  measures: {
    row: string;
    factorRow: string;
    column: number | null;
    // Where each kind starts in a text that mixes kinds without labels.
    parts: { kind: PreventionMeasureKind; startWords: string }[];
  }[];
  planTables: {
    file: string;
    firstRow: string;
    lastRow: string;
    columns: Record<
      | 'post'
      | 'risk'
      | 'technical'
      | 'organizational'
      | 'hygienicSanitary'
      | 'other'
      | 'actions'
      | 'deadline'
      | 'responsible'
      | 'observations',
      number | null
    >;
  }[];
  plan: { row: string; factorRows: string[] }[];
}

export const risksAnswer: AnswerFormat<RisksAnswer> = answerFormat(
  'import_risks',
  answerSchema,
  (value) => ({ ...value, sheets: value.sheets.map((sheet) => ({ ...sheet, factors: [] })) })
);

const retypedAnswerSchema = z.object({
  sheets: z.array(
    z.object({ file: z.string(), heading: z.string(), factors: z.array(retypedFactor) })
  ),
});

export type RetypedAnswer = z.infer<typeof retypedAnswerSchema>;

export const retypedAnswer: AnswerFormat<RetypedAnswer> = answerFormat(
  'import_risks_retyped',
  retypedAnswerSchema
);

export const risksSystemPrompt = `You read the risk assessment (evaluarea riscurilor de accidentare și îmbolnăvire profesională, by the I.N.C.D.P.M. method) and the prevention and protection plan (planul de prevenire și protecție) that a Romanian external safety service wrote for one client company. Your answer tells code where each evaluation sheet's factors, measures and texts are, so that code copies them out of the files; you never copy the factors yourself, except those of the sheets with no numbered rows, with their measures, when a request asks you to write them out. ${dataNotInstructions} The task follows the files.`;

const rowsParagraph = `Each table row of a Word file stands on one line, its id first and its cells between bars: "R212 | MIJLOACE DE PRODUCȚIE | Factori de risc mecanic | F3. Cădere … | ITM 3-45 zile | 2 | 3 | 2 |". A cell's paragraphs are joined by " / ". A merged cell is written in its first row and left empty in the rows below. Cells are counted from 1 after the id. A PDF's text and a scanned page have no numbered rows.`;

const quoteParagraph = `startWords and endWords are 4 to 12 words copied character for character from the file, with numbers, punctuation and missing diacritics as they stand: code searches the file for them. Never shorten, correct or join words from different places. "" when the text is not in the file.`;

function postList(posts: readonly string[]) {
  return posts.length > 0
    ? posts.map((post) => `- ${post}`).join('\n')
    : '(the proposal has no posts)';
}

function rulesPrompt(posts: readonly string[]) {
  return `${rowsParagraph}

sheets: one per evaluation sheet ("Fișa de evaluare a locului de muncă"), in the order of the files. The method's chapters, the annexes, the ranking tables ("Ierarhizarea riscurilor"), the global levels and the conclusions are never sheets. A subchapter whose evaluation has no factor table is not a sheet.
- file: the path exactly as given. heading: the sheet's subchapter heading as written, with the workplace and the post ("SUBCAPITOLUL V.II. … PENTRU LOCUL DE MUNCĂ : RESTAURANT, POSTUL DE LUCRU : BUCATAR").
- kind: sensitive_groups for the sensitive groups (grupuri sensibile: pregnant women, young people, people with disabilities); other for a sheet that evaluates no post of the client but people or an activity, such as visitors (vizitator); job_position otherwise. name: the post, the groups or the other name as the heading writes it ("BUCATAR", "GRUPURI SENSIBILE", "VIZITATOR").
- posts: for job_position, every post of the list below that the sheet evaluates, written as the list writes it. A heading that names several posts ("DIRECTOR GENERAL, DIRECTOR COMERCIAL, CONTABIL") gives each of them that the list has. [] when the list has none of them, and for the other kinds.
- firstRow, lastRow: the ids of the sheet's first and last factor rows, the rows with a description and classes; never the table's title rows, its header or its row of column numbers ("| 0 | 1 | 2 | …"). "" for a sheet with no numbered rows.
- columns: which cell of a factor row holds the component (Mijloace de producție, Mediul de muncă, Sarcina de muncă, Executant), the group of factors ("Factori de risc mecanic"), the factor's description, the maximum foreseeable consequence, the gravity class, the probability class and the printed risk level; "" when the table has no such column, and for a sheet with no numbered rows.
- meansOfProduction, workEnvironment: the sheet's own text that describes them, in the part that defines the work system before the factor table ("2. Mijloace de producție : …", "4. Mediul de muncă : …"): startWords from its first word after the label, endWords to its last word before the next point.
- exposure: the duration of exposure the sheet's header gives ("DURATA EXPUNERII : 8h / schimb"), the value only, its words both as startWords and as endWords when short.
${quoteParagraph}
- factorCount: for every sheet, with numbered rows or without, how many factor rows its table has (its last "F12." code, as a rule). This answer never writes the factors out; a later request writes out those of the sheets with no numbered rows, which are listed here like the others.

measures: one entry per row of each sheet's measures table ("Fișa de măsuri propuse": Nr. | factor | nivel de risc | măsuri propuse).
- row: the row's id. factorRow: the id of the factor row of the same sheet that the row's factor is (the same "F12." code and description). "" when it is none.
- column: the cell that holds the measures.
- parts: where the measures text changes kind, when it does so without its own labels ("Măsuri tehnice:", "Măsuri organizatorice:"): for each kind in turn, its kind and the first 4 to 8 words of its first measure, copied as they stand. technical for equipment, installations, protections and checks of them; organizational for training, instructions, rules, supervision and work organization; hygienic_sanitary for medical checks, first aid, hygiene and drinking water; other for protective equipment and anything else. [] when the text has its own labels; one part when the whole text is of one kind.

planTables: each table of the prevention and protection plan: its file, the ids of its first and last rows below the header, and which cell holds the post (loc de muncă / post de lucru), the evaluated risk, the technical, organizational, hygienic-sanitary and other measures, the actions to carry them out, the deadline, the person responsible and the observations; "" for a column the table lacks.

plan: one entry per plan row below the header.
- row: its id. factorRows: the ids of the factor rows of the sheets that the row's risk is, on the sheet of the row's post: the post is written on the first row of each post's block and left empty below it. The plan retypes the risk without its code and often in other words; a row that names two risks ("… / …") gives both. [] when the risk is none of the sheet's factors.

The client's posts:
${postList(posts)}`;
}

function retypeRulesPrompt(headings: readonly string[]) {
  return `${rowsParagraph}

sheets: the evaluation sheets below, which have no numbered rows, in this order, each with its file as given and its heading as below.
- factors: each factor row of its table written out: component and group as the row or the rows above it give them, description without its "F12." code, consequence, gravity, probability and level as printed (digits), and quote: the row's text as it stands in the file, at most 200 characters. One entry per row, with the row's own words and digits: never a summary of the table, a range of rows or a description of its columns.
- measures: the factor's prevention measures, each its own entry, in the document's words as they stand, never shortened, joined or reworded, with its kind. Take them from the prevention and protection plan's row for the factor, in the block of the sheet's post (the plan writes the risk without its code and often in other words; a row that names two risks belongs to both, and a factor with two rows takes both), each with its column's kind: technical, organizational, hygienic_sanitary, other. For a factor the plan has no row for, or when the files hold no plan, take them from the factor's row of the sheet's measures table ("Fișa de măsuri propuse", by its "F12." code), each with the kind its label gives ("Măsuri tehnice:", "Măsuri organizatorice:"), or where the text has no labels: technical for equipment, installations, protections and checks of them; organizational for training, instructions, rules, supervision and work organization; hygienic_sanitary for medical checks, first aid, hygiene and drinking water; other for protective equipment and anything else. [] when neither gives the factor any: never a measure of another factor, a general measure of the workplace or one of your own, and never a placeholder ("--").
- measuresFrom: plan or sheet, where the factor's measures come from; "" when it has none.
- actions, deadline, responsiblePerson, observations: the plan row's actions to carry out the measures, its deadline, the person who answers for them and its observations, as written; "" when the factor has no plan row or the row leaves the cell empty or "--".

The sheets:
${headings.map((heading) => `- ${heading}`).join('\n')}`;
}

export function risksInputCharacters(files: readonly RisksTextFile[]) {
  return files.reduce((sum, file) => sum + file.text.length, 0);
}

function filesMessage(files: readonly RisksTextFile[], numbered: NumberedRows): ChatMessage {
  const parts: ContentPart[] = files.flatMap((file): ContentPart[] => [
    { type: 'text', text: `${fileHeader(file.path)}\n${numbered.texts.get(file.path) ?? ''}` },
    ...(file.scans ?? []).flatMap((scan): ContentPart[] => [
      { type: 'text', text: fileHeader(scan.label) },
      { type: 'image_url', image_url: { url: scan.imageUrl } },
    ]),
  ]);
  if (parts.every((part) => part.type === 'text')) {
    return {
      role: 'user',
      content: parts.map((part) => (part as { text: string }).text).join('\n\n'),
    };
  }
  return { role: 'user', content: parts };
}

// The files come first, numbered the same way every time, so that a repeated request and the
// requests that write out the later sheets read them from the provider's cache.
export function risksMessages(input: RisksRequestInput, numbered = numberRows(input.files)) {
  return [
    { role: 'system', content: risksSystemPrompt },
    filesMessage(input.files, numbered),
    { role: 'system', content: rulesPrompt(input.posts) },
  ] satisfies ChatMessage[];
}

function checkSize(files: readonly RisksTextFile[]) {
  const characters = risksInputCharacters(files);
  if (characters > risksCharacters) throw new RisksTooLargeError(characters);
}

export function risksRequest(
  input: RisksRequestInput
): Omit<CompletionRequest<RisksAnswer>, 'metadata'> {
  checkSize(input.files);
  return {
    model: risksModel,
    messages: risksMessages(input),
    answer: risksAnswer,
    reasoningEffort: 'medium',
    maxCompletionTokens: risksOutputTokens,
  };
}

export interface RetypeSheet {
  // 1-based, in the first answer's sheets.
  index: number;
  file: string;
  heading: string;
  // As the first answer counted them; null when it gave no count.
  factorCount: number | null;
}

const expectedFactors = (sheet: RetypeSheet) => sheet.factorCount ?? assumedFactorCount;

// The model has been seen to answer a long sheet with one entry that describes its columns, and
// with an entry per row that says where the row is ("p. 29, rând F1, coloana 4") rather than what
// it holds: only a factor with its classes as digits counts as written out.
const usable = (factors: readonly RetypedFactor[]) =>
  factors.filter(
    (factor) => classOf(factor.gravity, 7) !== null && classOf(factor.probability, 6) !== null
  ).length;

const writtenShort = (sheet: RetypeSheet, written: number) =>
  written === 0 || (sheet.factorCount !== null && written * 2 < sheet.factorCount);

export function retypeBatches(input: RisksRequestInput, answer: RisksAnswer): RetypeSheet[][] {
  const numbered = numberRows(input.files);
  const batches: RetypeSheet[][] = [];
  let batch: RetypeSheet[] = [];
  let size = 0;
  answer.sheets.forEach((sheet, at) => {
    if (sheet.firstRow !== '' || sheet.factors.length > 0 || hasRows(numbered, sheet.file)) return;
    const retype: RetypeSheet = {
      index: at + 1,
      file: sheet.file,
      heading: sheet.heading,
      factorCount: sheet.factorCount !== null && sheet.factorCount > 0 ? sheet.factorCount : null,
    };
    if (batch.length > 0 && size + expectedFactors(retype) > retypedFactorsPerRequest) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(retype);
    size += expectedFactors(retype);
  });
  if (batch.length > 0) batches.push(batch);
  return batches;
}

export function retypeRequest(
  input: RisksRequestInput,
  sheets: readonly Pick<RetypeSheet, 'heading'>[]
): Omit<CompletionRequest<RetypedAnswer>, 'metadata'> {
  checkSize(input.files);
  const numbered = numberRows(input.files);
  return {
    model: risksModel,
    messages: [
      { role: 'system', content: risksSystemPrompt },
      filesMessage(input.files, numbered),
      { role: 'system', content: retypeRulesPrompt(sheets.map((sheet) => sheet.heading)) },
    ],
    answer: retypedAnswer,
    reasoningEffort: 'medium',
    maxCompletionTokens: risksOutputTokens,
  };
}

// The answer's sheets on the sheets asked for, so that a heading the model wrote a little
// differently, or a path it shortened, does not lose them.
export function placeRetyped(asked: readonly RetypeSheet[], answer: RetypedAnswer): RetypedAnswer {
  const left = [...asked];
  const sheets: RetypedAnswer['sheets'] = [];
  for (const written of answer.sheets) {
    let at = left.findIndex((sheet) => sheet.heading === written.heading);
    if (at === -1) {
      at = left.findIndex((sheet) => foldText(sheet.heading) === foldText(written.heading));
    }
    if (at === -1 && asked.length === 1 && answer.sheets.length === 1) at = 0;
    if (at === -1 || at >= left.length) continue;
    const [sheet] = left.splice(at, 1);
    sheets.push({ file: sheet!.file, heading: sheet!.heading, factors: written.factors });
  }
  return { sheets };
}

// Each request is named by the sheets it asks for, so that a kept answer is only ever reused for
// the same request.
export type RetypeAsk = (
  key: string,
  request: Omit<CompletionRequest<RetypedAnswer>, 'metadata'>
) => Promise<RetypedAnswer>;

const askAgain = (error: unknown) =>
  error instanceof ModelAnswerError && error.reason !== 'refused';

const writtenFor = (answer: RetypedAnswer, sheet: RetypeSheet) =>
  usable(answer.sheets.find((each) => each.heading === sheet.heading)?.factors ?? []);

// The reading is paid for and a sheet left without its factors is lost without a word: a cut or
// broken answer is asked again in halves, a sheet an answer for several left short is asked again
// alone, and one asked alone is asked once more.
async function retypeBatch(
  input: RisksRequestInput,
  sheets: readonly RetypeSheet[],
  ask: RetypeAsk
): Promise<RetypedAnswer[]> {
  const key = sheets.map((sheet) => sheet.index).join('-');
  let answer: RetypedAnswer;
  try {
    answer = placeRetyped(sheets, await ask(key, retypeRequest(input, sheets)));
  } catch (error) {
    if (sheets.length < 2 || !askAgain(error)) throw error;
    const half = Math.ceil(sheets.length / 2);
    return [
      ...(await retypeBatch(input, sheets.slice(0, half), ask)),
      ...(await retypeBatch(input, sheets.slice(half), ask)),
    ];
  }
  if (sheets.length === 1) {
    const [sheet] = sheets;
    if (!writtenShort(sheet!, writtenFor(answer, sheet!))) return [answer];
    let again: RetypedAnswer;
    try {
      again = placeRetyped(sheets, await ask(`${key}.again`, retypeRequest(input, sheets)));
    } catch (error) {
      if (!askAgain(error)) throw error;
      return [answer];
    }
    return [writtenFor(again, sheet!) > writtenFor(answer, sheet!) ? again : answer];
  }
  const answers = [answer];
  for (const sheet of sheets.filter((each) => writtenShort(each, writtenFor(answer, each)))) {
    answers.push(...(await retypeBatch(input, [sheet], ask)));
  }
  return answers;
}

// The first answer's files do not serve these requests from the provider's cache, as their answer
// format differs, and requests sent at the same moment each miss it, paying the whole prompt again
// ($0.26 on an eleven-sheet pack, ADR 036): the first batch goes alone, and the others a few at
// once after it. Every batch runs to its end before a failure is thrown, so that the answers kept
// are not paid twice.
export async function retypeSheets(
  input: RisksRequestInput,
  answer: RisksAnswer,
  ask: RetypeAsk
): Promise<RetypedAnswer[]> {
  const [first, ...rest] = retypeBatches(input, answer);
  if (!first) return [];
  const results = await Promise.allSettled([retypeBatch(input, first, ask)]);
  for (let at = 0; at < rest.length; at += retypeConcurrency) {
    results.push(
      ...(await Promise.allSettled(
        rest.slice(at, at + retypeConcurrency).map((batch) => retypeBatch(input, batch, ask))
      ))
    );
  }
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

// A sheet asked for again takes the answer that wrote out the most of its factors.
const better = (written: readonly RetypedFactor[], kept: readonly RetypedFactor[]) =>
  usable(written) > usable(kept) ||
  (usable(written) === usable(kept) && written.length > kept.length);

export function withRetyped(answer: RisksAnswer, later: readonly RetypedAnswer[]): RisksAnswer {
  const sheets = answer.sheets.map((sheet) => ({ ...sheet }));
  const retyped = new Set(sheets.filter((sheet) => sheet.factors.length === 0));
  for (const written of later.flatMap((part) => part.sheets)) {
    const sheet = sheets.find(
      (candidate) =>
        retyped.has(candidate) &&
        candidate.file === written.file &&
        candidate.heading === written.heading &&
        candidate.firstRow === ''
    );
    if (sheet && better(written.factors, sheet.factors)) sheet.factors = written.factors;
  }
  return { ...answer, sheets };
}
