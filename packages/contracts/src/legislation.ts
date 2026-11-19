import { z } from 'zod';

import { documentSetSchema } from './documents';
import { maxPageSize, pageSchema } from './list';

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

export const legalChangeResolutions = ['open', 'no_impact', 'template_version'] as const;

export const legalChangeResolutionSchema = z.enum(legalChangeResolutions);

export type LegalChangeResolution = z.infer<typeof legalChangeResolutionSchema>;

export const legalChangeOutcomes = ['no_impact', 'quote_differs', 'needs_review'] as const;

export const legalChangeOutcomeSchema = z.enum(legalChangeOutcomes);

export type LegalChangeOutcome = z.infer<typeof legalChangeOutcomeSchema>;

export const legalActDomains = ['ssm', 'su'] as const;

export const legalActDomainSchema = z.enum(legalActDomains);

export type LegalActDomain = z.infer<typeof legalActDomainSchema>;

export const watchedLegalActSchema = legalActSchema.extend({
  // The act's official title without its kind, number and date, "privind apărarea împotriva
  // incendiilor"; null for an act missing from the act list bundled with the API.
  subject: z.string().nullable(),
  // The domains of the documents that cite it; the service contract covers both and counts for
  // neither.
  domains: z.array(legalActDomainSchema),
  // Document types, and the passages they quote word for word; an act only referred to has no
  // quotes.
  citedIn: z.object({ documents: z.int().nonnegative(), quotes: z.int().nonnegative() }),
  openChange: z.object({ id: z.uuid(), outcome: legalChangeOutcomeSchema.nullable() }).nullable(),
});

export type WatchedLegalAct = z.infer<typeof watchedLegalActSchema>;

export const legalActListResponseSchema = z.object({ items: z.array(watchedLegalActSchema) });

export type LegalActListResponse = z.infer<typeof legalActListResponseSchema>;

export const legalAmendingActSchema = z.object({
  name: z.string(),
  // When it was adopted; null when the portal's note gives no date.
  adoptedOn: z.iso.date().nullable(),
  // Its page on legislatie.just.ro; null when the note does not link it.
  portalId: z.int().positive().nullable(),
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

export const legalChangeActSchema = legalActSchema
  .pick({ id: true, name: true, portalId: true })
  .extend({ subject: watchedLegalActSchema.shape.subject });

export type LegalChangeAct = z.infer<typeof legalChangeActSchema>;

export const legalChangeDocumentSchema = z.object({
  typeKey: z.string(),
  title: z.string(),
  set: documentSetSchema,
});

export type LegalChangeDocument = z.infer<typeof legalChangeDocumentSchema>;

export const legalChangeUpdatedDocumentSchema = legalChangeDocumentSchema.extend({
  // The earliest template version that answers the change, and when it was registered.
  version: z.int().positive(),
  note: z.string().nullable(),
  registeredAt: z.iso.datetime({ offset: true }),
});

export type LegalChangeUpdatedDocument = z.infer<typeof legalChangeUpdatedDocumentSchema>;

// The organization's documents still made from a template version older than the one that answers
// the change, a draft edited by hand included; regenerating their types brings the change in.
export const legalChangeBehindSchema = z.object({
  documents: z.int().nonnegative(),
  clients: z.int().nonnegative(),
  types: z.array(
    legalChangeDocumentSchema.extend({
      documents: z.int().positive(),
      clients: z.int().positive(),
    })
  ),
});

export type LegalChangeBehind = z.infer<typeof legalChangeBehindSchema>;

export const openLegalChangeSchema = z.object({
  id: z.uuid(),
  act: legalChangeActSchema,
  consolidatedOn: z.iso.date(),
  seenAt: z.iso.datetime({ offset: true }),
  outcome: legalChangeOutcomeSchema.nullable(),
  // The documents and units of the passages the change touched; empty until it is assessed.
  touched: z.object({
    documents: z.array(legalChangeDocumentSchema),
    units: z.array(z.string()),
  }),
  // Every document type the templates have citing the act, what an unassessed change may touch.
  citedBy: z.array(legalChangeDocumentSchema),
});

export type OpenLegalChange = z.infer<typeof openLegalChangeSchema>;

export const openLegalChangeListResponseSchema = z.object({
  items: z.array(openLegalChangeSchema),
});

export type OpenLegalChangeListResponse = z.infer<typeof openLegalChangeListResponseSchema>;

export const appliedLegalChangePageSize = 20;

export const maxAppliedLegalChangePage = 100_000;

export const appliedLegalChangeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(maxAppliedLegalChangePage).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(appliedLegalChangePageSize),
});

export type AppliedLegalChangeListQuery = z.infer<typeof appliedLegalChangeListQuerySchema>;

export const appliedLegalChangeSchema = z.object({
  id: z.uuid(),
  act: legalChangeActSchema,
  consolidatedOn: z.iso.date(),
  seenAt: z.iso.datetime({ offset: true }),
  appliedAt: z.iso.datetime({ offset: true }),
  // The note of the template version that answered the change first.
  note: z.string().nullable(),
  updatedDocuments: z.array(legalChangeUpdatedDocumentSchema),
  behind: legalChangeBehindSchema,
});

export type AppliedLegalChange = z.infer<typeof appliedLegalChangeSchema>;

export const appliedLegalChangeListResponseSchema = pageSchema(appliedLegalChangeSchema);

export type AppliedLegalChangeListResponse = z.infer<typeof appliedLegalChangeListResponseSchema>;

export const legalChangeDetailSchema = legalChangeSchema.omit({ updatedDocuments: true }).extend({
  act: legalChangeActSchema,
  updatedDocuments: z.array(legalChangeUpdatedDocumentSchema),
  citedBy: z.array(legalChangeDocumentSchema),
  behind: legalChangeBehindSchema,
});

export type LegalChangeDetail = z.infer<typeof legalChangeDetailSchema>;

export const legalChangeDetailResponseSchema = z.object({ change: legalChangeDetailSchema });

export type LegalChangeDetailResponse = z.infer<typeof legalChangeDetailResponseSchema>;

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
