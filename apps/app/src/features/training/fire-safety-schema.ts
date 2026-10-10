import { fireSafetyStartingValues, type FireSmokingPolicy } from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  ClientDocumentDetailsResponse,
  ClientFireSafetyResponse,
  UpdateClientFireSafetyRequest,
} from '@/api/generated/api';

import { monthNames } from './document-details-schema';

export type FireSafety = ClientFireSafetyResponse['fireSafety'];
type DocumentDetails = ClientDocumentDetailsResponse['documentDetails'];

export const fireSmokingChoices: Record<FireSmokingPolicy, string> = {
  forbidden_everywhere: 'Interzis în toată unitatea',
  designated_places: 'Permis numai în locuri amenajate',
};

export const fireHourChoices = [2, 3, 4, 5, 6, 7, 8].map((hours) => ({
  value: String(hours),
  label: `${hours} ore`,
}));

const intervalNames: Record<number, string> = {
  1: 'Lunar',
  3: 'Trimestrial (la 3 luni)',
  6: 'Semestrial (la 6 luni)',
};

export const fireIntervalChoices = [1, 2, 3, 4, 5, 6].map((months) => ({
  value: String(months),
  label: intervalNames[months] ?? `La ${months} luni`,
}));

export const monthChoices = monthNames.map((label, index) => ({
  value: String(index + 1),
  label,
}));

export const maxWasteKinds = 12;

const maxSmokingPlaceLength = 240;

// Null when the kind can be added; otherwise what is wrong with it.
export function wasteKindProblem(kind: string, kinds: readonly string[]) {
  const trimmed = kind.trim();
  if (trimmed.length < 2) return 'Un tip de deșeu are cel puțin 2 caractere.';
  if (trimmed.length > 80) return 'Un tip de deșeu are cel mult 80 de caractere.';
  const lower = trimmed.toLocaleLowerCase('ro');
  if (kinds.some((other) => other.toLocaleLowerCase('ro') === lower)) {
    return 'Acest tip de deșeu este deja în listă.';
  }
  if (kinds.length >= maxWasteKinds)
    return `Poți trece cel mult ${maxWasteKinds} tipuri de deșeuri.`;
  return null;
}

const choice = (values: readonly string[], message: string) =>
  z.string().refine((value) => value === '' || values.includes(value), message);

const day = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === '' || (/^[0-9]+$/.test(value) && Number(value) >= 1 && Number(value) <= 31),
    'Introdu o zi între 1 și 31.'
  );

// Form values are strings so inputs stay controlled. Everything is optional here, as on the
// occupational safety card: generating the fire-safety set is what asks for it.
export const fireSafetyFormSchema = z
  .object({
    periodicTrainingHours: choice(
      fireHourChoices.map(({ value }) => value),
      'Alege o durată din listă.'
    ),
    administrativeTrainingIntervalMonths: choice(
      fireIntervalChoices.map(({ value }) => value),
      'Alege un interval din listă.'
    ),
    workerTrainingIntervalMonths: choice(
      fireIntervalChoices.map(({ value }) => value),
      'Alege un interval din listă.'
    ),
    trainingFirstMonth: choice(
      monthChoices.map(({ value }) => value),
      'Alege o lună din listă.'
    ),
    trainingDayFrom: day,
    trainingDayTo: day,
    smokingPolicy: choice(Object.keys(fireSmokingChoices), 'Alege o regulă din listă.'),
    smokingPlace: z.string(),
    wasteKinds: z.array(z.string()),
    // What is typed but not yet added; saving adds it.
    wasteDraft: z.string(),
    wasteContractor: z
      .string()
      .trim()
      .max(160, 'Denumirea are cel mult 160 de caractere.')
      .refine(
        (value) => value.length === 0 || value.length >= 2,
        'Denumirea are cel puțin 2 caractere.'
      ),
  })
  .superRefine((values, context) => {
    if (
      values.trainingDayFrom !== '' &&
      values.trainingDayTo !== '' &&
      Number(values.trainingDayFrom) > Number(values.trainingDayTo)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['trainingDayTo'],
        message: 'Ultima zi nu poate fi înaintea primei zile.',
      });
    }
    const place = values.smokingPlace.trim();
    if (values.smokingPolicy === 'designated_places' && place !== '') {
      if (place.length < 2) {
        context.addIssue({
          code: 'custom',
          path: ['smokingPlace'],
          message: 'Locul are cel puțin 2 caractere.',
        });
      } else if (place.length > maxSmokingPlaceLength) {
        context.addIssue({
          code: 'custom',
          path: ['smokingPlace'],
          message: `Locul are cel mult ${maxSmokingPlaceLength} de caractere.`,
        });
      }
    }
    if (values.wasteDraft.trim() === '') return;
    const problem = wasteKindProblem(values.wasteDraft, values.wasteKinds);
    if (problem) context.addIssue({ code: 'custom', path: ['wasteDraft'], message: problem });
  });

export type FireSafetyFormValues = z.infer<typeof fireSafetyFormSchema>;

const text = (value: number | string | null) => (value === null ? '' : String(value));

// Before the first save the card opens on the law's minimum, the sample's intervals and the
// occupational safety calendar, which belongs to the client, not to a law (ADR 018).
export function startingFireSafety(
  saved: FireSafety,
  exists: boolean,
  occupational: Pick<
    DocumentDetails,
    'trainingFirstMonth' | 'trainingDayFrom' | 'trainingDayTo'
  > | null
): FireSafety {
  if (exists) return saved;
  return {
    ...saved,
    ...fireSafetyStartingValues,
    trainingFirstMonth: occupational?.trainingFirstMonth ?? null,
    trainingDayFrom: occupational?.trainingDayFrom ?? null,
    trainingDayTo: occupational?.trainingDayTo ?? null,
  };
}

export function toFireSafetyForm(start: FireSafety): FireSafetyFormValues {
  return {
    periodicTrainingHours: text(start.periodicTrainingHours),
    administrativeTrainingIntervalMonths: text(start.administrativeTrainingIntervalMonths),
    workerTrainingIntervalMonths: text(start.workerTrainingIntervalMonths),
    trainingFirstMonth: text(start.trainingFirstMonth),
    trainingDayFrom: text(start.trainingDayFrom),
    trainingDayTo: text(start.trainingDayTo),
    smokingPolicy: start.smokingPolicy ?? '',
    smokingPlace: start.smokingPlace ?? '',
    wasteKinds: start.wasteKinds,
    wasteDraft: '',
    wasteContractor: start.wasteContractor ?? '',
  };
}

const numberOrNull = (value: string) => (value ? Number(value) : null);

// The route replaces every field, so an emptied input clears what was saved.
export function toFireSafetyRequest(values: FireSafetyFormValues): UpdateClientFireSafetyRequest {
  const draft = values.wasteDraft.trim();
  return {
    periodicTrainingHours: numberOrNull(values.periodicTrainingHours),
    administrativeTrainingIntervalMonths: numberOrNull(values.administrativeTrainingIntervalMonths),
    workerTrainingIntervalMonths: numberOrNull(values.workerTrainingIntervalMonths),
    trainingFirstMonth: numberOrNull(values.trainingFirstMonth),
    trainingDayFrom: numberOrNull(values.trainingDayFrom),
    trainingDayTo: numberOrNull(values.trainingDayTo),
    smokingPolicy: (values.smokingPolicy || null) as FireSmokingPolicy | null,
    // The place stays in the form while another rule is picked, in case the pick is undone.
    smokingPlace:
      values.smokingPolicy === 'designated_places' ? values.smokingPlace.trim() || null : null,
    wasteKinds: draft ? [...values.wasteKinds, draft] : values.wasteKinds,
    wasteContractor: values.wasteContractor.trim() || null,
  };
}

export type FireSchedule = {
  periodicTrainingHours: number;
  administrativeTrainingIntervalMonths: number;
  workerTrainingIntervalMonths: number;
  trainingFirstMonth: number;
  trainingDayFrom: number;
  trainingDayTo: number;
};

export function completeFireSchedule(saved: FireSafety): FireSchedule | null {
  const {
    periodicTrainingHours,
    administrativeTrainingIntervalMonths,
    workerTrainingIntervalMonths,
    trainingFirstMonth,
    trainingDayFrom,
    trainingDayTo,
  } = saved;
  if (
    periodicTrainingHours === null ||
    administrativeTrainingIntervalMonths === null ||
    workerTrainingIntervalMonths === null ||
    trainingFirstMonth === null ||
    trainingDayFrom === null ||
    trainingDayTo === null
  ) {
    return null;
  }
  return {
    periodicTrainingHours,
    administrativeTrainingIntervalMonths,
    workerTrainingIntervalMonths,
    trainingFirstMonth,
    trainingDayFrom,
    trainingDayTo,
  };
}

export function firstFireScheduleField(saved: FireSafety) {
  if (saved.periodicTrainingHours === null) return 'fire-training-hours';
  if (saved.administrativeTrainingIntervalMonths === null) return 'fire-administrative-interval';
  if (saved.workerTrainingIntervalMonths === null) return 'fire-worker-interval';
  if (saved.trainingFirstMonth === null) return 'fire-first-month';
  if (saved.trainingDayFrom === null) return 'fire-day-from';
  if (saved.trainingDayTo === null) return 'fire-day-to';
  return 'fire-training-hours';
}
