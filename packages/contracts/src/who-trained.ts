import { z } from 'zod';

import type { TrainingDomain, TrainingPhase } from './trainings';

const signerName = z.string().trim().min(1).max(160);

export const answeredPersonSchema = z
  .object({ name: signerName, jobTitle: signerName.nullable() })
  .strict();

export type AnsweredPerson = z.infer<typeof answeredPersonSchema>;

// `before` names the trainings dated before the handover and `from` those dated on it or after.
// With no handover date, `from` names them all.
const answerPeriodsSchema = z
  .object({ before: answeredPersonSchema.optional(), from: answeredPersonSchema.optional() })
  .strict();

export type AnswerPeriods = z.infer<typeof answerPeriodsSchema>;

export const whoTrainedAnswerSchema = z
  .object({
    trainer: answerPeriodsSchema.optional(),
    // Fire-safety sheets have no verifier's signature, so a fire-safety answer's is never used.
    verifier: answerPeriodsSchema.optional(),
    // The handover date an answer copied to a person whose own sheets have none splits at.
    splitOn: z.iso.date().optional(),
    // The person whose answer this is a copy of, until the member changes it.
    copiedFrom: z.string().min(1).max(80).optional(),
  })
  .strict();

export type WhoTrainedAnswer = z.infer<typeof whoTrainedAnswerSchema>;

export type AnswerRole = 'trainer' | 'verifier';

export type AnswerPeriod = keyof AnswerPeriods;

export const answerRoles = (domain: TrainingDomain): AnswerRole[] =>
  domain === 'ssm' ? ['trainer', 'verifier'] : ['trainer'];

const hiringPhases: readonly TrainingPhase[] = ['introductory_general', 'workplace'];

// The periodic table of a sheet has only signatures, so only its rows take the answer (ADR 042).
export const answersPhase = (phase: TrainingPhase) => !hiringPhases.includes(phase);

// Several handovers on one person's sheets: the latest is the current provider's.
export function handoverDay(pages: readonly { handovers?: readonly { date: string | null }[] }[]) {
  const days = pages.flatMap((page) => (page.handovers ?? []).flatMap(({ date }) => date ?? []));
  return days.length > 0 ? days.sort().at(-1)! : null;
}

export const answerSplit = (own: string | null, answer: WhoTrainedAnswer | undefined) =>
  own ?? answer?.splitOn ?? null;

// An undated row falls in neither period and keeps what the paper says.
export function answerPeriod(heldOn: string | null, splitOn: string | null): AnswerPeriod | null {
  if (heldOn === null) return null;
  return splitOn !== null && heldOn < splitOn ? 'before' : 'from';
}

export function answeredPerson(
  answer: WhoTrainedAnswer | undefined,
  role: AnswerRole,
  period: AnswerPeriod | null
): AnsweredPerson | null {
  if (!answer || period === null) return null;
  return answer[role]?.[period] ?? null;
}

export const hasAnswer = (domain: TrainingDomain, answer: WhoTrainedAnswer | undefined) =>
  answerRoles(domain).some((role) => answer?.[role]?.before || answer?.[role]?.from);

const sameText = (a: unknown, b: unknown) =>
  (typeof a === 'string' ? a.trim() : (a ?? null)) ===
  (typeof b === 'string' ? b.trim() : (b ?? null));

/**
 * Whether the member typed a value of the row on the row itself. The row dialogs once saved every
 * field on any edit, so a stored value equal to the reading is that save, and so is an empty one
 * where an older proposal took the value from the client's themes. An empty text is a name the
 * member cleared.
 */
export const typedOnRow = (
  stored: Readonly<Record<string, unknown>> | undefined,
  read: Readonly<Record<string, unknown>>,
  names: readonly string[],
  themed: readonly string[] = []
) =>
  names.some(
    (name) =>
      stored !== undefined &&
      name in stored &&
      !sameText(stored[name], read[name]) &&
      !(themed.includes(name) && stored[name] === null)
  );

export type NameSource = 'sheet' | 'row' | 'answer';

export type RowSigner = {
  name: string | null;
  jobTitle: string | null;
  // Null when the row names nobody.
  source: NameSource | null;
};

const written = (value: string | null) => value !== null && value.trim() !== '';

/**
 * A slot of a row as confirming writes it: what the member typed on the row, else the name the
 * sheet writes, else, on a periodic row, the person's answer for its period. A name the sheet
 * writes is never replaced by the answer.
 */
export function rowSigner(input: {
  domain: TrainingDomain;
  phase: TrainingPhase;
  role: AnswerRole;
  // The row's values, the member's where `typed`.
  name: string | null;
  jobTitle: string | null;
  typed: boolean;
  period: AnswerPeriod | null;
  answer: WhoTrainedAnswer | undefined;
}): RowSigner {
  const { name, jobTitle } = input;
  if (input.typed) return { name, jobTitle, source: 'row' };
  if (written(name)) return { name, jobTitle, source: 'sheet' };
  const answered =
    answersPhase(input.phase) && answerRoles(input.domain).includes(input.role)
      ? answeredPerson(input.answer, input.role, input.period)
      : null;
  if (answered) return { name: answered.name, jobTitle: answered.jobTitle, source: 'answer' };
  return { name, jobTitle, source: null };
}
