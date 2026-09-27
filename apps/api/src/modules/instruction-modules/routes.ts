import { createRoute, z } from '@hono/zod-openapi';
import {
  applyInstructionsRequestSchema,
  copyInstructionsRequestSchema,
  createInstructionModuleRequestSchema,
  instructionModuleFileLinkResponseSchema,
  instructionModuleListQuerySchema,
  instructionModuleListResponseSchema,
  instructionModuleResponseSchema,
  instructionsDecisionSchema,
  jobPositionResponseSchema,
  positionInstructionsResponseSchema,
  updateInstructionModuleRequestSchema,
  uploadInstructionModuleQuerySchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const moduleParams = z.object({ moduleId: z.uuid() });
const positionParams = z.object({ clientId: z.uuid(), jobPositionId: z.uuid() });

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const docxBody = {
  required: true,
  content: { [docxType]: { schema: z.string().openapi({ type: 'string', format: 'binary' }) } },
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
    'The library (ADR 012), by group and title, each module with its current version and how many current positions apply it. Archived modules are left out unless `archived=true`, which lists only them.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: instructionModuleListQuerySchema },
  responses: {
    200: { description: 'The modules', content: listContent },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const createInstructionModuleRoute = createRoute({
  method: 'post',
  path: '/instruction-modules',
  operationId: 'createInstructionModule',
  summary: 'Start a module from the skeleton',
  description:
    'A new module whose first version is the skeleton the app ships, in the house style, to be written in the editor. Titles are unique within the organization, ignoring case (reason `instruction_module_title_taken`).',
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
    201: { description: 'The module', content: moduleContent },
    400: { description: 'Invalid request body', content: errorContent },
    409: { description: 'The title is taken', content: errorContent },
    ...membershipErrors,
  },
});

export const uploadInstructionModuleRoute = createRoute({
  method: 'post',
  path: '/instruction-modules/upload',
  operationId: 'uploadInstructionModule',
  summary: 'Add a module from a Word file',
  description:
    'Takes the bytes of a `.docx`, up to 15 MB, as the body. The file is kept as it is apart from its fonts, which become the house font. The title is the `title` query parameter, else the first line of the file; the group is `group`, else a work activity. One file per request: the app uploads several by calling this once each.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: uploadInstructionModuleQuerySchema, body: docxBody },
  responses: {
    201: { description: 'The module', content: moduleContent },
    400: {
      description: 'Invalid query, or the body is not a Word document',
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
  summary: 'Read one module',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: moduleParams },
  responses: {
    200: { description: 'The module', content: moduleContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchModule,
    ...membershipErrors,
  },
});

export const updateInstructionModuleRoute = createRoute({
  method: 'patch',
  path: '/instruction-modules/{moduleId}',
  operationId: 'updateInstructionModule',
  summary: 'Rename, regroup, archive or restore a module',
  description:
    'Archiving is refused while a current position of any client applies the module (reason `instruction_module_applied`); an archived module leaves the pickers and takes no new file.',
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
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchModule,
    409: { description: 'The title is taken, or the module is applied', content: errorContent },
    ...membershipErrors,
  },
});

export const instructionModuleFileLinkRoute = createRoute({
  method: 'get',
  path: '/instruction-modules/{moduleId}/file-link',
  operationId: 'getInstructionModuleFileLink',
  summary: 'A short-lived link to the current file',
  description:
    'A signed link to the Word file of the current version, valid for a minute, named after the module. The editor loads it; a download saves it.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: moduleParams },
  responses: {
    200: {
      description: 'The link',
      content: {
        'application/json': {
          schema: instructionModuleFileLinkResponseSchema.meta({
            id: 'InstructionModuleFileLinkResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchModule,
    ...membershipErrors,
  },
});

export const saveInstructionModuleFileRoute = createRoute({
  method: 'put',
  path: '/instruction-modules/{moduleId}/file',
  operationId: 'saveInstructionModuleFile',
  summary: 'Store the next version of the file',
  description:
    'Takes the bytes of a `.docx`, up to 15 MB, as the body: what the editor saves, or a file uploaded again. Nothing changes in place; every save is the next version, and documents generated before keep citing the one they annexed. Refused on an archived module (reason `instruction_module_archived`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: moduleParams, body: docxBody },
  responses: {
    200: { description: 'The module with its new version', content: moduleContent },
    400: { description: 'Invalid path, or the body is not a Word document', content: errorContent },
    404: noSuchModule,
    409: { description: 'The module is archived', content: errorContent },
    ...membershipErrors,
  },
});

export const listPositionInstructionsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/instructions',
  operationId: 'listPositionInstructions',
  summary: 'List the modules a job position applies',
  description:
    'The modules by group and title, with the position’s decision: `needsInstructions` is null until decided, false when the post needs none beyond the common part, true while it applies modules (ADR 012).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: positionParams },
  responses: {
    200: { description: 'The modules and the decision', content: positionContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchJobPosition,
    ...membershipErrors,
  },
});

export const applyPositionInstructionsRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/instructions',
  operationId: 'applyPositionInstructions',
  summary: 'Set the modules a job position applies',
  description:
    'Replaces the set. Applying the first module decides that the position needs instructions; an empty set leaves it undecided again. An archived module is refused (reason `instruction_module_archived`).',
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
      description: 'Invalid path or request body, or a module is not in the library',
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
  description: 'Adds the modules of another position of the same client to this one’s.',
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
  summary: 'Say that a job position needs no module, or take that back',
  description:
    '`needsInstructions: false` says the post needs none beyond the common part; `null` reopens the question. `true` is decided by applying a module and is refused here (reason `instructions_decided_by_modules`); `false` while modules are applied is refused (reason `instructions_applied`).',
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
