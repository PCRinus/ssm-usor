import {
  maxTrainingIntervalMonths,
  staffCategories,
  type StaffCategory,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { JobPositionListResponse, JobPositionRequest } from '../api/generated/api';
import { intervalOptions } from '../document-data/document-details-schema';

export type JobPosition = JobPositionListResponse['items'][number];

// The two kinds of staff the training decision gives an interval each, in its own words.
export const staffCategoryLabels: Record<StaffCategory, string> = {
  execution: 'Personal de execuție',
  technical_administrative: 'Tehnic-administrativ și conducători de locuri de muncă',
};

export const staffCategoryShortLabels: Record<StaffCategory, string> = {
  execution: 'Execuție',
  technical_administrative: 'Tehnic-administrativ',
};

export const intervalOptionsFor = (category: StaffCategory) =>
  intervalOptions.filter(({ months }) => months <= maxTrainingIntervalMonths[category]);

/** "la 2 luni", as it reads inside a sentence or a table cell. */
export function intervalLabel(months: number) {
  return months === 1 ? 'lunar' : `la ${months} luni`;
}

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export const jobPositionFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Introdu denumirea postului (cel puțin 2 caractere).')
      .max(160, 'Denumirea are cel mult 160 de caractere.'),
    staffCategory: z.enum(staffCategories),
    workZone: z.string().trim().max(120, 'Zona de lucru are cel mult 120 de caractere.'),
    activities: z.string().trim().max(2000, 'Descrierea are cel mult 2000 de caractere.'),
    // Empty follows the interval the client sets for the category.
    trainingIntervalMonths: z.string(),
  })
  .refine(
    ({ staffCategory, trainingIntervalMonths }) =>
      trainingIntervalMonths === '' ||
      intervalOptionsFor(staffCategory).some(
        ({ months }) => String(months) === trainingIntervalMonths
      ),
    {
      path: ['trainingIntervalMonths'],
      message: 'Personalul de execuție se instruiește cel mult la 6 luni. Alege alt interval.',
    }
  );

export type JobPositionFormValues = z.infer<typeof jobPositionFormSchema>;

export const emptyJobPositionForm: JobPositionFormValues = {
  name: '',
  // The shorter interval, so a mistake errs towards training too often.
  staffCategory: 'execution',
  workZone: '',
  activities: '',
  trainingIntervalMonths: '',
};

export function toJobPositionForm(position: JobPosition): JobPositionFormValues {
  return {
    name: position.name,
    staffCategory: position.staffCategory,
    workZone: position.workZone ?? '',
    activities: position.activities ?? '',
    trainingIntervalMonths: position.trainingIntervalMonths?.toString() ?? '',
  };
}

export function toJobPositionRequest(values: JobPositionFormValues): JobPositionRequest {
  return {
    name: values.name,
    staffCategory: values.staffCategory,
    workZone: values.workZone || null,
    activities: values.activities || null,
    trainingIntervalMonths: values.trainingIntervalMonths
      ? Number(values.trainingIntervalMonths)
      : null,
  };
}

/** "un angajat", "3 angajați", "20 de angajați". */
export function employeeCountLabel(count: number) {
  if (count === 0) return 'Niciun angajat';
  if (count === 1) return 'Un angajat';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de angajați` : `${count} angajați`;
}
