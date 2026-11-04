import { createRoute, z } from '@hono/zod-openapi';
import {
  applyInstructionsRequestSchema,
  copyInstructionsRequestSchema,
  createInstructionModuleRequestSchema,
  instructionBodySchema,
  instructionModuleChoicesQuerySchema,
  instructionModuleChoicesResponseSchema,
  instructionModuleDownloadQuerySchema,
  instructionModuleListQuerySchema,
  instructionModuleListResponseSchema,
  instructionModuleResponseSchema,
  instructionModuleVersionResponseSchema,
  instructionPreviewRequestSchema,
  instructionsDecisionSchema,
  jobPositionResponseSchema,
  positionInstructionsQuerySchema,
  positionInstructionsResponseSchema,
  saveInstructionBodyResponseSchema,
  updateInstructionModuleRequestSchema,
} from '@ssm-usor/contracts';

import { allowWhileReadOnly } from '../../lib/access';
import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const moduleParams = z.object({ moduleId: z.uuid() });
const positionParams = z.object({ clientId: z.uuid(), jobPositionId: z.uuid() });

const versionParams = z.object({ moduleId: z.uuid(), versionId: z.uuid() });

const docxContent = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    schema: z.string().openapi({ type: 'string', format: 'binary' }),
  },
};

const noSuchModule = {
  description: 'The module does not exist in this organization',
  content: errorContent,
};
const noSuchJobPosition = {
  description: 'The job position does not exist under this client',
  content: errorContent,
};
const archivedClient = {
  description: 'The client is archived (reason `client_archived`)',
  content: errorContent,
};
const moduleContent = {
  'application/json': {
    schema: instructionModuleResponseSchema.meta({ id: 'InstructionModuleResponse' }),
  },
};
const bodyRequest = {
  required: true,
  content: {
    'application/json': { schema: instructionBodySchema.meta({ id: 'InstructionBody' }) },
  },
};
const listContent = {
  'application/json': {
    schema: instructionModuleListResponseSchema.meta({ id: 'InstructionModuleListResponse' }),
  },
};
const positionContent = {
  'application/json': {
    schema: positionInstructionsResponseSchema.meta({ id: 'PositionInstructionsResponse' }),
  },
};

export const listInstructionModulesRoute = createRoute({
  method: 'get',
  path: '/instruction-modules',
  operationId: 'listInstructionModules',
  summary: "List the organization's instruction modules",
  description:
    'A page of the library (ADR 012), each module with its current version and how many current positions apply it. `status=active` (the default) lists the modules in use, `status=archived` only the archived ones; `domain` lists the modules of one set only, `ssm` or `su`. Sorted by `title` by default, or by `group` (the categories in their order, then the title), `version` (when the current version was saved) or `appliedCount`; the id breaks ties so pages never overlap. A page past the end comes back empty with the real total. Modules without a version are left out.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: instructionModuleListQuerySchema },
  responses: {
    200: { description: 'The modules', content: listContent },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const listInstructionModuleChoicesRoute = createRoute({
  method: 'get',
  path: '/instruction-modules/choices',
  operationId: 'listInstructionModuleChoices',
  summary: 'List every active instruction module to choose from',
  description:
    "The library's modules in use, unpaged, for a picker: each with its title, category (`group`) and domain, by domain, category and title. `domain` lists the modules of one set only, `ssm` or `su`.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: instructionModuleChoicesQuerySchema },
  responses: {
    200: {
      description: 'The modules in use',
      content: {
        'application/json': {
          schema: instructionModuleChoicesResponseSchema.meta({
            id: 'InstructionModuleChoicesResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const createInstructionModuleRoute = createRoute({
  method: 'post',
  path: '/instruction-modules',
  operationId: 'createInstructionModule',
  summary: 'Create a module with its first version',
  description:
    "A new module of the `domain` given, an occupational safety one by default, whose first version is `body` (ADR 034): a module is stored on its first save, never empty. The category (`group`) is one of the domain's (reason `instruction_module_category_domain`). Titles are unique within the organization, ignoring case and across both domains (reason `instruction_module_title_taken`).",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createInstructionModuleRequestSchema.meta({
            id: 'CreateInstructionModuleRequest',
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The module and its body', content: moduleContent },
    400: {
      description: 'Invalid request body, or a category of the other domain',
      content: errorContent,
    },
    409: { description: 'The title is taken', content: errorContent },
    ...membershipErrors,
  },
});

export const getInstructionModuleRoute = createRoute({
  method: 'get',
  path: '/instruction-modules/{moduleId}',
  operationId: 'getInstructionModule',
  summary: 'Read one module with its current body',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: moduleParams },
  responses: {
    200: { description: 'The module and its current body', content: moduleContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchModule,
    ...membershipErrors,
  },
});

export const updateInstructionModuleRoute = createRoute({
  method: 'patch',
  path: '/instruction-modules/{moduleId}',
  operationId: 'updateInstructionModule',
  summary: 'Rename, recategorize, move to the other domain, archive or restore a module',
  description:
    'Archiving is refused while a current position of any client applies the module (reason `instruction_module_applied`); an archived module leaves the pickers and takes no new version. Changing the domain is refused while a current position applies the module (reason `instruction_module_domain_applied`), since the position applied it as part of its decision for the other set. The category after the change must be one of the domain after it (reason `instruction_module_category_domain`): moving a module to the other domain names its new category too.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: moduleParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateInstructionModuleRequestSchema.meta({
            id: 'UpdateInstructionModuleRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The module after the change', content: moduleContent },
    400: {
      description: 'Invalid path or request body, or a category of the other domain',
      content: errorContent,
    },
    404: noSuchModule,
    409: {
      description:
        'The title is taken, or the module is applied and can be neither archived nor moved to the other domain',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const saveInstructionBodyRoute = createRoute({
  method: 'put',
  path: '/instruction-modules/{moduleId}/body',
  operationId: 'saveInstructionBody',
  summary: "Save a module's text as its next version",
  description:
    'Stores the body as the next version; nothing changes in place, and documents generated before keep citing the version they annexed. The body is stored with each run of whitespace made one space; one that differs from the current version only in whitespace stores nothing and answers `changed: false` with the current version, so that it marks no document behind (ADR 034). Refused on an archived module (reason `instruction_module_archived`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: moduleParams, body: bodyRequest },
  responses: {
    200: {
      description: 'The module with its current version and body',
      content: {
        'application/json': {
          schema: saveInstructionBodyResponseSchema.meta({ id: 'SaveInstructionBodyResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchModule,
    409: { description: 'The module is archived', content: errorContent },
    ...membershipErrors,
  },
});

export const getInstructionModuleVersionRoute = createRoute({
  method: 'get',
  path: '/instruction-modules/{moduleId}/versions/{versionId}',
  operationId: 'getInstructionModuleVersion',
  summary: 'Read one version of a module with its body',
  description: 'An earlier version is what a document annexed; it never changes.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: versionParams },
  responses: {
    200: {
      description: 'The version and its body',
      content: {
        'application/json': {
          schema: instructionModuleVersionResponseSchema.meta({
            id: 'InstructionModuleVersionResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such module, or no such version of it', content: errorContent },
    ...membershipErrors,
  },
});

export const downloadInstructionModuleRoute = createRoute({
  method: 'get',
  path: '/instruction-modules/{moduleId}/download',
  operationId: 'downloadInstructionModule',
  summary: 'Download a version as the annex it prints',
  description:
    "The current version, or `versionId`, rendered by the annex template as annex 1: its title page, then its text under the header of the own instructions, with the organization as the provider and a placeholder where a client's name goes. A client's revision prints its annexes as in the binder at `GET /documents/{documentId}/revisions/{revisionId}/annexes/{number}`.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: moduleParams, query: instructionModuleDownloadQuerySchema },
  responses: {
    200: { description: 'The Word file, named in `Content-Disposition`', content: docxContent },
    400: { description: 'Invalid path or query', content: errorContent },
    404: { description: 'No such module, or no such version of it', content: errorContent },
    ...membershipErrors,
  },
});

export const previewInstructionRoute = createRoute({
  method: 'post',
  path: '/instruction-modules/preview',
  operationId: 'previewInstruction',
  summary: 'Render a body as the annex it would print, without saving it',
  description:
    "For the Word viewer while a module is written: the posted title, domain and body rendered by the annex template as annex 1, with the organization as the provider, today's date and a placeholder where a client's name goes. Nothing is stored.",
  security: bearerSecurity,
  middleware: [requireAuth, allowWhileReadOnly, requireMembership] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: instructionPreviewRequestSchema.meta({ id: 'InstructionPreviewRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The Word file', content: docxContent },
    400: { description: 'Invalid request body', content: errorContent },
    ...membershipErrors,
  },
});

export const listPositionInstructionsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/instructions',
  operationId: 'listPositionInstructions',
  summary: 'List the modules a job position applies in one domain',
  description:
    'The modules of `domain`, occupational safety by default, by group and title, with the position’s decision for that domain: `needsInstructions` is null until decided, false when the post needs none beyond the common part, true while it applies modules of the domain (ADR 012). A position decides about each domain apart.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: positionParams, query: positionInstructionsQuerySchema },
  responses: {
    200: { description: 'The modules and the decision', content: positionContent },
    400: { description: 'Invalid path or query', content: errorContent },
    404: noSuchJobPosition,
    ...membershipErrors,
  },
});

export const applyPositionInstructionsRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/instructions',
  operationId: 'applyPositionInstructions',
  summary: 'Set the modules a job position applies in one domain',
  description:
    'Replaces the set of `domain`, occupational safety by default, and leaves the other domain’s as it is. Applying the first module decides that the position needs instructions in that domain; an empty set leaves it undecided again. A module of the other domain is refused (reason `instruction_module_other_domain`), and so is an archived module (reason `instruction_module_archived`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: positionParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: applyInstructionsRequestSchema.meta({ id: 'ApplyInstructionsRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The modules and the decision', content: positionContent },
    400: {
      description:
        'Invalid path or request body, or a module is not in the library or not of the domain',
      content: errorContent,
    },
    404: noSuchJobPosition,
    409: { description: 'A module is archived, or the client is archived', content: errorContent },
    ...membershipErrors,
  },
});

export const copyPositionInstructionsRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/instructions/copy',
  operationId: 'copyPositionInstructions',
  summary: "Apply another position's modules too",
  description:
    'Adds the modules of `domain`, occupational safety by default, of another position of the same client to this one’s.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: positionParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: copyInstructionsRequestSchema.meta({ id: 'CopyInstructionsRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The modules and the decision', content: positionContent },
    400: {
      description: 'Invalid path or request body, or the source is not a position of this client',
      content: errorContent,
    },
    404: noSuchJobPosition,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const decidePositionInstructionsRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/instructions-decision',
  operationId: 'decidePositionInstructions',
  summary: 'Say that a job position needs no module of a domain, or take that back',
  description:
    'For `domain`, occupational safety by default: `needsInstructions: false` says the post needs none beyond the common part; `null` reopens the question. `true` is decided by applying a module and is refused here (reason `instructions_decided_by_modules`); `false` while modules of the domain are applied is refused (reason `instructions_applied`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: positionParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: instructionsDecisionSchema.meta({ id: 'InstructionsDecision' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The job position after the change',
      content: {
        'application/json': {
          schema: jobPositionResponseSchema.meta({ id: 'JobPositionResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchJobPosition,
    409: { description: 'Modules are applied, or the client is archived', content: errorContent },
    ...membershipErrors,
  },
});
