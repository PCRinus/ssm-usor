import { z } from 'zod';

// A client's generated documentation (ADR 005).

/**
 * The built-in documents that can be generated, in the order of the provider's pack. Mirrors
 * the manifest of `packages/document-engine/templates`, without the templates whose content
 * is still pending.
 */
export const documentTypeKeys = [
  'cover_decisions',
  'decision_training',
  'decision_risk_evaluation_team',
  'decision_first_aid',
  'decision_imminent_danger',
  'cover_general_training_material',
  'general_training_material',
  'cover_own_instructions',
  'cover_training_themes',
  'cover_tests',
  'test_hiring',
  'test_periodic',
  'cover_event_registers',
  'event_registers',
  'control_report',
  'cover_employer_briefing',
  'employer_briefing',
  'control_regulation',
] as const;

export const documentTypeKeySchema = z.enum(documentTypeKeys);

export type DocumentTypeKey = z.infer<typeof documentTypeKeySchema>;

/** The decisions, in the order they are numbered from the first decision number. */
export const decisionTypeKeys = [
  'decision_training',
  'decision_risk_evaluation_team',
  'decision_first_aid',
  'decision_imminent_danger',
] as const satisfies readonly DocumentTypeKey[];

/**
 * What a client's documentation cannot be generated without, by where it is filled in: the
 * organization's legal details, the specialist's profile, the client's document details, and
 * the client's responsible persons, one entry per role nobody holds.
 */
export const missingDocumentData = [
  'provider.legalName',
  'provider.representativeName',
  'provider.representativeRole',
  'specialist.name',
  'specialist.professionalTitle',
  'client.representativeName',
  'client.representativeRole',
  'client.trainingSchedule',
  'responsible.workplace_manager',
  'responsible.first_aid',
  'responsible.risk_evaluation_team',
  'responsible.imminent_danger',
] as const;

export const missingDocumentDataSchema = z.enum(missingDocumentData);

export type MissingDocumentData = z.infer<typeof missingDocumentDataSchema>;

/** Whether a client's documentation can be generated, and what is in the way. */
export const documentReadinessResponseSchema = z.object({
  ready: z.boolean(),
  missing: z.array(missingDocumentDataSchema),
});

export type DocumentReadinessResponse = z.infer<typeof documentReadinessResponseSchema>;
