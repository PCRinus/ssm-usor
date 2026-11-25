import { z } from 'zod';

import { ssmDutyRoles } from './documents';

/**
 * A current employee's acknowledgement of their SSM duties (ADR 046), against the latest issued
 * revision of document 13; a draft of 13 does not count.
 *
 * - `not_issued`: the client has no issued revision of document 13.
 * - `no_annex`: that revision has no annex for the employee's post, which was archived or created
 *   after it was issued.
 * - `to_sign`: nothing is recorded as signed.
 * - `signed`: the newest record was signed on the post's annex and the roles the employee holds
 *   in that revision, as they stand.
 * - `sign_again`: the newest record was signed on another annex text or another set of roles.
 */
export const dutiesAcknowledgementStatuses = [
  'not_issued',
  'no_annex',
  'to_sign',
  'signed',
  'sign_again',
] as const;
export const dutiesAcknowledgementStatusSchema = z.enum(dutiesAcknowledgementStatuses);
export type DutiesAcknowledgementStatus = z.infer<typeof dutiesAcknowledgementStatusSchema>;

/** The workers list filters on these; `not_issued` shows nothing there. */
export const dutiesAcknowledgementFilters = [
  'signed',
  'to_sign',
  'sign_again',
  'no_annex',
] as const;
export const dutiesAcknowledgementFilterSchema = z.enum(dutiesAcknowledgementFilters);
export type DutiesAcknowledgementFilter = z.infer<typeof dutiesAcknowledgementFilterSchema>;

export const dutiesAcknowledgementChangeReasons = ['annex_changed', 'roles_changed'] as const;
export const dutiesAcknowledgementChangeReasonSchema = z.enum(dutiesAcknowledgementChangeReasons);
export type DutiesAcknowledgementChangeReason = z.infer<
  typeof dutiesAcknowledgementChangeReasonSchema
>;

/** The signing agreement's values; `signed_electronically` comes with signing in the portal. */
export const dutiesAcknowledgementStates = ['signed_on_paper'] as const;
export const dutiesAcknowledgementStateSchema = z.enum(dutiesAcknowledgementStates);
export type DutiesAcknowledgementState = z.infer<typeof dutiesAcknowledgementStateSchema>;

export const dutiesAcknowledgementErrorReasons = {
  notIssued: 'duties_not_issued',
  noAnnex: 'duties_no_annex',
  revisionNotCurrent: 'duties_revision_not_current',
  documentNotEditable: 'document_not_editable',
} as const;

/** The annex of a revision of document 13 a sheet prints, with the roles it adds. */
export const dutiesAnnexSchema = z.object({
  documentId: z.uuid(),
  revisionId: z.uuid(),
  // The date the revision carries, which the sheet prints: "emis la …".
  issueDate: z.iso.date(),
  number: z.int().min(1),
  position: z.object({ id: z.uuid(), name: z.string() }),
  roles: z.array(z.enum(ssmDutyRoles)),
});

export type DutiesAnnex = z.infer<typeof dutiesAnnexSchema>;

export const dutiesAcknowledgementRecordSchema = z.object({
  id: z.uuid(),
  state: dutiesAcknowledgementStateSchema,
  // Noon in Romania of the day it was signed.
  signedAt: z.iso.datetime({ offset: true }),
  signedOn: z.iso.date(),
  // The scan of the paper sheet, a file of the client.
  clientFileId: z.uuid().nullable(),
  // What was signed; the revision may since be superseded.
  annex: dutiesAnnexSchema,
  recordedAt: z.iso.datetime({ offset: true }),
  recordedBy: z.object({ id: z.uuid(), fullName: z.string().nullable() }).nullable(),
});

export type DutiesAcknowledgementRecord = z.infer<typeof dutiesAcknowledgementRecordSchema>;

export const dutiesAcknowledgementResponseSchema = z.object({
  status: dutiesAcknowledgementStatusSchema,
  // Only for `sign_again`, one or both.
  reasons: z.array(dutiesAcknowledgementChangeReasonSchema),
  // The latest issued revision of document 13; null for `not_issued`.
  revision: z
    .object({ documentId: z.uuid(), revisionId: z.uuid(), issueDate: z.iso.date() })
    .nullable(),
  // The sheet to sign now; null for `not_issued` and `no_annex`.
  annex: dutiesAnnexSchema.nullable(),
  // The newest record, which the status is read from.
  current: dutiesAcknowledgementRecordSchema.nullable(),
  // The earlier records, newest first.
  history: z.array(dutiesAcknowledgementRecordSchema),
});

export type DutiesAcknowledgementResponse = z.infer<typeof dutiesAcknowledgementResponseSchema>;

export const recordDutiesAcknowledgementRequestSchema = z.object({
  // The revision whose sheet came back signed; refused once a newer one is issued.
  revisionId: z.uuid(),
  signedOn: z.iso.date(),
  clientFileId: z.uuid().nullish(),
});

export type RecordDutiesAcknowledgementRequest = z.infer<
  typeof recordDutiesAcknowledgementRequestSchema
>;
