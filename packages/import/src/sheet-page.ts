import { supplementaryTrainingReasons, trainingDomains, trainingPhases } from '@ssm-usor/contracts';
import { z } from 'zod';

import { answerFormat, minutes } from './wire';

export const sheetPageKinds = [
  'ssm_sheet_front',
  'ssm_periodic',
  'psi_sheet_front',
  'psi_periodic',
  'commute_declaration',
  'other',
] as const;

export type SheetPageKind = (typeof sheetPageKinds)[number];

export const signatureStates = ['present', 'absent', 'unclear'] as const;

export type SignatureState = (typeof signatureStates)[number];

// `no_box` for a form whose block has no verifier's box, where the trainer's signature closes it.
export const verifierSignatureStates = [...signatureStates, 'no_box'] as const;

export type VerifierSignatureState = (typeof verifierSignatureStates)[number];

const text = z.string().nullable();

// As the evaluation of 2026-10-30 read them (ADR 032), with the verifier's name, the admission,
// the leave date, the workplace and the annual test added for the confirm.
export const sheetPageSchema = z.object({
  pageKind: z.enum(sheetPageKinds),
  person: z.object({
    lastName: text,
    firstName: text,
    cnp: text,
    employeeNumber: text,
  }),
  fields: z.object({
    birthDate: text,
    birthPlace: text,
    homeAddress: text,
    education: text,
    qualification: text,
    bloodGroup: text,
    rhFactor: text,
    jobTitle: text,
    hiredAt: text,
    leftOn: text,
    workplace: text,
    commuteRoute: text,
    commuteMinutes: minutes(z.int()).nullable(),
  }),
  admission: z.object({
    admittedOn: text,
    admittedByName: text,
    admittedByJobTitle: text,
  }),
  trainings: z.array(
    z.object({
      domain: z.enum(trainingDomains),
      phase: z.enum(trainingPhases),
      annualTest: z.boolean(),
      // YYYY-MM-DD, or YYYY-MM where the sheet writes only the month.
      heldOn: text,
      durationMinutes: minutes(z.int()).nullable(),
      trainerName: text,
      trainerJobTitle: text,
      verifierName: text,
      verifierJobTitle: text,
      material: text,
      supplementaryReason: z.enum(supplementaryTrainingReasons).nullable(),
      traineeSignature: z.enum(signatureStates),
      trainerSignature: z.enum(signatureStates),
      verifierSignature: z.enum(verifierSignatureStates),
    })
  ),
  unreadable: z.array(z.string()),
  notes: z.array(z.string()),
});

export type SheetPage = z.infer<typeof sheetPageSchema>;

export type SheetRow = SheetPage['trainings'][number];

export const sheetPageAnswer = answerFormat('sheet_page', sheetPageSchema);

export interface SheetDate {
  date: string;
  monthOnly: boolean;
}

const validDate = (date: string) => z.iso.date().safeParse(date).success;

// A two-digit year is this century's unless that puts it after this year: a birth in "84".
function fullYear(written: string, today: string) {
  if (written.length === 4) return Number(written);
  const year = 2000 + Number(written);
  return year > Number(today.slice(0, 4)) ? year - 100 : year;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * A date as the model or the sheet writes it: YYYY-MM-DD, DD.MM.YYYY, or a month alone (YYYY-MM,
 * MM/YY, MM.YYYY), which stands for the first of that month.
 */
export function sheetDate(written: string | null, today: string): SheetDate | null {
  if (written === null) return null;
  const value = written.trim();
  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value);
  const dotted = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(value);
  const month = /^(\d{1,2})[./-](\d{2}|\d{4})$/.exec(value);
  let parts: [number, number, number | null] | null = null;
  if (iso) parts = [Number(iso[1]), Number(iso[2]), iso[3] ? Number(iso[3]) : null];
  else if (dotted) parts = [fullYear(dotted[3]!, today), Number(dotted[2]), Number(dotted[1])];
  else if (month) parts = [fullYear(month[2]!, today), Number(month[1]), null];
  if (!parts) return null;
  const [year, monthNumber, day] = parts;
  const date = `${year}-${pad(monthNumber)}-${pad(day ?? 1)}`;
  return validDate(date) ? { date, monthOnly: day === null } : null;
}
