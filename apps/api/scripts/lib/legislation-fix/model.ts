import {
  answerFormat,
  type ChatMessage,
  legislationFixModel,
  type ModelClient,
} from '@ssm-usor/import';
import { z } from 'zod';

import type { Candidate } from './candidates';

export const noteMaxLength = 300;
export const proposedMaxLength = 1_000;
export const reasonMaxLength = 300;

export interface ReadingInput {
  key: string;
  act: { name: string; title: string | null };
  consolidatedOn: string;
  amendingActs: string[];
  units: { label: string; old: string | null; new: string | null }[];
  documents: string[];
  candidates: Candidate[];
  documentOf: (file: string) => string;
}

export interface ProposedEdit {
  file: string;
  paragraph: number;
  current: string;
  proposed: string;
  reason: string;
}

export interface Reading {
  note: string;
  edits: ProposedEdit[];
  // In USD; null when no model was asked or it failed.
  cost: number | null;
  model: string | null;
  // Why the model gave no answer: the note is then the plain one, and no sentence was read.
  failed?: string;
}

const answerSchema = z.object({
  note: z.string(),
  edits: z.array(
    z.object({
      candidate: z.number().int(),
      proposed: z.string(),
      reason: z.string(),
    })
  ),
});

export const readingAnswer = answerFormat('legislation_fix_reading', answerSchema);

export function readingMessages(input: ReadingInput): ChatMessage[] {
  const units = input.units
    .map(
      (unit) =>
        `${unit.label}\nÎnainte: ${unit.old ?? '(nu exista)'}\nAcum: ${unit.new ?? '(abrogat)'}`
    )
    .join('\n\n');
  const candidates = input.candidates.length
    ? input.candidates
        .map((each, index) => `[${index + 1}] ${input.documentOf(each.file)}: ${each.text}`)
        .join('\n')
    : '(niciunul)';
  return [
    {
      role: 'system',
      content: [
        'Ești redactor pentru o aplicație folosită de specialiști în securitatea muncii din România. Un act normativ citat în documentele lor s-a modificat, iar citatul a fost deja înlocuit cu textul în vigoare.',
        `1. note: scrie în română, în cel mult ${noteMaxLength} de caractere, o notă pentru specialiști despre noua versiune a documentului: numește actul și articolul (ex. „art. 36 alin. (2) din O.U.G. 195/2002”), spune pe scurt ce cere acum legea, în cuvinte simple. Fără nume de fișiere, fără detalii tehnice, fără ghilimele în jurul notei.`,
        '2. edits: dintre paragrafele proprii ale documentului primite mai jos (nu sunt citate din lege), alege doar pe cele care reformulează regula schimbată și ar trebui aduse la zi. Pentru fiecare, dă în candidate numărul din paranteze, textul propus întreg (păstrând stilul documentului) și motivul pe scurt, în română. Un paragraf care doar pomenește aceleași cuvinte, sau pe care modificarea nu îl face greșit, nu intră. Dacă niciunul nu trebuie schimbat, edits este o listă goală.',
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: [
        `Actul: ${input.act.name}${input.act.title ? ` (${input.act.title})` : ''}`,
        `Forma consolidată din ${input.consolidatedOn}${input.amendingActs.length ? `, modificat prin ${input.amendingActs.join(', ')}` : ''}.`,
        `Documentele care îl citează: ${input.documents.join('; ')}`,
        `Unitățile modificate:\n\n${units}`,
        `Paragrafele proprii ale documentului care ar putea reformula regula:\n${candidates}`,
      ].join('\n\n'),
    },
  ];
}

export function fallbackNote(input: Pick<ReadingInput, 'act' | 'units' | 'amendingActs'>) {
  const units = input.units.map((unit) => readable(unit.label));
  const form = input.amendingActs.length
    ? `în forma modificată prin ${input.amendingActs.join(', ')}`
    : 'în forma în vigoare';
  return clipNote(
    `${capitalized(units.join(', '))} din ${input.act.name} ${units.length > 1 ? 'sunt citate' : 'este citat'} ${form}.`
  );
}

const readable = (label: string) =>
  (label.charAt(0).toLowerCase() + label.slice(1)).replaceAll('Art.', 'art.');
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const clipped = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const clipNote = (text: string) => clipped(text, noteMaxLength);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

// The note becomes the manifest's change and a quoted line of the pull request, above the
// Actualizări block that the release reads: a heading, a line break, code or markup the model
// wrote could break the block or the page that shows the note.
const unsafeNote = /[\r\n#`<>]/;

export function modelNote(answer: string, input: Parameters<typeof fallbackNote>[0]) {
  const note = answer.trim().replace(/^[„"]|[”"]$/g, '');
  if (unsafeNote.test(note)) return fallbackNote(input);
  const line = oneLine(note);
  return line.length >= 2 && line.length <= noteMaxLength ? line : fallbackNote(input);
}

export async function readChange(model: ModelClient | null, input: ReadingInput): Promise<Reading> {
  if (!model) return { note: fallbackNote(input), edits: [], cost: null, model: null };
  const completion = await model
    .complete({
      model: legislationFixModel,
      messages: readingMessages(input),
      answer: readingAnswer,
      reasoningEffort: 'medium',
      maxCompletionTokens: 8_000,
      metadata: { reading: 'legislation_fix', change: input.key },
    })
    .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
  if (completion instanceof Error) {
    return {
      note: fallbackNote(input),
      edits: [],
      cost: null,
      model: legislationFixModel,
      failed: clipped(oneLine(completion.message), reasonMaxLength),
    };
  }

  return {
    note: modelNote(completion.value.note, input),
    edits: completion.value.edits.flatMap((edit) => {
      const candidate = input.candidates[edit.candidate - 1];
      const proposed = oneLine(edit.proposed);
      return candidate && proposed && proposed !== candidate.text
        ? [
            {
              file: candidate.file,
              paragraph: candidate.paragraph,
              current: candidate.text,
              proposed: clipped(proposed, proposedMaxLength),
              reason: clipped(oneLine(edit.reason), reasonMaxLength),
            },
          ]
        : [];
    }),
    cost: completion.cost,
    model: legislationFixModel,
  };
}
