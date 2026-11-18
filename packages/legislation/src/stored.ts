import { z } from 'zod';

export const amendmentOperations = [
  'modified',
  'supplemented',
  'inserted',
  'repealed',
  'other',
] as const;

export const failureKinds = ['http_status', 'fetch', 'parse', 'other'] as const;

// A list keeps the elements it can read and drops the rest, so one element a later or earlier
// writer shaped differently does not empty the page.
export const storedList = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((each) => {
        const parsed = item.safeParse(each);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      })
    );

// A detail the reader cannot read is left out, and the act or unit still shows by its name.
export const storedAmendingActSchema = z.object({
  name: z.string(),
  date: z.iso.date().nullable().catch(null),
  portalId: z.int().positive().nullable().catch(null),
});

export const storedAmendedUnitSchema = z.object({
  unit: z.string(),
  subject: z.string().nullable().catch(null),
  operation: z.enum(amendmentOperations),
  date: z.iso.date(),
  amendingAct: z.string().nullable(),
});

export const storedHunkSchema = z.object({
  old: z.string(),
  new: z.string(),
  before: z.string(),
  after: z.string(),
});

export const storedReviewReasonSchema = z.string();

export const storedRunErrorSchema = z.object({
  act: z.string().nullable(),
  // Errors recorded before the runs kept a kind carry only the act and the message.
  kind: z.enum(failureKinds).catch('other'),
  status: z.int().optional(),
  message: z.string(),
});

export const storedAmendingActsSchema = storedList(storedAmendingActSchema);
export const storedAmendedUnitsSchema = storedList(storedAmendedUnitSchema);
export const storedHunksSchema = storedList(storedHunkSchema);
export const storedReviewSchema = storedList(storedReviewReasonSchema);
export const storedRunErrorsSchema = storedList(storedRunErrorSchema);

export type StoredAmendingAct = z.input<typeof storedAmendingActSchema>;
export type StoredAmendedUnit = z.input<typeof storedAmendedUnitSchema>;
export type StoredHunk = z.input<typeof storedHunkSchema>;
export type StoredRunError = z.input<typeof storedRunErrorSchema>;
