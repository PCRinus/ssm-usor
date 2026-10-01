import { z } from 'zod';

// A request never carries a risk level: `./risk-levels` reads it from the classes (ADR 015).

export const riskEvaluationKinds = ['job_position', 'sensitive_groups', 'other'] as const;

export const riskEvaluationKindSchema = z.enum(riskEvaluationKinds);

export type RiskEvaluationKind = z.infer<typeof riskEvaluationKindSchema>;

export const workSystemComponents = [
  'executant',
  'work_task',
  'means_of_production',
  'work_environment',
] as const;

export const workSystemComponentSchema = z.enum(workSystemComponents);

export type WorkSystemComponent = z.infer<typeof workSystemComponentSchema>;

export const preventionMeasureKinds = [
  'technical',
  'organizational',
  'hygienic_sanitary',
  'other',
] as const;

export const preventionMeasureKindSchema = z.enum(preventionMeasureKinds);

export type PreventionMeasureKind = z.infer<typeof preventionMeasureKindSchema>;

export const defaultExposure = '8 h / schimb';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullish();
const evaluationName = z.string().trim().min(2).max(160);
const gravityClass = z.int().min(1).max(7);
const probabilityClass = z.int().min(1).max(6);
const riskLevel = z.int().min(1).max(7);

const workSystem = {
  meansOfProduction: optionalText(2000),
  workEnvironment: optionalText(2000),
  exposure: text(120).default(defaultExposure),
  workTask: optionalText(2000),
  exposedPersons: optionalText(120),
};

/** The fields a position evaluation reads from its position: its activities and its current employees. */
export const clientLevelEvaluationFields = ['workTask', 'exposedPersons'] as const;

export const createRiskEvaluationRequestSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('job_position'), jobPositionId: z.uuid(), ...workSystem }),
    z.object({ kind: z.literal('sensitive_groups'), ...workSystem }),
    z.object({ kind: z.literal('other'), name: evaluationName, ...workSystem }),
  ])
  .superRefine((body, context) => {
    if (body.kind !== 'job_position') return;
    for (const field of clientLevelEvaluationFields) {
      if (body[field] != null) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'A position evaluation reads this from its position.',
        });
      }
    }
  });

export type CreateRiskEvaluationRequest = z.infer<typeof createRiskEvaluationRequestSchema>;

// Left out, a field stays as it is; null clears it. Only an evaluation of kind `other` has a
// name to change, and only one that is not of a position a work task or exposed persons.
export const updateRiskEvaluationRequestSchema = z.object({
  name: evaluationName.optional(),
  meansOfProduction: optionalText(2000),
  workEnvironment: optionalText(2000),
  exposure: text(120).optional(),
  workTask: optionalText(2000),
  exposedPersons: optionalText(120),
});

export type UpdateRiskEvaluationRequest = z.infer<typeof updateRiskEvaluationRequestSchema>;

export const preventionMeasureRequestSchema = z.object({
  kind: preventionMeasureKindSchema,
  description: text(2000),
});

export type PreventionMeasureRequest = z.infer<typeof preventionMeasureRequestSchema>;

// Saving a factor replaces its measures with `measures`, in the order sent.
export const riskFactorRequestSchema = z.object({
  component: workSystemComponentSchema,
  group: text(200),
  description: text(1000),
  gravityClass,
  probabilityClass,
  measures: z.array(preventionMeasureRequestSchema).max(30).default([]),
  actions: optionalText(2000),
  deadline: optionalText(200),
  responsiblePerson: optionalText(200),
  observations: optionalText(1000),
});

export type RiskFactorRequest = z.infer<typeof riskFactorRequestSchema>;

export const preventionMeasureSchema = z.object({
  id: z.uuid(),
  kind: preventionMeasureKindSchema,
  description: z.string(),
});

export type PreventionMeasure = z.infer<typeof preventionMeasureSchema>;

export const riskFactorSchema = z.object({
  id: z.uuid(),
  component: workSystemComponentSchema,
  group: z.string(),
  description: z.string(),
  gravityClass,
  probabilityClass,
  riskLevel,
  measures: z.array(preventionMeasureSchema),
  actions: z.string().nullable(),
  deadline: z.string().nullable(),
  responsiblePerson: z.string().nullable(),
  observations: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type RiskFactor = z.infer<typeof riskFactorSchema>;

const evaluatedJobPositionSchema = z.object({ id: z.uuid(), name: z.string() });

const riskEvaluationFields = {
  id: z.uuid(),
  clientId: z.uuid(),
  kind: riskEvaluationKindSchema,
  // Set for kind `job_position` only.
  jobPosition: evaluatedJobPositionSchema.nullable(),
  // Set for kind `other` only.
  name: z.string().nullable(),
  // Null while the evaluation has no factors.
  globalRiskLevel: z.number().min(1).max(7).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};

export const riskEvaluationSchema = z.object({
  ...riskEvaluationFields,
  meansOfProduction: z.string().nullable(),
  workEnvironment: z.string().nullable(),
  exposure: z.string(),
  // Null for kind `job_position`, which reads them from the position.
  workTask: z.string().nullable(),
  exposedPersons: z.string().nullable(),
  factors: z.array(riskFactorSchema),
});

export type RiskEvaluation = z.infer<typeof riskEvaluationSchema>;

export const riskEvaluationSummarySchema = z.object({
  ...riskEvaluationFields,
  factorCount: z.int().min(0),
  unacceptableFactorCount: z.int().min(0),
});

export type RiskEvaluationSummary = z.infer<typeof riskEvaluationSummarySchema>;

export const riskEvaluationListResponseSchema = z.object({
  items: z.array(riskEvaluationSummarySchema),
});

export type RiskEvaluationListResponse = z.infer<typeof riskEvaluationListResponseSchema>;

export const riskEvaluationResponseSchema = z.object({ evaluation: riskEvaluationSchema });

export type RiskEvaluationResponse = z.infer<typeof riskEvaluationResponseSchema>;

// Null while the position has not been evaluated.
export const jobPositionRiskEvaluationResponseSchema = z.object({
  evaluation: riskEvaluationSchema.nullable(),
});

export type JobPositionRiskEvaluationResponse = z.infer<
  typeof jobPositionRiskEvaluationResponseSchema
>;

// Every factor of the evaluation, each once, in the new order.
export const riskFactorOrderRequestSchema = z.object({
  factorIds: z.array(z.uuid()).max(500),
});

export type RiskFactorOrderRequest = z.infer<typeof riskFactorOrderRequestSchema>;

export const copyRiskFactorsRequestSchema = z.object({ fromEvaluationId: z.uuid() });

export type CopyRiskFactorsRequest = z.infer<typeof copyRiskFactorsRequestSchema>;

export const riskFactorSuggestionFields = [
  'group',
  'actions',
  'deadline',
  'responsiblePerson',
  'observations',
] as const;

export type RiskFactorSuggestionField = (typeof riskFactorSuggestionFields)[number];

export const riskFactorSuggestionsQuerySchema = z.object({
  field: z.enum(riskFactorSuggestionFields),
  query: z.string().trim().max(240).default(''),
});

export type RiskFactorSuggestionsQuery = z.infer<typeof riskFactorSuggestionsQuerySchema>;

export const riskFactorSuggestionsResponseSchema = z.object({ items: z.array(z.string()) });

export type RiskFactorSuggestionsResponse = z.infer<typeof riskFactorSuggestionsResponseSchema>;

/** `reason` values on risk evaluation errors, so the SPA can word them itself. */
export const riskEvaluationErrorReasons = [
  'risk_evaluation_exists',
  'risk_evaluation_name_taken',
  'client_archived',
] as const;

export type RiskEvaluationErrorReason = (typeof riskEvaluationErrorReasons)[number];
