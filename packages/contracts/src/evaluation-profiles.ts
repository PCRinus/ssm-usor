import { z } from 'zod';

import { riskEvaluationResponseSchema, riskFactorSchema } from './risk-evaluations';

// The organization's risk library (ADR 015). A profile's factors take the same requests as an
// evaluation's, `riskFactorRequestSchema`, and answer with the same factors.

const profileName = z.string().trim().min(2).max(160);

const evaluationProfileFields = {
  id: z.uuid(),
  name: z.string(),
  // Null while the profile has no factors.
  globalRiskLevel: z.number().min(1).max(7).nullable(),
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
});

export type EvaluationProfileSummary = z.infer<typeof evaluationProfileSummarySchema>;

export const evaluationProfileListResponseSchema = z.object({
  items: z.array(evaluationProfileSummarySchema),
});

export type EvaluationProfileListResponse = z.infer<typeof evaluationProfileListResponseSchema>;

export const evaluationProfileResponseSchema = z.object({ profile: evaluationProfileSchema });

export type EvaluationProfileResponse = z.infer<typeof evaluationProfileResponseSchema>;

export const evaluationProfileNameRequestSchema = z.object({ name: profileName });

export type EvaluationProfileNameRequest = z.infer<typeof evaluationProfileNameRequestSchema>;

export const applyEvaluationProfileRequestSchema = z.object({ profileId: z.uuid() });

export type ApplyEvaluationProfileRequest = z.infer<typeof applyEvaluationProfileRequestSchema>;

export const applyEvaluationProfileResponseSchema = riskEvaluationResponseSchema.extend({
  addedFactorCount: z.int().min(0),
});

export type ApplyEvaluationProfileResponse = z.infer<typeof applyEvaluationProfileResponseSchema>;

/** `reason` values on evaluation profile errors, so the SPA can word them itself. */
export const evaluationProfileErrorReasons = ['evaluation_profile_name_taken'] as const;

export type EvaluationProfileErrorReason = (typeof evaluationProfileErrorReasons)[number];
