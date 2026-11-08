import {
  fireSafetyStartingValues,
  type FireSmokingPolicy,
  type StaffCategory,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  ClientDocumentDetailsResponse,
  ClientFireSafetyResponse,
  UpdateClientFireSafetyRequest,
} from '@/api/generated/api';

import { dayOrderProblem, monthNames } from './document-details-schema';
import { type CategoryPosts, intervalChoices, intervalFieldId } from './schedule-rules';

export type FireSafety = ClientFireSafetyResponse['fireSafety'];
type DocumentDetails = ClientDocumentDetailsResponse['documentDetails'];

export const fireSmokingChoices: Record<FireSmokingPolicy, string> = {
  forbidden_everywhere: 'Interzis în toată unitatea',
  designated_places: 'Permis numai în locuri amenajate',
};

const intervalNames: Record<number, string> = {
  1: 'Lunar',
  3: 'Trimestrial (la 3 luni)',
  6: 'Semestrial (la 6 luni)',
};

export const fireIntervalChoices = [1, 2, 3, 4, 5, 6].map((months) => ({
  value: String(months),
  label: intervalNames[months] ?? `La ${months} luni`,
}));

export const maxWasteKinds = 12;

const maxWasteKindLength = 240;

const maxSmokingPlaceLength = 240;

// Null when the kind can be added; otherwise what is wrong with it.
export function wasteKindProblem(kind: string, kinds: readonly string[]) {
  const trimmed = kind.trim();
  if (trimmed.length < 2) return 'Un tip de deșeu are cel puțin 2 caractere.';
  if (trimmed.length > maxWasteKindLength)
    return `Un tip de deșeu are cel mult ${maxWasteKindLength} de caractere.`;
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
    'Scrie o zi între 1 și 31.'
  );

const fireHours = ['2', '3', '4', '5', '6', '7', '8'];
const fireIntervals = intervalChoices('su', 'execution').map(String);

// Form values are strings so inputs stay controlled. Everything is optional here, as on the
// occupational safety card: generating the fire-safety set is what asks for it.
export const fireScheduleFormSchema = z
  .object({
    periodicTrainingHours: choice(fireHours, 'Alege o durată.'),
    administrativeTrainingIntervalMonths: choice(fireIntervals, 'Alege un interval.'),
    workerTrainingIntervalMonths: choice(fireIntervals, 'Alege un interval.'),
    trainingFirstMonth: choice(
      monthNames.map((_, index) => String(index + 1)),
      'Alege o lună din listă.'
    ),
    trainingDayFrom: day,
    trainingDayTo: day,
  })
  .superRefine((values, context) => {
    const problem = dayOrderProblem(values.trainingDayFrom, values.trainingDayTo);
    if (problem) context.addIssue({ code: 'custom', path: ['trainingDayTo'], message: problem });
  });

export type FireScheduleFormValues = z.infer<typeof fireScheduleFormSchema>;

export const fireRulesFormSchema = z
  .object({
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
    wasteCollectors: z
      .string()
      .trim()
      .max(160, 'Textul are cel mult 160 de caractere.')
      .refine(
        (value) => value.length === 0 || value.length >= 2,
        'Textul are cel puțin 2 caractere.'
      ),
    hasThirdParties: z.boolean(),
  })
  .superRefine((values, context) => {
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

export type FireRulesFormValues = z.infer<typeof fireRulesFormSchema>;

const text = (value: number | string | null) => (value === null ? '' : String(value));

const scheduleFields = [
  'periodicTrainingHours',
  'administrativeTrainingIntervalMonths',
  'workerTrainingIntervalMonths',
  'trainingFirstMonth',
  'trainingDayFrom',
  'trainingDayTo',
] as const;

/**
 * While nothing of the schedule is saved, the card opens on the law's minimum duration, its
 * longest interval and the occupational safety calendar, which belongs to the client, not to a
 * law (ADR 018, ADR 039). A row the smoking card saved first still has no schedule.
 */
export function startingFireSchedule(
  saved: FireSafety,
  occupational: Pick<
    DocumentDetails,
    'trainingFirstMonth' | 'trainingDayFrom' | 'trainingDayTo'
  > | null
): { start: FireSafety; starting: boolean } {
  if (scheduleFields.some((field) => saved[field] !== null))
    return { start: saved, starting: false };
  return {
    start: {
      ...saved,
      ...fireSafetyStartingValues,
      trainingFirstMonth: occupational?.trainingFirstMonth ?? null,
      trainingDayFrom: occupational?.trainingDayFrom ?? null,
      trainingDayTo: occupational?.trainingDayTo ?? null,
    },
    starting: true,
  };
}

export const fireIntervalField = {
  execution: 'workerTrainingIntervalMonths',
  technical_administrative: 'administrativeTrainingIntervalMonths',
} as const satisfies Record<StaffCategory, keyof FireScheduleFormValues>;

export function toFireScheduleForm(start: FireSafety): FireScheduleFormValues {
  return Object.fromEntries(
    scheduleFields.map((field) => [field, text(start[field])])
  ) as FireScheduleFormValues;
}

export function toFireRulesForm(saved: FireSafety): FireRulesFormValues {
  return {
    smokingPolicy: saved.smokingPolicy ?? '',
    smokingPlace: saved.smokingPlace ?? '',
    wasteKinds: saved.wasteKinds,
    wasteDraft: '',
    wasteContractor: saved.wasteContractor ?? '',
    wasteCollectors: saved.wasteCollectors ?? '',
    hasThirdParties: saved.hasThirdParties,
  };
}

const numberOrNull = (value: string) => (value ? Number(value) : null);

export function fireSafetyRequest(saved: FireSafety): UpdateClientFireSafetyRequest {
  return {
    periodicTrainingHours: saved.periodicTrainingHours,
    administrativeTrainingIntervalMonths: saved.administrativeTrainingIntervalMonths,
    workerTrainingIntervalMonths: saved.workerTrainingIntervalMonths,
    trainingFirstMonth: saved.trainingFirstMonth,
    trainingDayFrom: saved.trainingDayFrom,
    trainingDayTo: saved.trainingDayTo,
    smokingPolicy: saved.smokingPolicy,
    smokingPlace: saved.smokingPlace,
    wasteKinds: saved.wasteKinds,
    wasteContractor: saved.wasteContractor,
    wasteCollectors: saved.wasteCollectors,
    hasThirdParties: saved.hasThirdParties,
  };
}

// An interval saved for a category without posts is sent back as it was (ADR 039).
export function fireScheduleChange(
  values: FireScheduleFormValues,
  categories: readonly CategoryPosts[]
): Partial<UpdateClientFireSafetyRequest> {
  return {
    periodicTrainingHours: numberOrNull(values.periodicTrainingHours),
    trainingFirstMonth: numberOrNull(values.trainingFirstMonth),
    trainingDayFrom: numberOrNull(values.trainingDayFrom),
    trainingDayTo: numberOrNull(values.trainingDayTo),
    ...Object.fromEntries(
      categories.map(({ category }) => [
        fireIntervalField[category],
        numberOrNull(values[fireIntervalField[category]]),
      ])
    ),
  };
}

export function fireRulesChange(
  values: FireRulesFormValues
): Partial<UpdateClientFireSafetyRequest> {
  const draft = values.wasteDraft.trim();
  return {
    smokingPolicy: (values.smokingPolicy || null) as FireSmokingPolicy | null,
    // The place stays in the form while another rule is picked, in case the pick is undone.
    smokingPlace:
      values.smokingPolicy === 'designated_places' ? values.smokingPlace.trim() || null : null,
    wasteKinds: draft ? [...values.wasteKinds, draft] : values.wasteKinds,
    wasteContractor: values.wasteContractor.trim() || null,
    wasteCollectors: values.wasteCollectors.trim() || null,
    hasThirdParties: values.hasThirdParties,
  };
}

export const fireCategoryInterval = (saved: FireSafety, category: StaffCategory) =>
  saved[fireIntervalField[category]];

export type FireSchedule = {
  periodicTrainingHours: number;
  trainingFirstMonth: number;
  trainingDayFrom: number;
  trainingDayTo: number;
};

export function completeFireSchedule(
  saved: FireSafety,
  categories: readonly CategoryPosts[]
): FireSchedule | null {
  const { periodicTrainingHours, trainingFirstMonth, trainingDayFrom, trainingDayTo } = saved;
  if (
    periodicTrainingHours === null ||
    trainingFirstMonth === null ||
    trainingDayFrom === null ||
    trainingDayTo === null ||
    categories.some(({ category }) => fireCategoryInterval(saved, category) === null)
  ) {
    return null;
  }
  return { periodicTrainingHours, trainingFirstMonth, trainingDayFrom, trainingDayTo };
}

export function firstFireScheduleField(saved: FireSafety, categories: readonly CategoryPosts[]) {
  const unset = categories.find(({ category }) => fireCategoryInterval(saved, category) === null);
  if (unset) return intervalFieldId('fire', unset.category);
  if (saved.trainingFirstMonth === null) return 'fire-first-month';
  if (saved.trainingDayFrom === null) return 'fire-day-from';
  if (saved.trainingDayTo === null) return 'fire-day-to';
  if (saved.periodicTrainingHours === null) return 'fire-training-duration';
  return categories[0] ? intervalFieldId('fire', categories[0].category) : 'fire-first-month';
}
