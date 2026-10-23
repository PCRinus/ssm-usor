import { z } from 'zod';

/** A release's tag: its day in Bucharest, with `.2`, `.3`, … for later releases that day (ADR 025). */
export const releaseTagSchema = z.string().regex(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/);

export const updateFeatureSchema = z.object({
  title: z.string().min(1).max(160),
  text: z.string().min(1).max(600),
  where: z.string().max(200).nullable(),
  // A lucide icon name.
  icon: z
    .string()
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .nullable(),
});

export type UpdateFeature = z.infer<typeof updateFeatureSchema>;

export const releaseSchema = z.object({
  tag: releaseTagSchema,
  publishedAt: z.iso.datetime({ offset: true }),
  headline: z.string().min(1).max(160),
  lead: z.string().max(600).nullable(),
  features: z.array(updateFeatureSchema),
  improvements: z.array(z.string()),
  fixes: z.array(z.string()),
  unread: z.boolean(),
});

export type Release = z.infer<typeof releaseSchema>;

export const releaseListResponseSchema = z.object({ items: z.array(releaseSchema) });

export type ReleaseListResponse = z.infer<typeof releaseListResponseSchema>;

// Acknowledges every release published up to and including this one.
export const acknowledgeReleasesRequestSchema = z.object({ tag: releaseTagSchema });

export type AcknowledgeReleasesRequest = z.infer<typeof acknowledgeReleasesRequestSchema>;

export const acknowledgeReleasesResponseSchema = z.object({
  acknowledgedThrough: releaseTagSchema.nullable(),
});

export type AcknowledgeReleasesResponse = z.infer<typeof acknowledgeReleasesResponseSchema>;

/** `reason` values on release errors, so the SPA can word them itself. */
export const releaseErrorReasons = ['profile_missing'] as const;

export type ReleaseErrorReason = (typeof releaseErrorReasons)[number];
