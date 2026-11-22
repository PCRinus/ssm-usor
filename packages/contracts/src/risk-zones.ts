import { z } from 'zod';

import {
  preventionMeasureSchema,
  riskEvaluationKindSchema,
  workSystemComponentSchema,
} from './risk-evaluations';

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullish();

export const riskZoneNameMaxLength = 160;

export const riskZoneRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(riskZoneNameMaxLength),
    workplaceId: z.uuid().nullish(),
    location: optionalText(300),
    measures: optionalText(2000),
    factorIds: z.array(z.uuid()).max(300).default([]),
  })
  .superRefine((body, context) => {
    if (body.factorIds.length === 0 && !body.measures) {
      context.addIssue({
        code: 'custom',
        path: ['measures'],
        message: 'Link a risk factor or write the zone’s own measures.',
      });
    }
  });

export type RiskZoneRequest = z.infer<typeof riskZoneRequestSchema>;

/** `listed` is set by the database while the client has a zone, and never sent. */
export const riskZonesStates = ['undecided', 'none', 'listed'] as const;

export const riskZonesStateSchema = z.enum(riskZonesStates);

export type RiskZonesState = z.infer<typeof riskZonesStateSchema>;

export const updateRiskZonesStateRequestSchema = z.object({
  state: z.enum(['undecided', 'none']),
});

export type UpdateRiskZonesStateRequest = z.infer<typeof updateRiskZonesStateRequestSchema>;

export const riskZoneEvaluationSchema = z.object({
  id: z.uuid(),
  kind: riskEvaluationKindSchema,
  /** The position's name, the evaluation's own name, or the sensitive groups' title. */
  title: z.string(),
});

export type RiskZoneEvaluation = z.infer<typeof riskZoneEvaluationSchema>;

export const riskZoneFactorSchema = z.object({
  id: z.uuid(),
  component: workSystemComponentSchema,
  group: z.string(),
  description: z.string(),
  riskLevel: z.int().min(1).max(7),
  evaluation: riskZoneEvaluationSchema,
  /** By kind, in the order of `preventionMeasureKinds`, then in the factor's own order. */
  measures: z.array(preventionMeasureSchema),
});

export type RiskZoneFactor = z.infer<typeof riskZoneFactorSchema>;

export const riskZoneWorkplaceSchema = z.object({ id: z.uuid(), name: z.string() });

export const riskZoneSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  name: z.string(),
  // May be archived since the zone named it.
  workplace: riskZoneWorkplaceSchema.nullable(),
  location: z.string().nullable(),
  measures: z.string().nullable(),
  /** The highest level first. Empty for a zone whose factors were all deleted since. */
  factors: z.array(riskZoneFactorSchema),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type RiskZone = z.infer<typeof riskZoneSchema>;

export const riskZoneSuggestionSchema = z.object({
  name: z.string(),
  factors: z.array(riskZoneFactorSchema).min(1),
  // A zone of this client by the same name, which the factors could join instead: two zones of
  // a client never share a name.
  existingZoneId: z.uuid().nullable(),
});

export type RiskZoneSuggestion = z.infer<typeof riskZoneSuggestionSchema>;

export const riskZonesResponseSchema = z.object({
  state: riskZonesStateSchema,
  zones: z.array(riskZoneSchema),
  suggestions: z.array(riskZoneSuggestionSchema),
  /** Every factor a zone may link: those of current posts and client-level evaluations, any level. */
  factors: z.array(riskZoneFactorSchema),
});

export type RiskZonesResponse = z.infer<typeof riskZonesResponseSchema>;

export const riskZoneNamesQuerySchema = z.object({ exceptClientId: z.uuid().optional() });

export type RiskZoneNamesQuery = z.infer<typeof riskZoneNamesQuerySchema>;

export const riskZoneNameSchema = z.object({ name: z.string(), measures: z.string().nullable() });

export type RiskZoneName = z.infer<typeof riskZoneNameSchema>;

export const riskZoneNamesResponseSchema = z.object({ items: z.array(riskZoneNameSchema) });

export type RiskZoneNamesResponse = z.infer<typeof riskZoneNamesResponseSchema>;

/** `reason` values on risk zone errors, so the SPA can word them itself. */
export const riskZoneErrorReasons = ['risk_zone_name_taken', 'risk_zones_listed'] as const;

export type RiskZoneErrorReason = (typeof riskZoneErrorReasons)[number];
