import { z } from 'zod';

import { templateVersionKindSchema } from './documents';
import {
  legalActSchema,
  legalAmendmentOperations,
  legalChangeOutcomes,
  legalChangeOutcomeSchema,
  legalChangePassageSchema,
  legalChangeResolutionSchema,
  legalCheckRunSchema,
} from './legislation';
import { defaultPageSize, maxPageSize, pageSchema } from './list';

const timestamp = z.iso.datetime({ offset: true });

export const adminLegalChangeStatusFilters = ['open', 'resolved'] as const;

// `unassessed`: the daily check has not compared the change yet.
export const adminLegalChangeOutcomeFilters = [...legalChangeOutcomes, 'unassessed'] as const;

export const adminLegalChangeListQuerySchema = z.object({
  status: z.enum(adminLegalChangeStatusFilters).optional(),
  outcome: z.enum(adminLegalChangeOutcomeFilters).optional(),
});

export type AdminLegalChangeListQuery = z.infer<typeof adminLegalChangeListQuerySchema>;

export const adminLegalAmendingActSchema = z.object({
  name: z.string(),
  adoptedOn: z.iso.date().nullable(),
  // The amending act's own page on the portal, when its note named it.
  portalId: z.int().positive().nullable(),
});

export type AdminLegalAmendingAct = z.infer<typeof adminLegalAmendingActSchema>;

export const adminLegalChangeListItemSchema = z.object({
  id: z.uuid(),
  act: legalActSchema.pick({ id: true, name: true, portalId: true }),
  seenAt: timestamp,
  consolidatedOn: z.iso.date(),
  comparedWith: z.iso.date().nullable(),
  outcome: legalChangeOutcomeSchema.nullable(),
  assessedAt: timestamp.nullable(),
  // The portal's guess from the act's list of actions, kept from before the outcomes.
  amendingAct: z.string().nullable(),
  amendingActs: z.array(adminLegalAmendingActSchema),
  resolution: legalChangeResolutionSchema,
  resolvedAt: timestamp.nullable(),
  resolvedByNote: z.string().nullable(),
  passageCount: z.int().min(0),
});

export type AdminLegalChangeListItem = z.infer<typeof adminLegalChangeListItemSchema>;

export const adminLegalChangeListSchema = z.object({
  items: z.array(adminLegalChangeListItemSchema),
});

export type AdminLegalChangeList = z.infer<typeof adminLegalChangeListSchema>;

export const adminLegalAmendedUnitSchema = z.object({
  unit: z.string(),
  // The portal's own words, "Alineatul (2), Articolul 36".
  subject: z.string().nullable(),
  operation: z.enum(legalAmendmentOperations),
  date: z.iso.date(),
  amendingAct: z.string().nullable(),
});

export type AdminLegalAmendedUnit = z.infer<typeof adminLegalAmendedUnitSchema>;

export const adminLegalChangePassageSchema = legalChangePassageSchema
  .omit({ document: true })
  .extend({
    manifest: z.string(),
    // Null for a passage stored before the type was, whose template no version can answer.
    typeKey: z.string().nullable(),
    paragraph: z.int().min(0),
    article: z.string().nullable(),
  });

export type AdminLegalChangePassage = z.infer<typeof adminLegalChangePassageSchema>;

export const adminTemplateVersionSchema = z.object({
  id: z.uuid(),
  typeKey: z.string(),
  title: z.string(),
  version: z.int().min(1),
  kind: templateVersionKindSchema,
  note: z.string().nullable(),
  createdAt: timestamp,
});

export type AdminTemplateVersion = z.infer<typeof adminTemplateVersionSchema>;

export const adminLegalChangeDetailSchema = adminLegalChangeListItemSchema
  .omit({ passageCount: true })
  .extend({
    amendedUnits: z.array(adminLegalAmendedUnitSchema),
    // Why a person should read the change, in English.
    review: z.array(z.string()),
    passages: z.array(adminLegalChangePassageSchema),
    resolvingVersion: adminTemplateVersionSchema.nullable(),
    // The versions that can answer an open change: of a template its passages name, registered
    // after it was seen, not layout, with a note, answering no other change. Empty once it is
    // resolved.
    candidateVersions: z.array(adminTemplateVersionSchema),
    // Open, not assessed and after the act's verified form: the daily check will assess it, and
    // it cannot be resolved before.
    awaitingAssessment: z.boolean(),
    // The act's open changes of an earlier form, oldest first, which are resolved before this one.
    olderOpenChanges: z.array(z.object({ id: z.uuid(), consolidatedOn: z.iso.date() })),
  });

export type AdminLegalChangeDetail = z.infer<typeof adminLegalChangeDetailSchema>;

export const minLegalChangeNoteLength = 2;
export const maxLegalChangeNoteLength = 500;

export const adminLegalChangeNoImpactRequestSchema = z.object({
  note: z.string().trim().min(minLegalChangeNoteLength).max(maxLegalChangeNoteLength),
});

export type AdminLegalChangeNoImpactRequest = z.infer<typeof adminLegalChangeNoImpactRequestSchema>;

export const adminLegalChangeLinkRequestSchema = z.object({
  templateVersionId: z.uuid(),
});

export type AdminLegalChangeLinkRequest = z.infer<typeof adminLegalChangeLinkRequestSchema>;

export const adminLegalActSchema = legalActSchema.extend({
  openChanges: z.int().min(0),
});

export type AdminLegalAct = z.infer<typeof adminLegalActSchema>;

export const adminLegalActListSchema = z.object({ items: z.array(adminLegalActSchema) });

export type AdminLegalActList = z.infer<typeof adminLegalActListSchema>;

export const adminVerifiedFormRequestSchema = z.object({
  consolidatedOn: z.iso.date(),
});

export type AdminVerifiedFormRequest = z.infer<typeof adminVerifiedFormRequestSchema>;

export const maxAdminLegalCheckRunPage = 100_000;

export const adminLegalCheckRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(maxAdminLegalCheckRunPage).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
});

export type AdminLegalCheckRunListQuery = z.infer<typeof adminLegalCheckRunListQuerySchema>;

export const adminLegalCheckRunListSchema = pageSchema(legalCheckRunSchema);

export type AdminLegalCheckRunList = z.infer<typeof adminLegalCheckRunListSchema>;

// The `reason` of a refused write, which the admin app words itself.
export const adminLegislationErrorReasons = {
  // 409: someone or the daily check resolved the change first.
  changeNotOpen: 'legal_change_not_open',
  // 422: the version is not one of the change's candidates.
  versionCannotAnswer: 'template_version_cannot_answer',
  // 422: the date is after the newest form seen on the portal, or the act has none.
  formNotSeen: 'form_not_seen',
  // 422: a change of the act at or before the date is still open; it is resolved first.
  openChangesAtOrBefore: 'open_changes_at_or_before',
  // 422: the daily check has yet to assess the change.
  changeNotAssessed: 'change_not_assessed',
  // 422: a change of the act of an earlier form is still open; it is resolved first.
  olderChangeOpen: 'older_change_open',
} as const;
