import { createRoute, z } from '@hono/zod-openapi';
import {
  addFoundSheetsRequestSchema,
  confirmImportLibraryPartRequestSchema,
  confirmImportRequestSchema,
  confirmImportResponseSchema,
  confirmInstructionsPartResponseSchema,
  confirmRisksPartResponseSchema,
  createImportRequestSchema,
  employeeReviewSchema,
  foundSheetsResponseSchema,
  importDetailSchema,
  importLibraryPartSchema,
  importLibraryPostSchema,
  importListResponseSchema,
  importSourceQuerySchema,
  importSourceResponseSchema,
  importSummarySchema,
  instructionsPartDetailSchema,
  listImportsQuerySchema,
  registerImportFilesRequestSchema,
  registerImportFilesResponseSchema,
  risksPartDetailSchema,
  saveClientImportChangesResponseSchema,
  saveEmployeeImportChangesRequestSchema,
  saveImportChangesRequestSchema,
  saveImportChangesResponseSchema,
  saveImportLibraryPartChangesRequestSchema,
  splitImportRequestSchema,
} from '@ssm-usor/contracts';
import {
  employeeImportProposalSchema,
  instructionsProposalSchema,
  proposalSchema,
  risksProposalSchema,
} from '@ssm-usor/import';

import { allowWhileReadOnly } from '../../lib/access';
import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const importParams = z.object({ importId: z.uuid() });
const clientParams = z.object({ clientId: z.uuid() });
const importFileParams = z.object({ importId: z.uuid(), fileId: z.uuid() });
const libraryPartParams = z.object({ importId: z.uuid(), part: importLibraryPartSchema });

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
    "Every import of `kind` (client imports when left out, both kinds with `all`) neither confirmed nor abandoned, failed ones included, newest first: the rows the client list and a client's page show, with `all` those the app watches to say when a member's import finishes reading, or with `kind` `employees` and `clientId` the open import a client's Angajați tab shows. `expiresAt` is when an import uploading or ready for review fails if nobody changes it, and `people` an employee import's people by state once it is ready. Not paginated; an organization has a handful at a time. With `status` `confirmed`, the last ones confirmed instead, latest first: the last ten, or every one of a client's client imports with `clientId`, which its Detalii tab lists with what is left of each; with `kind` `employees` and `clientId` each counts in `uninvited` the current employees it brought who are neither participants nor invited, and the Angajați tab offers to invite the people of the latest with someone left.",
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
    "Files whose upload never arrived are dropped; with none left the answer is `422` with `import_empty`. The import's known part is charged in credits (ADR 030): 25 for a client import and one per photograph, every photograph and PDF page the browser counted for an employee import. When what is left does not cover it, `409` with `credits_insufficient` and `credits` (`needed`, `left`, `renewsAt`), and nothing starts. The import moves to `preparing` and one message per file goes to the import queue. `409` with `import_not_uploading` once started; `503` with `import_unavailable` where the gateway, the extractor or the queue is missing.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importParams },
  responses: {
    200: { description: 'The import, preparing', content: summaryContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchImport,
    409: {
      description: 'The import has started already, or the credits left do not cover it',
      content: errorContent,
    },
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
    "A client import's: replaces the changes, on the `version` the caller read, and answers the next version with what still blocks confirming, the `blockers` the import's detail gives for these changes. `409` with `import_changed` when someone saved since, `import_not_ready` when the import is not `ready`, `import_wrong_kind` for an employee import.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: importParams,
    body: json(saveImportChangesRequestSchema.meta({ id: 'SaveImportChangesRequest' })),
  },
  responses: {
    200: {
      description: 'The new version and what still blocks confirming',
      content: {
        'application/json': {
          schema: saveClientImportChangesResponseSchema.meta({
            id: 'SaveClientImportChangesResponse',
          }),
        },
      },
    },
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
    'Takes files the sorting found to be about another company, as `otherCompanies` lists them, into a new import for a new client, without uploading them again, and starts reading it. Every file must be `other_company` (else `422` with `import_not_other_company`), and none already split from this import into one not abandoned (`409` with `import_already_split`). The new import is a client import of its own and starts on 25 credits and one per photograph, refused as the start is with `409` and `credits_insufficient`.',
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
    409: {
      description: 'Split already, the import is abandoned, or the credits left do not cover it',
      content: errorContent,
    },
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

const libraryPartContent = z
  .discriminatedUnion('part', [
    instructionsPartDetailSchema
      .extend({ proposal: instructionsProposalSchema.nullable() })
      .meta({ id: 'InstructionsLibraryPart' }),
    risksPartDetailSchema
      .extend({ proposal: risksProposalSchema.nullable() })
      .meta({ id: 'RisksLibraryPart' }),
  ])
  .meta({ id: 'ImportLibraryPart' });

export const listImportLibraryPartsRoute = createRoute({
  method: 'get',
  path: '/imports/{importId}/library-parts',
  operationId: 'listImportLibraryParts',
  summary: "A client import's proposals for the library",
  description:
    "One part per domain whose own instructions the sorting found (ADR 034), `instructions_ssm` and `instructions_su`, and `risk_evaluations` when it found a risk assessment (ADR 036), each read by a request of its own once the client proposal is ready: its status (`reading`, `to_review`, `nothing_new`, `failed` with `failureReason`, `confirmed`), the proposal from `to_review` on (null before, and once dropped with the import's, 30 days after the client), the member's changes and the version to save on, the counts of identical, similar, new and unread instructions, `positionPosts` (the client post each post the themes name is, as the changes name posts), `expiresAt` (14 days after the client's confirmation, past which a part is no longer confirmed), and `credits`, its readings net of those given back. `posts` are the posts an instruction can apply to: the client proposal's, by their id, with the job position each became once the client is confirmed, and the client's other active posts by their id. The risk evaluations' part, discriminated by `part`, has no `domain`; its proposal is a `RisksProposal`, its changes are by sheet, its counts are of sheets (`unread`, those with no factor read), and `postReferences` gives, by a post's name as the sheets write it, the client post it is, as the changes name posts; `existingFactors` gives the factors the client's sheets have now, by job position and, for a client-level sheet, by the sheet's key, which confirming follows where the member made no choice (null while the import has no client); and `libraryNames` gives every entry of the risk library, archived ones included, by id, name and whether it is archived, since a new entry's name is none of theirs (empty without a proposal). `usage`, the models' cost at list price and tokens, is served outside production and, in production, only to a platform admin. An empty list for an employee import or a pack with neither own instructions nor a risk assessment.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: importParams },
  responses: {
    200: {
      description: 'The parts',
      content: {
        'application/json': {
          schema: z
            .object({ parts: z.array(libraryPartContent), posts: z.array(importLibraryPostSchema) })
            .meta({ id: 'ImportLibraryPartsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchImport,
    ...membershipErrors,
  },
});

export const saveImportLibraryPartChangesRoute = createRoute({
  method: 'put',
  path: '/imports/{importId}/library-parts/{part}/changes',
  operationId: 'saveImportLibraryPartChanges',
  summary: "Save the member's review of a library part",
  description:
    "Replaces the part's changes. An instructions part's are by the proposed instruction's key: `included` false leaves it out, `title`, `category` (one of the part's domain), `choice` for a similar instruction (`use_existing` or `add_new`), `posts` in place of those the themes give, and `body`, the text edited, held to the body's schema. The risk evaluations' are `sheets`, by the sheet's key (`RiskImportChanges`): `libraryName`, `library` (`use_existing` or `add_new`, only for a post's sheet similar to an entry: a post's new sheet always goes to the library and a client-level one never does), `posts`, `postChoices` and `existingChoice` (`append`, `replace`, `keep`), the three texts, and `factors` by the factor's key, a sheet's own or that of a plan row the reading placed on it (`unmatchedPlanRows[].sheet`), written only once `included` is true. Before the client is confirmed too. On the `version` the caller read, and answers the next. `400` for a key the proposal does not have, a category of the other domain, `library` for any other sheet, or another part's changes; `409` with `import_changed` when someone saved since, `import_part_not_ready` when the part is not `to_review` or `nothing_new`, `import_part_expired` 14 days after the client's confirmation.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: libraryPartParams,
    body: json(
      saveImportLibraryPartChangesRequestSchema.meta({
        id: 'SaveImportLibraryPartChangesRequest',
      })
    ),
  },
  responses: {
    200: { description: 'The new version', content: versionContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: { description: 'No such import, or no such part of it', content: errorContent },
    409: { description: 'Not ready, expired, or saved since it was read', content: errorContent },
    ...membershipErrors,
  },
});

export const confirmImportLibraryPartRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/library-parts/{part}/confirm',
  operationId: 'confirmImportLibraryPart',
  summary: 'Confirm a library part',
  description:
    "For the risk evaluations, in one transaction (`apply_risk_import`): creates the chosen library entries with their factors, measures, plan fields as defaults (a person named in one goes to the client only) and texts, creates each missing evaluation of the client, fills only its empty texts, and writes the reviewed factors, followed by the plan rows the member added as factors, onto each sheet's posts as the post's choice says, each pointing at the entry's factor it was added to or matched; it answers `createdProfileIds`, `evaluationIds` and `factors`. `409` with `evaluation_profile_name_taken` when a new entry's name is any entry's, archived ones included (with `issues` on `sheets.<key>.libraryName`); `422` with `import_incomplete` for a ticked factor without its component or classes (with `issues` on `sheets.<key>.factors.<key>`). For instructions, in one transaction (`apply_instruction_import`): creates a module with its first version for every new instruction and every similar one the member chose to add as new, takes the identical ones and the similar ones kept as they are, and applies each to its posts, skipping a post that applies it already, all as the member. Only after the client is confirmed: `409` with `import_client_unconfirmed` before (the app says \"Confirmă întâi clientul\"). The client import's own confirm never waits for its parts. `409` with `import_part_expired` 14 days after the client's confirmation, `import_part_not_ready`, `import_changed`, `instruction_title_taken` when a new module's title is an active module's (with `issues` on `instructions.<key>.title`), or `import_outdated` when a post or module the review named is gone. `422` with `import_incomplete` for a category of the other domain.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: libraryPartParams,
    body: json(
      confirmImportLibraryPartRequestSchema.meta({ id: 'ConfirmImportLibraryPartRequest' })
    ),
  },
  responses: {
    200: {
      description: 'The modules created and applied',
      content: {
        'application/json': {
          schema: z
            .union([
              confirmInstructionsPartResponseSchema.meta({
                id: 'ConfirmInstructionsPartResponse',
              }),
              confirmRisksPartResponseSchema.meta({ id: 'ConfirmRisksPartResponse' }),
            ])
            .meta({ id: 'ConfirmImportLibraryPartResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or body', content: errorContent },
    404: { description: 'No such import, or no such part of it', content: errorContent },
    409: {
      description:
        'The client is not confirmed, the part expired, is not ready or was saved since, a title is taken, or the client changed',
      content: errorContent,
    },
    422: { description: 'A value the library refuses', content: errorContent },
    ...membershipErrors,
  },
});

export const retryImportLibraryPartRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/library-parts/{part}/retry',
  operationId: 'retryImportLibraryPart',
  summary: 'Read a failed library part again',
  description:
    '"Citește din nou": a `failed` part of an import ready for review or confirmed goes back to `reading` under its next `attempt` and its message is sent again; the reading is charged again when its request is sent (25 credits for SSM, 10 for SU, 15 for the risk evaluations), and given back if it fails. The client proposal and the other part are untouched. `409` with `import_part_expired` 14 days after the client was confirmed, when it could no longer be confirmed, and `import_part_not_failed` otherwise; `503` with `import_unavailable` where the gateway, the extractor or the queue is missing.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: libraryPartParams },
  responses: {
    200: {
      description: 'The part, reading',
      content: {
        'application/json': {
          schema: z.object({ part: libraryPartContent }).meta({ id: 'ImportLibraryPartResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such import, or no such part of it', content: errorContent },
    409: { description: 'The part has not failed, or it expired', content: errorContent },
    ...membershipErrors,
    503: unavailable,
  },
});

const reportRefused = {
  description:
    'The account is not a member of an organization, or is a platform admin impersonating a member (`import_report_impersonated`)',
  content: errorContent,
} as const;

export const reportImportRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/report',
  operationId: 'reportImport',
  summary: 'Report a problem with an import',
  description:
    '"Raportează o problemă cu importul" (ADR 037): records when and by whom, a report again replacing both, and tells support, at most once in 10 minutes for the same import. What the member writes goes to the support widget, not here.',
  security: bearerSecurity,
  middleware: [requireAuth, allowWhileReadOnly, requireMembership] as const,
  request: { params: importParams },
  responses: {
    204: { description: 'Reported' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchImport,
    ...membershipErrors,
    403: reportRefused,
  },
});

export const reportImportLibraryPartRoute = createRoute({
  method: 'post',
  path: '/imports/{importId}/library-parts/{part}/report',
  operationId: 'reportImportLibraryPart',
  summary: 'Report a problem with a library part of an import',
  description:
    'As for the import: records when and by whom on the part, and tells support at most once in 10 minutes for the same part.',
  security: bearerSecurity,
  middleware: [requireAuth, allowWhileReadOnly, requireMembership] as const,
  request: { params: libraryPartParams },
  responses: {
    204: { description: 'Reported' },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such import, or no such part of it', content: errorContent },
    ...membershipErrors,
    403: reportRefused,
  },
});
