import { createRoute, z } from '@hono/zod-openapi';
import {
  addFoundSheetsRequestSchema,
  confirmImportRequestSchema,
  confirmImportResponseSchema,
  createImportRequestSchema,
  employeeReviewSchema,
  foundSheetsResponseSchema,
  importDetailSchema,
  importListResponseSchema,
  importSourceQuerySchema,
  importSourceResponseSchema,
  importSummarySchema,
  listImportsQuerySchema,
  registerImportFilesRequestSchema,
  registerImportFilesResponseSchema,
  saveEmployeeImportChangesRequestSchema,
  saveImportChangesRequestSchema,
  saveImportChangesResponseSchema,
  splitImportRequestSchema,
} from '@ssm-usor/contracts';
import { employeeImportProposalSchema, proposalSchema } from '@ssm-usor/import';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const importParams = z.object({ importId: z.uuid() });
const clientParams = z.object({ clientId: z.uuid() });
const importFileParams = z.object({ importId: z.uuid(), fileId: z.uuid() });

const noSuchImport = {
  description: 'The import does not exist in the organization, or the caller cannot see it',
  content: errorContent,
};
const unavailable = {
  description:
    'Reading imports is not set up on this deployment (reason `import_unavailable`), or a dependency is down',
  content: errorContent,
};

const summaryContent = {
  'application/json': {
    schema: z.object({ import: importSummarySchema.meta({ id: 'ImportSummary' }) }).meta({
      id: 'ImportSummaryResponse',
    }),
  },
};

const versionContent = {
  'application/json': {
    schema: saveImportChangesResponseSchema.meta({ id: 'SaveImportChangesResponse' }),
  },
};

const json = <T extends z.ZodType>(schema: T) => ({
  required: true,
  content: { 'application/json': { schema } },
});

export const createImportRoute = createRoute({
  method: 'post',
  path: '/imports',
  operationId: 'createImport',
  summary: 'Start an import from documents',
  description:
    "A client import (ADR 030) for a new client, or with `clientId` for an existing one, which must be an active client, not a lead. With `kind` `employees`, an employee import (ADR 032) for `clientId`, which then is required; with `addFoundSheets`, it starts holding every training sheet photograph the client's documentation pack held that no employee import has taken, copied from the client's files (`422` with `import_no_found_sheets` when there is none). It starts `uploading`: register its files, upload them, then start the reading. Answers `503` with the reason `import_unavailable` where the model gateway, the extractor or the queue is not configured.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { body: json(createImportRequestSchema.meta({ id: 'CreateImportRequest' })) },
  responses: {
    201: { description: 'The import', content: summaryContent },
    400: { description: 'Invalid request body', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    409: { description: 'The client is archived or a lead', content: errorContent },
    422: {
      description: 'The client has no sheet photographs found in its documentation to add',
      content: errorContent,
    },
    ...membershipErrors,
    503: unavailable,
  },
});

export const listImportsRoute = createRoute({
  method: 'get',
  path: '/imports',
  operationId: 'listImports',
  summary: "List the organization's open or last confirmed imports",
  description:
    "Every import of `kind` (client imports when left out, both kinds with `all`) neither confirmed nor abandoned, failed ones included, newest first: the rows the client list and a client's page show, with `all` those the app watches to say when a member's import finishes reading, or with `kind` `employees` and `clientId` the open import a client's Angajați tab shows. `expiresAt` is when an import uploading or ready for review fails if nobody changes it, and `people` an employee import's people by state once it is ready. Not paginated; an organization has a handful at a time. With `status` `confirmed`, the last ones confirmed instead, latest first; with `kind` `employees` and `clientId` each counts in `uninvited` the current employees it brought who are neither participants nor invited, and the Angajați tab offers to invite the people of the latest with someone left.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: listImportsQuerySchema },
  responses: {
    200: {
      description: 'The open imports, or the last confirmed',
      content: {
        'application/json': {
          schema: importListResponseSchema.meta({ id: 'ImportListResponse' }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const getImportRoute = createRoute({
  method: 'get',
  path: '/imports/{importId}',
  operationId: 'getImport',
  summary: 'Get an import with its files and proposal',
  description:
    "Its step, every file with its state and reason, the progress counts, the other companies the documents named, and from `ready` on the proposal with its flags, the member's changes, the version to save on, and what still blocks confirming. The proposal is null before `ready` and once dropped, 30 days after confirming. An employee import's proposal, changes and each person's state are in `employees` instead, `proposal` and `changes` being a client import's; its `blockers` count only the people marked checked. `usage`, a debugging aid, is the models' cost at list price and tokens for the whole import and for each step, and the characters read; it is served outside production and, in production, only to a platform admin.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importParams },
  responses: {
    200: {
      description: 'The import',
      content: {
        'application/json': {
          schema: z
            .object({
              import: importDetailSchema
                .extend({
                  proposal: proposalSchema.nullable(),
                  employees: employeeReviewSchema
                    .extend({ proposal: employeeImportProposalSchema })
                    .meta({ id: 'EmployeeImportReview' })
                    .nullable(),
                })
                .meta({ id: 'ImportDetail' }),
            })
            .meta({ id: 'ImportDetailResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchImport,
    ...membershipErrors,
  },
});

export const registerImportFilesRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/files',
  operationId: 'registerImportFiles',
  summary: 'Register the files the browser is about to upload',
  description:
    "One row per file, while the import is `uploading` (else `409` with `import_not_uploading`). An employee import takes only photographs and PDFs (else `400` with `import_photos_only`). Each answer names the bucket and the path the browser uploads the file to in Supabase Storage with the member's own session; the bucket's policy takes only that path, only while the file is uploading. A path the import already has, or twice in one request, answers `409` with `import_duplicate_path`; an extension that is not the type's, `400` with `import_type_mismatch`; a file the system or Word leaves beside the documents (a name starting `~$` or `._`, `.DS_Store`, anything under `__MACOSX`), `400` with `import_system_file`; past the caps of the import's kind, `422` with `import_too_large`: a client import holds at most 150 files and 100 MiB, each at most 20 MiB, an employee import 500 files and 1 GiB, each at most 25 MiB. Registering can be repeated in batches.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(registerImportFilesRequestSchema.meta({ id: 'RegisterImportFilesRequest' })),
  },
  responses: {
    201: {
      description: 'Where to upload each file',
      content: {
        'application/json': {
          schema: registerImportFilesResponseSchema.meta({ id: 'RegisterImportFilesResponse' }),
        },
      },
    },
    400: {
      description: 'Invalid path or body, or a type its extension is not',
      content: errorContent,
    },
    404: noSuchImport,
    409: { description: 'Not uploading, or a path registered already', content: errorContent },
    422: { description: 'Past the caps of an import', content: errorContent },
    ...membershipErrors,
  },
});

export const startImportRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/start',
  operationId: 'startImport',
  summary: 'Start reading the uploaded files',
  description:
    'Files whose upload never arrived are dropped; with none left the answer is `422` with `import_empty`. The import moves to `preparing` and one message per file goes to the import queue. `409` with `import_not_uploading` once started; `503` with `import_unavailable` where the gateway, the extractor or the queue is missing.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importParams },
  responses: {
    200: { description: 'The import, preparing', content: summaryContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchImport,
    409: { description: 'The import has started already', content: errorContent },
    422: { description: 'No file arrived', content: errorContent },
    ...membershipErrors,
    503: unavailable,
  },
});

export const saveImportChangesRoute = createRoute({
  method: 'put',
  path: '/imports/{importId}/changes',
  operationId: 'saveImportChanges',
  summary: "Save the member's review",
  description:
    "A client import's: replaces the changes, on the `version` the caller read, and answers the next version. `409` with `import_changed` when someone saved since, `import_not_ready` when the import is not `ready`, `import_wrong_kind` for an employee import.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(saveImportChangesRequestSchema.meta({ id: 'SaveImportChangesRequest' })),
  },
  responses: {
    200: { description: 'The new version', content: versionContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchImport,
    409: { description: 'Not ready, or saved since it was read', content: errorContent },
    ...membershipErrors,
  },
});

export const saveEmployeeImportChangesRoute = createRoute({
  method: 'put',
  path: '/imports/{importId}/employee-changes',
  operationId: 'saveEmployeeImportChanges',
  summary: "Save the member's review of an employee import",
  description:
    "An employee import's: replaces the changes (people's states, choices and values, a post per job title, a workplace per text, rows, pages), on the `version` the caller read, and answers the next version. Each save restarts the 14 days an import untouched is kept. `409` with `import_changed` when someone saved since, `import_not_ready` when the import is not `ready`, `import_wrong_kind` for a client import.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(
      saveEmployeeImportChangesRequestSchema.meta({ id: 'SaveEmployeeImportChangesRequest' })
    ),
  },
  responses: {
    200: { description: 'The new version', content: versionContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchImport,
    409: {
      description: 'Not ready, saved since it was read, or a client import',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const getImportSourceRoute = createRoute({
  method: 'get',
  path: '/imports/{importId}/source',
  operationId: 'getImportSource',
  summary: 'Get the file a value was quoted from',
  description:
    "`file` is a source's `file` exactly as the proposal names it: a file's upload path, or `<upload path> (pagina N)` for a page read as an image; for an employee import, a page's `label`. The answer links to the original and to the converted file, carries the text taken out of a Word file or the pages of a PDF, none for a page read as an image, and where `quote` is in them: when it is in several places, the one `near` (the post a table row is for) precedes most closely, or else the first.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importParams, query: importSourceQuerySchema },
  responses: {
    200: {
      description: 'The source',
      content: {
        'application/json': {
          schema: importSourceResponseSchema.meta({ id: 'ImportSourceResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or query', content: errorContent },
    404: { description: 'No such import, or no file of it by that name', content: errorContent },
    ...membershipErrors,
  },
});

export const confirmImportRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/confirm',
  operationId: 'confirmImport',
  summary: 'Confirm the proposal',
  description:
    "Writes the proposal with the member's changes into the client, its workplaces, positions, people and fire-safety data in one transaction, and the import folder into its files, on the `version` the caller read. An employee import writes the people marked checked, created or completed, with their paper trainings, test results and sheets as their files (`apply_employee_import`), then brings their stored signed sheets up to date, and answers their `employeeIds`; with nobody checked it is `422` with `import_incomplete` on `people`, and a CNP or employee number another employee of the client took since is `422` with `import_refused` on that person's field. `422` with `import_incomplete` lists in `issues` what still blocks (a choice, a missing or invalid value, a second registered office, an unknown reference). `409` with `import_changed`, `import_not_ready`, `import_other_company` (an existing client's CUI is not the documents'), `import_client_exists` (a new client's CUI is the organization's already) or `import_outdated` (a workplace, position or employee the review named is no longer the client's). `422` with `import_refused` when a table still refuses a value, as a registered office beside the one an existing client has: one issue with the proposal's list or group as `path` and the constraint's name as `message`. The files are copied into the client's files by the queue after the answer.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(confirmImportRequestSchema.meta({ id: 'ConfirmImportRequest' })),
  },
  responses: {
    200: {
      description: 'The client',
      content: {
        'application/json': {
          schema: confirmImportResponseSchema.meta({ id: 'ConfirmImportResponse' }),
        },
      },
    },
    400: {
      description: 'Invalid path or body, or a value the client refuses',
      content: errorContent,
    },
    404: noSuchImport,
    409: {
      description: 'Not ready, saved since, another company, or the client changed',
      content: errorContent,
    },
    422: {
      description: 'Decisions are still open, or a table refused a value',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const abandonImportRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/abandon',
  operationId: 'abandonImport',
  summary: 'Abandon an import',
  description:
    'Any import not confirmed or abandoned yet; `409` with `import_ended` otherwise. It is deleted with its files 14 days later.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importParams },
  responses: {
    204: { description: 'Abandoned' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchImport,
    409: { description: 'Already confirmed or abandoned', content: errorContent },
    ...membershipErrors,
  },
});

export const splitImportRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/split',
  operationId: 'splitImport',
  summary: "Import another company's files on their own",
  description:
    'Takes files the sorting found to be about another company, as `otherCompanies` lists them, into a new import for a new client, without uploading them again, and starts reading it. Every file must be `other_company` (else `422` with `import_not_other_company`), and none already split from this import into one not abandoned (`409` with `import_already_split`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(splitImportRequestSchema.meta({ id: 'SplitImportRequest' })),
  },
  responses: {
    201: { description: 'The new import, preparing', content: summaryContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchImport,
    409: { description: 'Split already, or the import is abandoned', content: errorContent },
    422: { description: "A file is not another company's", content: errorContent },
    ...membershipErrors,
    503: unavailable,
  },
});

export const readImportFileRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/files/{fileId}/read',
  operationId: 'readImportFile',
  summary: 'Read a file the sorting set aside',
  description:
    "Only while the import is `ready` (else `409` with `import_not_ready`) and only a file `set_aside` (else `422` with `import_file_not_set_aside`) whose text and scanned pages, with the files already read, fit one import (else `422` with `import_too_much_text` or `import_too_many_scans`). The file joins the files to read, the import goes back to `reading` with its proposal and the member's changes dropped and its version moved on, and the reading and the checks run again over every file to read.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importFileParams },
  responses: {
    200: { description: 'The import, reading', content: summaryContent },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such import, or no such file of it', content: errorContent },
    409: { description: 'Not ready, or saved since', content: errorContent },
    422: {
      description: 'The file was not set aside, or its text or scanned pages do not fit the import',
      content: errorContent,
    },
    ...membershipErrors,
    503: unavailable,
  },
});

export const listFoundSheetsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/found-sheets',
  operationId: 'listFoundSheets',
  summary: "The sheet photographs a client's documentation pack held",
  description:
    "The training sheet photographs and PDFs a confirmed client import of the client set aside for the employee import (ADR 032), once they are in the client's files, that no employee import not abandoned or failed has taken: one taken by an import that is abandoned or fails is offered again. By the client import that found them, newest first. A photograph found twice, or one an import holds a copy of, is listed once or not at all. A file only owners see is never listed, since its copy would be an import file every member reads.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The found sheets',
      content: {
        'application/json': {
          schema: foundSheetsResponseSchema.meta({ id: 'FoundSheetsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...membershipErrors,
  },
});

export const addFoundSheetsRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/found-sheets',
  operationId: 'addFoundSheets',
  summary: "Add the sheet photographs the client's documentation pack held",
  description:
    "To an employee import still `uploading` (else `409` with `import_not_uploading`; a client import is `409` with `import_wrong_kind`): copies the found sheets `fileIds` names, or every one offered, from the client's files into the import's own, server side, as if uploaded. A file not offered, or none to add, is `422` with `import_no_found_sheets`; past the import's caps `422` with `import_too_large`.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(addFoundSheetsRequestSchema.meta({ id: 'AddFoundSheetsRequest' })),
  },
  responses: {
    201: { description: 'The import with the sheets added', content: summaryContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchImport,
    409: { description: 'Not uploading, or not an employee import', content: errorContent },
    422: { description: 'No such found sheet, or past the caps', content: errorContent },
    ...membershipErrors,
    503: unavailable,
  },
});
