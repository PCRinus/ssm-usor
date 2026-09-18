import { z } from 'zod';

import type {
  ClientDocumentDetailsResponse,
  UpdateClientDocumentDetailsRequest,
} from '../api/generated/api';

type DocumentDetails = ClientDocumentDetailsResponse['documentDetails'];

// Form values are strings so inputs and selects stay controlled; the API request is derived
// on submit. Everything is optional here: generating a document is what asks for it.
const wholeNumber = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => {
      if (value === '') return true;
      const number = Number(value);
      return /^[0-9]+$/.test(value) && number >= min && number <= max;
    }, message);

export const documentDetailsFormSchema = z
  .object({
    legalRepresentativeRole: z
      .string()
      .trim()
      .max(80, 'Funcția are cel mult 80 de caractere.')
      .refine(
        (value) => value.length === 0 || value.length >= 2,
        'Funcția are cel puțin 2 caractere.'
      ),
    periodicTrainingHours: wholeNumber(1, 8, 'Alege o durată între 1 și 8 ore.'),
    administrativeTrainingIntervalMonths: wholeNumber(1, 12, 'Alege un interval din listă.'),
    workerTrainingIntervalMonths: wholeNumber(1, 6, 'Alege un interval din listă.'),
    trainingFirstMonth: wholeNumber(1, 12, 'Alege o lună din listă.'),
    trainingDayFrom: wholeNumber(1, 31, 'Introdu o zi între 1 și 31.'),
    trainingDayTo: wholeNumber(1, 31, 'Introdu o zi între 1 și 31.'),
  })
  .refine(
    (values) =>
      values.trainingDayFrom === '' ||
      values.trainingDayTo === '' ||
      Number(values.trainingDayFrom) <= Number(values.trainingDayTo),
    { path: ['trainingDayTo'], message: 'Ultima zi nu poate fi înaintea primei zile.' }
  );

export type DocumentDetailsFormValues = z.infer<typeof documentDetailsFormSchema>;

const text = (value: number | string | null) => (value === null ? '' : String(value));

export function toDocumentDetailsForm(details: DocumentDetails): DocumentDetailsFormValues {
  return {
    legalRepresentativeRole: text(details.legalRepresentativeRole),
    periodicTrainingHours: text(details.periodicTrainingHours),
    administrativeTrainingIntervalMonths: text(details.administrativeTrainingIntervalMonths),
    workerTrainingIntervalMonths: text(details.workerTrainingIntervalMonths),
    trainingFirstMonth: text(details.trainingFirstMonth),
    trainingDayFrom: text(details.trainingDayFrom),
    trainingDayTo: text(details.trainingDayTo),
  };
}

const numberOrNull = (value: string) => (value ? Number(value) : null);

// The route replaces every field, so an emptied input clears what was saved.
export function toDocumentDetailsRequest(
  values: DocumentDetailsFormValues
): UpdateClientDocumentDetailsRequest {
  return {
    legalRepresentativeRole: values.legalRepresentativeRole || null,
    periodicTrainingHours: numberOrNull(values.periodicTrainingHours),
    administrativeTrainingIntervalMonths: numberOrNull(values.administrativeTrainingIntervalMonths),
    workerTrainingIntervalMonths: numberOrNull(values.workerTrainingIntervalMonths),
    trainingFirstMonth: numberOrNull(values.trainingFirstMonth),
    trainingDayFrom: numberOrNull(values.trainingDayFrom),
    trainingDayTo: numberOrNull(values.trainingDayTo),
  };
}

export const monthNames = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
] as const;

// The intervals providers use, worded the way the decision prints them.
export const intervalOptions = [
  { months: 1, label: 'Lunar' },
  { months: 2, label: 'La 2 luni' },
  { months: 3, label: 'Trimestrial (la 3 luni)' },
  { months: 4, label: 'La 4 luni' },
  { months: 6, label: 'Semestrial (la 6 luni)' },
  { months: 12, label: 'Anual (la 12 luni)' },
] as const;
