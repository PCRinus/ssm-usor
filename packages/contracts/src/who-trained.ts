import { z } from 'zod';

import type { TrainingDomain, TrainingPhase } from './trainings';

const signerName = z.string().trim().min(1).max(160);

export const answeredPersonSchema = z
  .object({ name: signerName, jobTitle: signerName.nullable() })
  .strict()
  .meta({ id: 'WhoTrainedPerson' });

export type AnsweredPerson = z.infer<typeof answeredPersonSchema>;

// A verifier is a name and a function together: the confirm writes both or neither.
const verifierPersonSchema = z
  .object({ name: signerName, jobTitle: signerName })
  .strict()
  .meta({ id: 'WhoVerifiedPerson' });

// `before` names the trainings dated from the previous handover, or from the first, up to the day
// before the latest handover, and `from` those dated on the latest handover or after. `splitOn` and
// `previousOn` are the handovers the answer was given under, null for none; an answer whose
// handovers no longer match the person's sheets names nothing.
const periodFields = {
  splitOn: z.iso.date().nullable().optional(),
  previousOn: z.iso.date().nullable().optional(),
};

const trainerPeriodsSchema = z
  .object({
    before: answeredPersonSchema.optional(),
    from: answeredPersonSchema.optional(),
    ...periodFields,
  })
  .strict()
  .meta({ id: 'WhoTrainedPeriods' });

const verifierPeriodsSchema = z
  .object({
    before: verifierPersonSchema.optional(),
    from: verifierPersonSchema.optional(),
    ...periodFields,
  })
  .strict()
  .meta({ id: 'WhoVerifiedPeriods' });

export type AnswerPeriods = z.infer<typeof trainerPeriodsSchema>;

export const whoTrainedAnswerSchema = z
  .object({
    trainer: trainerPeriodsSchema.optional(),
    // Fire-safety sheets have no verifier's signature, so a fire-safety answer's is never used.
    verifier: verifierPeriodsSchema.optional(),
    // The handovers came with a copy to a person whose own sheets record none.
    splitCopied: z.literal(true).optional(),
    // The person whose answer this is a copy of, and follows, until the member changes it.
    copiedFrom: z.string().min(1).max(80).optional(),
  })
  .strict()
  .meta({ id: 'WhoTrainedAnswer' });

export type WhoTrainedAnswer = z.infer<typeof whoTrainedAnswerSchema>;

export type AnswerRole = 'trainer' | 'verifier';

export type AnswerPeriod = 'before' | 'from';

export const answerRoles = (domain: TrainingDomain): AnswerRole[] =>
  domain === 'ssm' ? ['trainer', 'verifier'] : ['trainer'];

const hiringPhases: readonly TrainingPhase[] = ['introductory_general', 'workplace'];

// The periodic table of a sheet has only signatures, so only its rows take the answer (ADR 042).
export const answersPhase = (phase: TrainingPhase) => !hiringPhases.includes(phase);

export type HandoverWindow = { splitOn: string | null; previousOn: string | null };

export const noHandover: HandoverWindow = { splitOn: null, previousOn: null };

// A provider takes over the client, not a domain, so a person's handovers count across both.
export function handoverWindow(
  pages: readonly { handovers?: readonly { date: string | null }[] }[]
): HandoverWindow {
  const days = [
    ...new Set(pages.flatMap((page) => (page.handovers ?? []).flatMap(({ date }) => date ?? []))),
  ].sort();
  return { splitOn: days.at(-1) ?? null, previousOn: days.at(-2) ?? null };
}

export function roleWindow(
  own: HandoverWindow,
  answer: WhoTrainedAnswer | undefined,
  role: AnswerRole
): HandoverWindow {
  const periods = answer?.[role];
  if (own.splitOn !== null || !answer?.splitCopied || !periods) return own;
  return { splitOn: periods.splitOn ?? null, previousOn: periods.previousOn ?? null };
}

const roleLive = (own: HandoverWindow, answer: WhoTrainedAnswer | undefined, role: AnswerRole) => {
  const periods = answer?.[role];
  if (!periods || periods.splitOn === undefined) return false;
  const window = roleWindow(own, answer, role);
  return periods.splitOn === window.splitOn && (periods.previousOn ?? null) === window.previousOn;
};

export function liveAnswer(
  own: HandoverWindow,
  answer: WhoTrainedAnswer | undefined
): WhoTrainedAnswer | undefined {
  if (!answer) return undefined;
  const live: WhoTrainedAnswer = { ...answer };
  for (const role of ['trainer', 'verifier'] as const) {
    if (!roleLive(own, answer, role)) delete live[role];
  }
  return live;
}

export const staleRoles = (
  domain: TrainingDomain,
  own: HandoverWindow,
  answer: WhoTrainedAnswer | undefined
) =>
  answerRoles(domain).filter(
    (role) => (answer?.[role]?.before || answer?.[role]?.from) && !roleLive(own, answer, role)
  );

// A month-only row stands for any day of its month, so a handover in that month after its first
// day leaves it on neither side.
const sameMonthAfterFirst = (heldOn: string, day: string) =>
  day.slice(0, 7) === heldOn.slice(0, 7) && day.slice(8) !== '01';

// An undated row falls in neither period and keeps what the paper says, and so does one dated
// before the previous handover, which a provider before the one answered for gave.
export function answerPeriod(
  heldOn: string | null,
  window: HandoverWindow,
  monthOnly = false
): AnswerPeriod | null {
  if (heldOn === null) return null;
  const { splitOn, previousOn } = window;
  if (splitOn === null) return 'from';
  if (monthOnly && sameMonthAfterFirst(heldOn, splitOn)) return null;
  if (heldOn >= splitOn) return 'from';
  if (previousOn === null) return 'before';
  if (monthOnly && sameMonthAfterFirst(heldOn, previousOn)) return null;
  return heldOn >= previousOn ? 'before' : null;
}

export const handoverPrecedes = (handover: string, heldOn: string, monthOnly: boolean) =>
  heldOn >= handover || (monthOnly && sameMonthAfterFirst(heldOn, handover));

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

/** A row's day as read only to the month, unless the member wrote another day. */
export const monthOnlyRow = (
  row: { heldOn: string | null; flags: readonly string[] },
  stored: Readonly<Record<string, unknown>> | undefined
) =>
  row.flags.includes('month_only') &&
  !(stored !== undefined && 'heldOn' in stored && !sameText(stored.heldOn, row.heldOn));

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
 * writes is never replaced by the answer, nor a function it writes without a name.
 */
export function rowSigner(input: {
  domain: TrainingDomain;
  phase: TrainingPhase;
  role: AnswerRole;
  // The row's values, the member's where `typed`.
  name: string | null;
  jobTitle: string | null;
  typed: boolean;
  heldOn: string | null;
  monthOnly: boolean;
  handovers: HandoverWindow;
  answer: WhoTrainedAnswer | undefined;
}): RowSigner {
  const { name, jobTitle, role } = input;
  if (input.typed) return { name, jobTitle, source: 'row' };
  if (written(name)) return { name, jobTitle, source: 'sheet' };
  if (!answersPhase(input.phase) || !answerRoles(input.domain).includes(role)) {
    return { name, jobTitle, source: null };
  }
  const live = liveAnswer(input.handovers, input.answer);
  const period = answerPeriod(
    input.heldOn,
    roleWindow(input.handovers, input.answer, role),
    input.monthOnly
  );
  const answered = period === null ? undefined : live?.[role]?.[period];
  if (!answered) return { name, jobTitle, source: null };
  return {
    name: answered.name,
    jobTitle: written(jobTitle) ? jobTitle : answered.jobTitle,
    source: 'answer',
  };
}
