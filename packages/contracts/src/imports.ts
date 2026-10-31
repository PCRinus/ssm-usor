import { z } from 'zod';

// Imports from documents (ADR 030). The proposal itself is `@ssm-usor/import`'s schema, which
// the API's routes add to the answer.

export const importStatuses = [
  'uploading',
  'preparing',
  'sorting',
  'reading',
  'checking',
  'ready',
  'confirmed',
  'abandoned',
  'failed',
] as const;

export type ImportStatus = (typeof importStatuses)[number];

export const importFileStates = [
  'uploading',
  'uploaded',
  'prepared',
  'read',
  'set_aside',
  'for_employees',
  'other_company',
  'failed',
] as const;

export type ImportFileState = (typeof importFileStates)[number];

export const importFileTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
] as const;

export type ImportFileType = (typeof importFileTypes)[number];

export const importFileExtensions = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  heic: ['image/heic', 'image/heif'],
  heif: ['image/heic', 'image/heif'],
} as const satisfies Record<string, readonly ImportFileType[]>;

export const importKinds = ['client', 'employees'] as const;
export type ImportKind = (typeof importKinds)[number];

export type ImportLimits = {
  files: number;
  totalBytes: number;
  fileBytes: number;
  // Photographs and scanned PDF pages, each read by the model on its own.
  scannedPages: number;
};

/** The caps of each kind (ADR 030, ADR 032), which the database applies as well. */
export const importLimits = {
  client: {
    files: 150,
    totalBytes: 100 * 1024 * 1024,
    fileBytes: 20 * 1024 * 1024,
    scannedPages: 150,
  },
  employees: {
    files: 500,
    totalBytes: 1024 * 1024 * 1024,
    fileBytes: 25 * 1024 * 1024,
    scannedPages: 500,
  },
} as const satisfies Record<ImportKind, ImportLimits>;

// What a request may carry before its import's kind is known; the API holds each kind to its own.
const largestImport = importLimits.employees;

/** `reason` values on import errors, so the SPA can word them itself. */
export const importErrorReasons = {
  unavailable: 'import_unavailable',
  notUploading: 'import_not_uploading',
  tooLarge: 'import_too_large',
  empty: 'import_empty',
  duplicatePath: 'import_duplicate_path',
  typeMismatch: 'import_type_mismatch',
  systemFile: 'import_system_file',
  notReady: 'import_not_ready',
  changed: 'import_changed',
  ended: 'import_ended',
  incomplete: 'import_incomplete',
  refused: 'import_refused',
  otherCompany: 'import_other_company',
  clientExists: 'import_client_exists',
  alreadySplit: 'import_already_split',
  notOtherCompany: 'import_not_other_company',
  outdated: 'import_outdated',
  notSetAside: 'import_file_not_set_aside',
  tooMuchText: 'import_too_much_text',
  tooManyScans: 'import_too_many_scans',
} as const;

// What macOS, Windows and Word leave beside the documents. A Word lock file (~$name.docx) keeps
// the document's extension but holds no document, so the extension alone does not keep it out.
export function isSystemPath(path: string) {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  return (
    parts.some((part) => part === '__MACOSX') ||
    name === '.DS_Store' ||
    name.toLowerCase() === 'thumbs.db' ||
    name.toLowerCase() === 'desktop.ini' ||
    name.startsWith('._') ||
    name.startsWith('~$')
  );
}

const uploadPath = z
  .string()
  .min(1)
  .max(1024)
  .refine((path) => !path.startsWith('/') && !path.endsWith('/') && !path.includes('//'), {
    message: 'A path has no empty folder and does not start or end with /.',
  })
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'), {
    message: 'A path does not climb out of its folder.',
  })
  .refine((path) => (path.split('/').at(-1) ?? '').length <= 255, {
    message: 'A file name has at most 255 characters.',
  });

export const createImportRequestSchema = z.object({
  clientId: z.uuid().optional(),
});

export type CreateImportRequest = z.infer<typeof createImportRequestSchema>;

export const registerImportFilesRequestSchema = z.object({
  files: z
    .array(
      z.object({
        // Its folders inside the upload and its name, with / between them; the name is the
        // last part.
        uploadPath,
        mimeType: z.enum(importFileTypes),
        sizeBytes: z.int().min(1).max(largestImport.fileBytes),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
    )
    .min(1)
    .max(largestImport.files),
});

export type RegisterImportFilesRequest = z.infer<typeof registerImportFilesRequestSchema>;

export const registeredImportFileSchema = z.object({
  id: z.uuid(),
  uploadPath: z.string(),
  // Where the browser uploads the file with the member's own session: Supabase Storage,
  // this bucket and this path, which the bucket's policy accepts while the file is uploading.
  bucket: z.literal('imports'),
  storagePath: z.string(),
});

export type RegisteredImportFile = z.infer<typeof registeredImportFileSchema>;

export const registerImportFilesResponseSchema = z.object({
  files: z.array(registeredImportFileSchema),
});

export type RegisterImportFilesResponse = z.infer<typeof registerImportFilesResponseSchema>;

const person = z.object({ id: z.uuid(), fullName: z.string().nullable() });

export const importSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(importKinds),
  status: z.enum(importStatuses),
  // The client completed, or the one a confirmed import created; null for a new client before.
  client: z.object({ id: z.uuid(), legalName: z.string() }).nullable(),
  intoExistingClient: z.boolean(),
  // The company the documents are about, once the sorting found it.
  companyName: z.string().nullable(),
  companyCui: z.string().nullable(),
  sourceImportId: z.uuid().nullable(),
  failureReason: z.string().nullable(),
  fileCount: z.int().min(0),
  createdBy: person.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  readyAt: z.iso.datetime({ offset: true }).nullable(),
  failedAt: z.iso.datetime({ offset: true }).nullable(),
  confirmedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type ImportSummary = z.infer<typeof importSummarySchema>;

export const listImportsQuerySchema = z.object({
  clientId: z.uuid().optional().meta({
    description: 'Only the imports into this client; without it, every open import.',
  }),
});

export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;

export const importListResponseSchema = z.object({ items: z.array(importSummarySchema) });

export type ImportListResponse = z.infer<typeof importListResponseSchema>;

export const importFileSchema = z.object({
  id: z.uuid(),
  uploadPath: z.string(),
  fileName: z.string(),
  mimeType: z.enum(importFileTypes),
  sizeBytes: z.int().min(1),
  state: z.enum(importFileStates),
  // What the sorting took it for, as `@ssm-usor/import`'s `documentKinds` name it.
  documentKind: z.string().nullable(),
  // In Romanian: why it was set aside or failed.
  reason: z.string().nullable(),
  companyName: z.string().nullable(),
  companyCui: z.string().nullable(),
  pageCount: z.int().nullable(),
  // Whether pages of it are read as images: a photograph, or a PDF with scanned pages.
  isScan: z.boolean().nullable(),
  // A `.doc` converted to `.docx`, or a HEIC photograph to JPEG.
  hasDerived: z.boolean(),
});

export type ImportFile = z.infer<typeof importFileSchema>;

export const importProgressSchema = z.object({
  files: z.int().min(0),
  // Files whose text is taken out, or that failed on the way.
  prepared: z.int().min(0),
  // Photographs and PDFs with scanned pages, and those of them already read.
  scans: z.int().min(0),
  scansRead: z.int().min(0),
});

export const otherCompanySchema = z.object({
  name: z.string().nullable(),
  cui: z.string().nullable(),
  fileIds: z.array(z.uuid()),
});

export type OtherCompany = z.infer<typeof otherCompanySchema>;

export const registeredCompanySchema = z.object({
  cui: z.string(),
  legalName: z.string(),
  vatPayer: z.boolean(),
  inactive: z.boolean(),
});

const changedValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);

/**
 * What the member decided in the review, by the proposal's paths. A value is the proposal's
 * unless the member changed it.
 */
export const importChangesSchema = z.object({
  // A single value by `client.<name>`, `trainingSchedule.<name>` or `fireSafety.<name>`.
  fields: z
    .record(
      z.string().regex(/^(client|trainingSchedule|fireSafety)\.[A-Za-z]+$/),
      z
        .object({
          // The option chosen among those the documents gave.
          option: z.int().min(0).optional(),
          // A value the member wrote instead; null leaves the field empty.
          value: z.union([z.string(), z.number(), z.null()]).optional(),
          // Whether a value only another company's passages give is taken.
          included: z.boolean().optional(),
          // Into an existing client: the documents' value replaces the one the app has.
          replace: z.boolean().optional(),
        })
        .strict()
    )
    .default({}),
  // A list item by its id in the proposal, such as `workplace-2`.
  items: z
    .record(
      z.string().min(1).max(80),
      z
        .object({
          // Whether the item is imported; by default, unless only another company's passages
          // give it.
          included: z.boolean().optional(),
          // The member's values, by the item's own field names. A reference is
          // `workplace`, `jobPosition` or `employee`: an item id of the proposal, or the id of
          // an existing row of the client.
          values: z.record(z.string(), changedValue).optional(),
          // Into an existing client, a workplace or job position: the row it completes, or null
          // for a new one. Left out, a workplace is matched by its name or address and a
          // position by its name.
          existingId: z.uuid().nullable().optional(),
          // Into an existing client: the fields where the documents' value replaces the row's.
          replace: z.array(z.string()).optional(),
        })
        .strict()
    )
    .default({}),
});

export type ImportChanges = z.infer<typeof importChangesSchema>;

/** What an employee import reads of a person from their sheets (ADR 032), by field. */
export const employeeImportFieldNames = [
  'lastName',
  'firstName',
  'cnp',
  'employeeNumber',
  'birthDate',
  'birthPlace',
  'homeAddress',
  'education',
  'qualification',
  'bloodGroup',
  'rhFactor',
  'jobTitle',
  'hiredAt',
  'leftOn',
  'workplace',
  'commuteRoute',
  'commuteMinutes',
] as const;

export type EmployeeImportFieldName = (typeof employeeImportFieldNames)[number];

/** De verificat, Verificat, Lăsat deoparte: only a checked person is written. */
export const employeeImportPersonStates = ['to_check', 'checked', 'set_aside'] as const;

export type EmployeeImportPersonState = (typeof employeeImportPersonStates)[number];

const proposalId = z.string().min(1).max(80);

/**
 * What the member decided in an employee import's review, by the ids of its proposal
 * (`@ssm-usor/import`'s `EmployeeImportProposal`). A value is the proposal's unless the member
 * changed it.
 */
export const employeeImportChangesSchema = z.object({
  people: z
    .record(
      proposalId,
      z
        .object({
          // Left out, `to_check`.
          state: z.enum(employeeImportPersonStates).optional(),
          // Whether a leaver is imported, as a former employee; by default not.
          included: z.boolean().optional(),
          fields: z
            .partialRecord(
              z.enum(employeeImportFieldNames),
              z
                .object({
                  // The option chosen among those the sheets gave.
                  option: z.int().min(0).optional(),
                  // A value the member wrote instead; null leaves the field empty.
                  value: z.union([z.string(), z.number(), z.null()]).optional(),
                  // Into an existing employee: the sheet's value replaces the one the app has.
                  replace: z.boolean().optional(),
                })
                .strict()
            )
            .optional(),
          // The corrected CNP the import offered is taken.
          cnpCorrection: z.boolean().optional(),
          // Whether the person is the client's employee the import proposed: false creates them
          // instead. Asked of a match by the name alone.
          existing: z.boolean().optional(),
          // This person's post or workplace, over the one decided for their title or text.
          jobPositionId: z.uuid().optional(),
          workplaceId: z.uuid().nullable().optional(),
        })
        .strict()
    )
    .default({}),
  // One post for everyone whose sheets give the title, by the title's group id.
  jobTitles: z.record(proposalId, z.object({ jobPositionId: z.uuid() }).strict()).default({}),
  // One workplace for everyone whose sheets give the text; null leaves it empty.
  workplaces: z
    .record(proposalId, z.object({ workplaceId: z.uuid().nullable() }).strict())
    .default({}),
  rows: z
    .record(
      proposalId,
      z
        .object({
          // Whether the row is imported; by default unless unsigned or already in the app.
          included: z.boolean().optional(),
          // Whether the paper test result the row carries is imported; by default when the
          // signature that closes the test is seen.
          test: z.boolean().optional(),
          // The member's values, by the row's own field names.
          values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
        })
        .strict()
    )
    .default({}),
  // A page given to another person, or null when it is left out.
  pages: z.record(proposalId, z.object({ personId: proposalId.nullable() }).strict()).default({}),
});

export type EmployeeImportChanges = z.infer<typeof employeeImportChangesSchema>;

export const importBlockerSchema = z.object({
  // A path of the proposal, as its flags name them.
  path: z.string(),
  code: z.enum(['choice', 'missing', 'unknown_reference', 'invalid']),
});

export type ImportBlocker = z.infer<typeof importBlockerSchema>;

const modelUsageSchema = z
  .object({
    // At the models' list price.
    costUsd: z.number().min(0),
    inputTokens: z.int().min(0),
    cachedInputTokens: z.int().min(0),
    outputTokens: z.int().min(0),
  })
  .meta({ id: 'ImportModelUsage' });

export const importUsageSchema = modelUsageSchema
  .extend({
    // The characters of text sent to the reading model; null until the files are sorted.
    readCharacters: z.int().min(0).nullable(),
    bySteps: z.object({
      sorting: modelUsageSchema.optional(),
      reading: modelUsageSchema.optional(),
      scanning: modelUsageSchema.optional(),
    }),
  })
  .meta({ id: 'ImportUsage' });

export type ImportUsage = z.infer<typeof importUsageSchema>;

export const importDetailSchema = importSummarySchema.extend({
  version: z.int().min(0),
  files: z.array(importFileSchema),
  progress: importProgressSchema,
  otherCompanies: z.array(otherCompanySchema),
  // What ANAF answered for the documents' CUI, when it was asked and knew it.
  registeredCompany: registeredCompanySchema.nullable(),
  changes: importChangesSchema.nullable(),
  // What keeps the import from being confirmed; empty once it can be.
  blockers: z.array(importBlockerSchema),
  proposalDroppedAt: z.iso.datetime({ offset: true }).nullable(),
  // A debugging aid, served outside production and to platform admins only.
  usage: importUsageSchema.optional(),
});

export type ImportDetail = z.infer<typeof importDetailSchema>;

export const saveImportChangesRequestSchema = z.object({
  version: z.int().min(0),
  changes: importChangesSchema,
});

export type SaveImportChangesRequest = z.infer<typeof saveImportChangesRequestSchema>;

export const saveImportChangesResponseSchema = z.object({ version: z.int().min(0) });

export const confirmImportRequestSchema = z.object({ version: z.int().min(0) });

export type ConfirmImportRequest = z.infer<typeof confirmImportRequestSchema>;

export const confirmImportResponseSchema = z.object({
  clientId: z.uuid(),
  // The import folder's files are copied into the client's files after the answer.
  fileCount: z.int().min(0),
});

export type ConfirmImportResponse = z.infer<typeof confirmImportResponseSchema>;

export const splitImportRequestSchema = z.object({
  // Files of another company, as `otherCompanies` lists them.
  fileIds: z.array(z.uuid()).min(1).max(importLimits.client.files),
});

export type SplitImportRequest = z.infer<typeof splitImportRequestSchema>;

export const importSourceQuerySchema = z.object({
  // A source's `file`, exactly as the proposal names it.
  file: z.string().min(1).max(1100),
  quote: z.string().max(2000).optional(),
  // What the passage stands under, as the post an equipment row is for: of the places the quote
  // is found in, the one that follows it most closely is matched.
  near: z.string().max(200).optional(),
});

export type ImportSourceQuery = z.infer<typeof importSourceQuerySchema>;

const link = z.object({ url: z.url(), mimeType: z.string() });
const span = z.object({ start: z.int().min(0), end: z.int().min(0) });

export const importSourceResponseSchema = z.object({
  fileId: z.uuid(),
  uploadPath: z.string(),
  fileName: z.string(),
  // A page of a PDF read as an image, or null for the whole file.
  page: z.int().min(1).nullable(),
  // Signed links valid for `expiresInSeconds`: the file as uploaded, and the `.docx` of a `.doc`
  // or the JPEG of a HEIC photograph.
  original: link,
  derived: link.nullable(),
  // The text taken out of a Word file; null for a PDF and an image.
  text: z.string().nullable(),
  // The text of each page of a PDF, which its viewer's text layer shows.
  pages: z.array(z.object({ number: z.int().min(1), text: z.string() })).nullable(),
  // Where the quote is: in `text`, or in the text of `match.page`. Null when it was not found
  // or the file is an image. `parts` are the places of the passages an ellipsis in the quote
  // separates, one for a quote without one.
  match: z
    .object({
      page: z.int().min(1).nullable(),
      ...span.shape,
      parts: z.array(span).min(1),
    })
    .nullable(),
  expiresInSeconds: z.int(),
});

export type ImportSourceResponse = z.infer<typeof importSourceResponseSchema>;
