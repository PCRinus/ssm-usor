import { z } from 'zod';

import { type TrainingDomain, trainingDomainSchema } from './trainings';

/**
 * The built-in templates of the two individual training sheets (ADR 021): registered in versions
 * like the documents, marked `perEmployee` in their manifests, and never part of a set.
 */
export const trainingSheetTypeKeys = {
  ssm: 'training_sheet_ssm',
  psi: 'training_sheet_psi',
} as const satisfies Record<TrainingDomain, string>;

export type TrainingSheetTypeKey = (typeof trainingSheetTypeKeys)[TrainingDomain];

/**
 * What stops a sheet from being drawn up. The route only on the occupational safety sheet; the
 * workplace on both, at a client with more than one active workplace.
 */
export const missingSheetData = ['employee.commute_route', 'employee.workplace'] as const;
export const missingSheetDataSchema = z.enum(missingSheetData);
export type MissingSheetData = z.infer<typeof missingSheetDataSchema>;

export const missingSheetDataLabels: Record<MissingSheetData, string> = {
  'employee.commute_route': 'traseul de deplasare',
  'employee.workplace': 'punctul de lucru',
};

export const trainingSheetReadinessSchema = z.object({
  ready: z.boolean(),
  missing: z.array(missingSheetDataSchema),
  /** The sheet is the stored signed sheet (ADR 023), not drawn up on the spot. */
  stored: z.boolean(),
});

export type TrainingSheetReadiness = z.infer<typeof trainingSheetReadinessSchema>;

export const trainingSheetsResponseSchema = z.object({
  ssm: trainingSheetReadinessSchema,
  psi: trainingSheetReadinessSchema,
});

export type TrainingSheetsResponse = z.infer<typeof trainingSheetsResponseSchema>;

export const trainingSheetQuerySchema = z.object({ domain: trainingDomainSchema });

export type TrainingSheetQuery = z.infer<typeof trainingSheetQuerySchema>;

export const missingSheetDataResponseSchema = z.object({
  error: z.literal('conflict'),
  message: z.string(),
  reason: z.literal('missing_sheet_data'),
  missing: z.array(missingSheetDataSchema).min(1),
});

export type MissingSheetDataResponse = z.infer<typeof missingSheetDataResponseSchema>;
