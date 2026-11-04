import { z } from 'zod';

import {
  importKinds,
  importLibraryPartSchema,
  importLibraryPartStatuses,
  importStatuses,
} from './imports';
import { defaultPageSize, maxPageSize, pageSchema } from './list';

const timestamp = z.iso.datetime({ offset: true });

export const adminImportStatusFilters = [...importStatuses, 'row_deleted'] as const;

export const adminImportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  kind: z.enum(importKinds).optional(),
  // `row_deleted`: the imports known only by their copies, whose row the clean-up removed.
  status: z.enum(adminImportStatusFilters).optional(),
  reported: z.stringbool().optional(),
  hasCopy: z.stringbool().optional(),
});

export type AdminImportListQuery = z.infer<typeof adminImportListQuerySchema>;

export const adminImportFlagsSchema = z.object({
  unreadableFiles: z.int().min(0),
  nothingFound: z.int().min(0),
  emptyRequired: z.int().min(0),
  checks: z.int().min(0),
});

export type AdminImportFlags = z.infer<typeof adminImportFlagsSchema>;

export const adminImportCopySchema = z.object({
  id: z.uuid(),
  // Null for the import's own copy.
  part: importLibraryPartSchema.nullable(),
  writtenAt: timestamp,
  expiresAt: timestamp,
  removedAt: timestamp.nullable(),
});

export type AdminImportCopy = z.infer<typeof adminImportCopySchema>;

export const adminImportListItemSchema = z.object({
  id: z.uuid(),
  organization: z.object({ id: z.uuid(), name: z.string().nullable() }),
  // The import's row is gone and only its copies remain: kind, status and counts are unknown.
  rowDeleted: z.boolean(),
  kind: z.enum(importKinds).nullable(),
  status: z.enum(importStatuses).nullable(),
  createdAt: timestamp.nullable(),
  endedAt: timestamp.nullable(),
  // The first characters of the prompts' hash.
  readingVersion: z.string().nullable(),
  flags: adminImportFlagsSchema.nullable(),
  // Changed or unticked over what was proposed, from 0 to 1; null before a confirmation.
  changedShare: z.number().min(0).max(1).nullable(),
  costUsd: z.number().nullable(),
  // The latest report, of the import or one of its parts.
  reportedAt: timestamp.nullable(),
  copy: adminImportCopySchema.omit({ id: true, part: true }).nullable(),
  partCopies: z.int().min(0),
});

export type AdminImportListItem = z.infer<typeof adminImportListItemSchema>;

export const adminImportListSchema = pageSchema(adminImportListItemSchema);

export type AdminImportList = z.infer<typeof adminImportListSchema>;

const readingSchema = {
  readingVersion: z.unknown().nullable(),
  readingFlags: z.unknown().nullable(),
  quality: z.unknown().nullable(),
  flags: adminImportFlagsSchema.nullable(),
  changedShare: z.number().min(0).max(1).nullable(),
};

export const adminImportRowSchema = z.object({
  kind: z.enum(importKinds),
  status: z.enum(importStatuses),
  failureReason: z.string().nullable(),
  clientId: z.uuid().nullable(),
  intoExistingClient: z.boolean(),
  createdAt: timestamp,
  startedAt: timestamp.nullable(),
  readyAt: timestamp.nullable(),
  confirmedAt: timestamp.nullable(),
  abandonedAt: timestamp.nullable(),
  failedAt: timestamp.nullable(),
  reportedAt: timestamp.nullable(),
  reportedBy: z.uuid().nullable(),
  costUsd: z.number(),
  inputTokens: z.int(),
  cachedInputTokens: z.int(),
  outputTokens: z.int(),
  ...readingSchema,
});

export type AdminImportRow = z.infer<typeof adminImportRowSchema>;

export const adminImportPartSchema = z.object({
  part: importLibraryPartSchema,
  status: z.enum(importLibraryPartStatuses),
  attempt: z.int(),
  failureReason: z.string().nullable(),
  readAt: timestamp.nullable(),
  confirmedAt: timestamp.nullable(),
  failedAt: timestamp.nullable(),
  reportedAt: timestamp.nullable(),
  reportedBy: z.uuid().nullable(),
  costUsd: z.number(),
  ...readingSchema,
});

export type AdminImportPart = z.infer<typeof adminImportPartSchema>;

export const adminImportCopyFileSchema = z.object({
  // Within the import's copy folder, as the file route takes it: `files/…`, `record.json`,
  // `parts/<part>/files/…`.
  path: z.string(),
  // Null when Storage did not say.
  sizeBytes: z.int().nullable(),
});

export type AdminImportCopyFile = z.infer<typeof adminImportCopyFileSchema>;

export const adminImportDetailSchema = z.object({
  id: z.uuid(),
  organization: z.object({ id: z.uuid(), name: z.string().nullable() }),
  // Null once the clean-up removed the row; the copy then holds what is left.
  import: adminImportRowSchema.nullable(),
  parts: z.array(adminImportPartSchema),
  copies: z.array(adminImportCopySchema),
  // The copy as written, read only when a copy is kept: `record.json` and each part's.
  record: z.unknown().nullable(),
  partRecords: z.array(z.object({ part: importLibraryPartSchema, record: z.unknown().nullable() })),
  files: z.array(adminImportCopyFileSchema),
});

export type AdminImportDetail = z.infer<typeof adminImportDetailSchema>;

export const adminImportFileQuerySchema = z.object({ path: z.string().min(1).max(1024) });

export const adminImportFileLinkSchema = z.object({
  url: z.url(),
  expiresAt: timestamp,
});

export type AdminImportFileLink = z.infer<typeof adminImportFileLinkSchema>;

export const adminImportFileLinkSeconds = 60;
