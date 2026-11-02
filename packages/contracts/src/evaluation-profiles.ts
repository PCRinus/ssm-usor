import { z } from 'zod';

import {
  evaluatedJobPositionSchema,
  riskEvaluationKindSchema,
  riskEvaluationResponseSchema,
  riskFactorSchema,
} from './risk-evaluations';

// The organization's risk library (ADR 015). A profile's factors take the same requests as an
// evaluation's, `riskFactorRequestSchema`, and answer with the same factors.

const profileName = z.string().trim().min(2).max(160);

const evaluationProfileFields = {
  id: z.uuid(),
  name: z.string(),
  // Null while the profile has no factors.
  globalRiskLevel: z.number().min(1).max(7).nullable(),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  // Whether any client's factor points at one of its factors, archived posts and clients
  // included: one in use is archived, never deleted (ADR 036).
  inUse: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};

export const evaluationProfileSchema = z.object({
  ...evaluationProfileFields,
  factors: z.array(riskFactorSchema),
});

export type EvaluationProfile = z.infer<typeof evaluationProfileSchema>;

export const evaluationProfileSummarySchema = z.object({
  ...evaluationProfileFields,
  factorCount: z.int().min(0),
  unacceptableFactorCount: z.int().min(0),
  // The clients the usage lists, which leaves out archived posts: possibly 0 while `inUse`.
  clientCount: z.int().min(0),
});

export type EvaluationProfileSummary = z.infer<typeof evaluationProfileSummarySchema>;

export const evaluationProfileListQuerySchema = z.object({
  // Archived profiles leave the list unless asked for.
  archived: z.enum(['true', 'false']).default('false'),
});

export type EvaluationProfileListQuery = z.infer<typeof evaluationProfileListQuerySchema>;

export const evaluationProfileListResponseSchema = z.object({
  items: z.array(evaluationProfileSummarySchema),
});

export type EvaluationProfileListResponse = z.infer<typeof evaluationProfileListResponseSchema>;

export const evaluationProfileResponseSchema = z.object({ profile: evaluationProfileSchema });

export type EvaluationProfileResponse = z.infer<typeof evaluationProfileResponseSchema>;

export const evaluationProfileNameRequestSchema = z.object({ name: profileName });

export type EvaluationProfileNameRequest = z.infer<typeof evaluationProfileNameRequestSchema>;

export const updateEvaluationProfileRequestSchema = z.object({
  name: profileName.optional(),
  // True archives, false restores.
  archived: z.boolean().optional(),
});

export type UpdateEvaluationProfileRequest = z.infer<typeof updateEvaluationProfileRequestSchema>;

export const applyEvaluationProfileRequestSchema = z.object({ profileId: z.uuid() });

export type ApplyEvaluationProfileRequest = z.infer<typeof applyEvaluationProfileRequestSchema>;

export const applyEvaluationProfileResponseSchema = riskEvaluationResponseSchema.extend({
  addedFactorCount: z.int().min(0),
});

export type ApplyEvaluationProfileResponse = z.infer<typeof applyEvaluationProfileResponseSchema>;

// An evaluation with factors that point into the profile. `id`, `clientId`, `kind`,
// `jobPosition` and `name` are the evaluation's, as on a summary.
export const evaluationProfileUseSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  clientArchivedAt: z.iso.datetime({ offset: true }).nullable(),
  kind: riskEvaluationKindSchema,
  jobPosition: evaluatedJobPositionSchema.nullable(),
  name: z.string().nullable(),
  linkedFactorCount: z.int().min(1),
});

export type EvaluationProfileUse = z.infer<typeof evaluationProfileUseSchema>;

export const evaluationProfileUsageResponseSchema = z.object({
  items: z.array(evaluationProfileUseSchema),
});

export type EvaluationProfileUsageResponse = z.infer<typeof evaluationProfileUsageResponseSchema>;

/** `reason` values on evaluation profile errors, so the SPA can word them itself. */
export const evaluationProfileErrorReasons = [
  'evaluation_profile_name_taken',
  'evaluation_profile_in_use',
  'evaluation_profile_archived',
] as const;

export type EvaluationProfileErrorReason = (typeof evaluationProfileErrorReasons)[number];
