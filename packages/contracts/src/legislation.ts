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

export const legalChangeSchema = z.object({
  id: z.uuid(),
  act: legalActSchema.pick({ id: true, name: true, portalId: true }),
  seenAt: z.iso.datetime({ offset: true }),
  consolidatedOn: z.iso.date(),
  amendingAct: z.string().nullable(),
  resolution: legalChangeResolutionSchema,
  resolvedAt: z.iso.datetime({ offset: true }).nullable(),
  resolvedByNote: z.string().nullable(),
});

export type LegalChange = z.infer<typeof legalChangeSchema>;

export const legalChangeListResponseSchema = z.object({ items: z.array(legalChangeSchema) });

export type LegalChangeListResponse = z.infer<typeof legalChangeListResponseSchema>;
