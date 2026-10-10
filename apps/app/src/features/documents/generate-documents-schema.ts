import { type DocumentSet, maxFirstFireDecisionNumber } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { GenerateDocumentsRequest } from '@/api/generated/api';
import { isoToDate } from '@/lib/dates';

// The occupational safety set numbers five decisions one after another; the fire-safety set
// numbers nine by their places in the binder, so its first number leaves room for the ninth.
const maxFirstDecisionNumber: Record<DocumentSet, number> = {
  occupational_safety: 9995,
  fire_safety: maxFirstFireDecisionNumber,
};

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export function generateDocumentsFormSchema(set: DocumentSet) {
  const max = maxFirstDecisionNumber[set];
  const outOfRange = `Introdu un număr între 1 și ${max}.`;
  return z.object({
    issueDate: z
      .string()
      .refine((value) => isoToDate(value) !== undefined, 'Alege data documentelor.'),
    firstDecisionNumber: z
      .string()
      .trim()
      .regex(/^\d{1,4}$/, outOfRange)
      .refine((value) => Number(value) >= 1 && Number(value) <= max, { message: outOfRange }),
  });
}

export type GenerateDocumentsFormValues = z.infer<ReturnType<typeof generateDocumentsFormSchema>>;

export function toGenerateDocumentsRequest(
  values: GenerateDocumentsFormValues
): GenerateDocumentsRequest {
  return { issueDate: values.issueDate, firstDecisionNumber: Number(values.firstDecisionNumber) };
}
