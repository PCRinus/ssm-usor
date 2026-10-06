import type { DocumentSet } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { GenerateDocumentsRequest } from '@/api/generated/api';
import { isoToDate } from '@/lib/dates';

// Form values are strings so inputs stay controlled; the API request is derived on submit. The
// fire-safety set has no decisions yet, so its form keeps the default number and never sends it.
export const generateDocumentsFormSchema = z.object({
  issueDate: z
    .string()
    .refine((value) => isoToDate(value) !== undefined, 'Alege data documentelor.'),
  firstDecisionNumber: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Introdu un număr între 1 și 9995.')
    .refine((value) => Number(value) >= 1 && Number(value) <= 9995, {
      message: 'Introdu un număr între 1 și 9995.',
    }),
});

export type GenerateDocumentsFormValues = z.infer<typeof generateDocumentsFormSchema>;

export function toGenerateDocumentsRequest(
  values: GenerateDocumentsFormValues,
  set: DocumentSet
): GenerateDocumentsRequest {
  return set === 'occupational_safety'
    ? { issueDate: values.issueDate, firstDecisionNumber: Number(values.firstDecisionNumber) }
    : { issueDate: values.issueDate };
}
