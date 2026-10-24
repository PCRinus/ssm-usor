import { z } from 'zod';

export const guideIdSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// A skip counts as seen, so the guide does not show by itself again, but is not a completion.
export const guideStatusSchema = z.enum(['completed', 'skipped']);

export type GuideStatus = z.infer<typeof guideStatusSchema>;

export const guideStateSchema = z.object({
  guide: guideIdSchema,
  version: z.int().min(1),
  status: guideStatusSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});

export type GuideState = z.infer<typeof guideStateSchema>;

export const guideStateListResponseSchema = z.object({ items: z.array(guideStateSchema) });

export type GuideStateListResponse = z.infer<typeof guideStateListResponseSchema>;

export const recordGuideRequestSchema = z.object({
  version: z.int().min(1).max(10_000),
  status: guideStatusSchema,
});

export type RecordGuideRequest = z.infer<typeof recordGuideRequestSchema>;
