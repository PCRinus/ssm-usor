import { z } from 'zod';

import { importKinds } from './imports';

export const clientFileTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;

export const clientFileTypeSchema = z.enum(clientFileTypes);

export type ClientFileType = z.infer<typeof clientFileTypeSchema>;

/** The type a file name's extension stands for; any other extension is refused. */
export const clientFileExtensions = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
} as const satisfies Record<string, ClientFileType>;

// The limit the bucket applies as well.
export const maxClientFileBytes = 25 * 1024 * 1024;

const name = z.string().trim().min(1).max(200);
const note = z.string().trim().max(2000);

export const clientFileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  note: z.string().nullable(),
  ownersOnly: z.boolean(),
  // Null for a file about the client itself.
  employee: z.object({ id: z.uuid(), lastName: z.string(), firstName: z.string() }).nullable(),
  originalFileName: z.string(),
  mimeType: clientFileTypeSchema,
  sizeBytes: z.int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  // Null once the account that uploaded it is gone; `fullName` is null for an account that
  // has not named itself, or one outside the organization, such as a platform admin.
  uploadedBy: z.object({ id: z.uuid(), fullName: z.string().nullable() }).nullable(),
  // Whether the caller may rename, annotate and delete it: its uploader, or an owner.
  canChange: z.boolean(),
  // The import whose folder the file came with (ADR 030), and the folders it sat in there;
  // both null for a file uploaded on its own, the path null at the top of the folder.
  importId: z.uuid().nullable(),
  importPath: z.string().nullable(),
  // A client's documentation, or an employee import's scanned training sheets (ADR 032).
  importKind: z.enum(importKinds).nullable(),
  // Whether the import read the file; with the reason when it did not. Null outside an import.
  importRead: z.boolean().nullable(),
  importReason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type ClientFile = z.infer<typeof clientFileSchema>;

export const listClientFilesQuerySchema = z.object({
  employeeId: z.uuid().optional().meta({
    description:
      "One of the client's employees, whose files the list holds; without it, the list holds the client's own files only.",
  }),
});

export type ListClientFilesQuery = z.infer<typeof listClientFilesQuerySchema>;

export const clientFileListResponseSchema = z.object({ items: z.array(clientFileSchema) });

export type ClientFileListResponse = z.infer<typeof clientFileListResponseSchema>;

export const clientFileResponseSchema = z.object({ file: clientFileSchema });

export type ClientFileResponse = z.infer<typeof clientFileResponseSchema>;

/** What travels beside an uploaded file, as query parameters, since the body is the file. */
export const uploadClientFileQuerySchema = z.object({
  // The name the file had on the uploader's computer; its extension decides the type.
  fileName: z.string().trim().min(1).max(255),
  // Left out, the file name without its extension.
  name: name.optional(),
  note: note.optional(),
  ownersOnly: z.enum(['true', 'false']).default('false'),
  // One of the client's employees; it cannot be changed after the upload.
  employeeId: z.uuid().optional(),
});

export type UploadClientFileQuery = z.infer<typeof uploadClientFileQuerySchema>;

export const updateClientFileRequestSchema = z.object({
  name: name.optional(),
  // Null or an empty string clears it.
  note: note.nullable().optional(),
});

export type UpdateClientFileRequest = z.infer<typeof updateClientFileRequestSchema>;

export const setClientFileOwnersOnlyRequestSchema = z.object({ ownersOnly: z.boolean() });

export type SetClientFileOwnersOnlyRequest = z.infer<typeof setClientFileOwnersOnlyRequestSchema>;

export const clientFileDownloadResponseSchema = z.object({
  url: z.url(),
  // The name the file was uploaded under.
  fileName: z.string(),
  // `inline` for a PDF or an image, which open in a tab; the other types download.
  disposition: z.enum(['inline', 'attachment']),
  expiresInSeconds: z.int(),
});

export type ClientFileDownloadResponse = z.infer<typeof clientFileDownloadResponseSchema>;

/** `reason` values on client file errors, so the SPA can word them itself. */
export const clientFileErrorReasons = {
  typeNotAllowed: 'client_file_type_not_allowed',
  contentMismatch: 'client_file_content_mismatch',
  empty: 'client_file_empty',
  tooLarge: 'client_file_too_large',
  leadOwnersOnly: 'client_file_lead_owners_only',
} as const;
