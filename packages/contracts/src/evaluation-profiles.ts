import { z } from 'zod';

import { libraryUsageFilters } from './instruction-modules';
import { listQuerySchema, listSearchSchema, pageSchema, repeatedQueryValue } from './list';
import {
  evaluatedJobPositionSchema,
  riskEvaluationKindSchema,
  riskEvaluationResponseSchema,
  riskFactorSchema,
} from './risk-evaluations';

// The organization's risk library (ADR 015). A profile's factors take the same requests as an
// evaluation's, `riskFactorRequestSchema`, and answer with the same factors.

const profileName = z.string().trim().min(2).max(160);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullish();

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
  meansOfProduction: z.string().nullable(),
  workEnvironment: z.string().nullable(),
  // Unlike an evaluation's, null until written: applying leaves the evaluation's as it is.
  exposure: z.string().nullable(),
  factors: z.array(riskFactorSchema),
});

export type EvaluationProfile = z.infer<typeof evaluationProfileSchema>;

export const evaluationProfileSummarySchema = z.object({
  ...evaluationProfileFields,
  factorCount: z.int().min(0),
  unacceptableFactorCount: z.int().min(0),
  // Where active clients use it, as the list's "Folosită la" counts: their sheets holding one of
  // its factors, a post's or one outside the posts, archived posts' left out, and those
  // clients. Possibly 0 while `inUse`.
  sheetCount: z.int().min(0),
  clientCount: z.int().min(0),
});

export type EvaluationProfileSummary = z.infer<typeof evaluationProfileSummarySchema>;

// Column ids of the library table. `globalRiskLevel` puts the entries without factors last in
// either order, and `usage` sorts by `sheetCount`.
export const evaluationProfileSortKeys = ['name', 'globalRiskLevel', 'usage', 'updatedAt'] as const;

export type EvaluationProfileSortKey = (typeof evaluationProfileSortKeys)[number];

export const evaluationProfileListStatuses = ['active', 'archived'] as const;

export type EvaluationProfileListStatus = (typeof evaluationProfileListStatuses)[number];

// Against the acceptable global level, 3.5: `none` is an entry without factors.
export const globalRiskLevelFilters = ['over', 'within', 'none'] as const;

export type GlobalRiskLevelFilter = (typeof globalRiskLevelFilters)[number];

export const evaluationProfileListFiltersSchema = z.object({
  level: repeatedQueryValue(z.enum(globalRiskLevelFilters)).optional(),
  usage: repeatedQueryValue(z.enum(libraryUsageFilters)).optional(),
});

export type EvaluationProfileListFilters = z.infer<typeof evaluationProfileListFiltersSchema>;

export const evaluationProfileListQuerySchema = listQuerySchema(evaluationProfileSortKeys, 'name')
  .extend({
    status: z.enum(evaluationProfileListStatuses).default('active'),
    // Matches the name, ignoring case and diacritics, every term somewhere in it.
    q: listSearchSchema.optional(),
  })
  .extend(evaluationProfileListFiltersSchema.shape);

export type EvaluationProfileListQuery = z.infer<typeof evaluationProfileListQuerySchema>;

/** `unfilteredTotal` counts the tab, active or archived, without the search or filters. */
export const evaluationProfileListResponseSchema = pageSchema(
  evaluationProfileSummarySchema
).extend({ unfilteredTotal: z.int().min(0) });

export type EvaluationProfileListResponse = z.infer<typeof evaluationProfileListResponseSchema>;

export const evaluationProfileChoiceSchema = evaluationProfileSummarySchema.pick({
  id: true,
  name: true,
  globalRiskLevel: true,
  factorCount: true,
  unacceptableFactorCount: true,
});

export type EvaluationProfileChoice = z.infer<typeof evaluationProfileChoiceSchema>;

// Every profile that can be applied, unpaged: a picker that offers a page of the library would
// hide the rest.
export const evaluationProfileChoicesResponseSchema = z.object({
  items: z.array(evaluationProfileChoiceSchema),
});

export type EvaluationProfileChoicesResponse = z.infer<
  typeof evaluationProfileChoicesResponseSchema
>;

export const evaluationProfileResponseSchema = z.object({ profile: evaluationProfileSchema });

export type EvaluationProfileResponse = z.infer<typeof evaluationProfileResponseSchema>;

export const evaluationProfileNameRequestSchema = z.object({ name: profileName });

export type EvaluationProfileNameRequest = z.infer<typeof evaluationProfileNameRequestSchema>;

export const updateEvaluationProfileRequestSchema = z.object({
  name: profileName.optional(),
  // True archives, false restores.
  archived: z.boolean().optional(),
  // Left out, a text stays as it is; null clears it.
  meansOfProduction: optionalText(2000),
  workEnvironment: optionalText(2000),
  exposure: optionalText(120),
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
