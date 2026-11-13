import { z } from 'zod';

// The same for every organization, and read only: a scheduled job writes them (ADR 017).

export const legalActStatuses = ['in_force', 'repealed'] as const;

export const legalActStatusSchema = z.enum(legalActStatuses);

export type LegalActStatus = z.infer<typeof legalActStatusSchema>;

export const legalActSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Null until the act's page on legislatie.just.ro has been found.
  portalId: z.int().positive().nullable(),
  // Null until the act has been read on the portal.
  portalStatus: legalActStatusSchema.nullable(),
  verifiedConsolidatedOn: z.iso.date().nullable(),
  lastConsolidatedOn: z.iso.date().nullable(),
  lastAmendingAct: z.string().nullable(),
  lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  checkedByHandOn: z.iso.date().nullable(),
});

export type LegalAct = z.infer<typeof legalActSchema>;

export const legalActListResponseSchema = z.object({ items: z.array(legalActSchema) });

export type LegalActListResponse = z.infer<typeof legalActListResponseSchema>;

export const legalChangeResolutions = ['open', 'no_impact', 'template_version'] as const;

export const legalChangeResolutionSchema = z.enum(legalChangeResolutions);

export type LegalChangeResolution = z.infer<typeof legalChangeResolutionSchema>;

export const legalChangeOutcomes = ['no_impact', 'quote_differs', 'needs_review'] as const;

export const legalChangeOutcomeSchema = z.enum(legalChangeOutcomes);

export type LegalChangeOutcome = z.infer<typeof legalChangeOutcomeSchema>;

export const legalAmendingActSchema = z.object({
  name: z.string(),
  // When it was adopted; null when the portal's note gives no date.
  adoptedOn: z.iso.date().nullable(),
});

export type LegalAmendingAct = z.infer<typeof legalAmendingActSchema>;

export const legalAmendmentOperations = [
  'modified',
  'supplemented',
  'inserted',
  'repealed',
  'other',
] as const;

export const legalAmendedUnitSchema = z.object({
  // "Art. 36 alin. (2)"; "^" marks a superscript, "Art. 109^2".
  unit: z.string(),
  operation: z.enum(legalAmendmentOperations),
  // When the amendment took effect.
  date: z.iso.date(),
  amendingAct: z.string().nullable(),
});

export type LegalAmendedUnit = z.infer<typeof legalAmendedUnitSchema>;

// `uncompared`: found in both forms but not compared, with no words to read in one of them (a
// table kept as a picture) or too long; both texts are given.
export const legalChangePassageStatuses = [
  'changed',
  'added',
  'repealed',
  'missing',
  'uncompared',
] as const;

export const legalChangePassageSchema = z.object({
  id: z.uuid(),
  templateFile: z.string(),
  // The document type the template makes; null for a file no template manifest lists.
  document: z.object({ typeKey: z.string(), title: z.string() }).nullable(),
  citationForm: z.enum(['quote', 'reference']),
  // How the template names the passage, "Art. 36 alin. (1) – (3)"; null for a reference.
  locator: z.string().nullable(),
  unit: z.string(),
  status: z.enum(legalChangePassageStatuses),
  // The law's text of the unit in the verified form and in the new one; null where the unit is
  // absent from that form.
  oldText: z.string().nullable(),
  newText: z.string().nullable(),
  hunks: z.array(
    z.object({ old: z.string(), new: z.string(), before: z.string(), after: z.string() })
  ),
});

export type LegalChangePassage = z.infer<typeof legalChangePassageSchema>;

export const legalChangeSchema = z.object({
  id: z.uuid(),
  act: legalActSchema.pick({ id: true, name: true, portalId: true }),
  seenAt: z.iso.datetime({ offset: true }),
  consolidatedOn: z.iso.date(),
  amendingAct: z.string().nullable(),
  resolution: legalChangeResolutionSchema,
  resolvedAt: z.iso.datetime({ offset: true }).nullable(),
  resolvedByNote: z.string().nullable(),
  // Null until the daily check has compared the new form with the verified one.
  outcome: legalChangeOutcomeSchema.nullable(),
  // The consolidated form the new one was compared with; null for the act as published, and
  // before the change is assessed.
  comparedWith: z.iso.date().nullable(),
  assessedAt: z.iso.datetime({ offset: true }).nullable(),
  amendingActs: z.array(legalAmendingActSchema),
  amendedUnits: z.array(legalAmendedUnitSchema),
  passages: z.array(legalChangePassageSchema),
  // The documents whose new template version answers the change; empty while none does.
  updatedDocuments: z.array(z.object({ typeKey: z.string(), title: z.string() })),
});

export type LegalChange = z.infer<typeof legalChangeSchema>;

export const legalChangeListResponseSchema = z.object({ items: z.array(legalChangeSchema) });

export type LegalChangeListResponse = z.infer<typeof legalChangeListResponseSchema>;

export const legalCheckRunStatuses = ['running', 'succeeded', 'failed'] as const;

export const legalCheckRunStatusSchema = z.enum(legalCheckRunStatuses);

export type LegalCheckRunStatus = z.infer<typeof legalCheckRunStatusSchema>;

export const legalCheckRunErrorKinds = ['http_status', 'fetch', 'parse', 'other'] as const;

export const legalCheckRunErrorKindSchema = z.enum(legalCheckRunErrorKinds);

export type LegalCheckRunErrorKind = z.infer<typeof legalCheckRunErrorKindSchema>;

export const legalCheckRunErrorSchema = z.object({
  // Null when the run itself failed, not one act's page.
  act: z.string().nullable(),
  // 'http_status': the portal answered with `status`; 'fetch': it gave no answer at all.
  kind: legalCheckRunErrorKindSchema,
  status: z.int().optional(),
  // The technical text, in English, for the logs; the page words the failure from the kind.
  message: z.string(),
});

export type LegalCheckRunError = z.infer<typeof legalCheckRunErrorSchema>;

export const legalCheckRunSchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  // Null while the run goes on, and for good when it was cut off.
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  status: legalCheckRunStatusSchema,
  actsChecked: z.int().nonnegative(),
  changesFound: z.int().nonnegative(),
  actsSkipped: z.int().nonnegative(),
  errors: z.array(legalCheckRunErrorSchema).nullable(),
});

export type LegalCheckRun = z.infer<typeof legalCheckRunSchema>;

export const latestLegalCheckRunResponseSchema = z.object({ run: legalCheckRunSchema.nullable() });

export type LatestLegalCheckRunResponse = z.infer<typeof latestLegalCheckRunResponseSchema>;
