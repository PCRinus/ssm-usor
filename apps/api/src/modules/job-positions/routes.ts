import { createRoute, z } from '@hono/zod-openapi';
import {
  jobPositionListResponseSchema,
  jobPositionRequestSchema,
  jobPositionResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const jobPositionParams = clientParams.extend({ jobPositionId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in the organization',
  content: errorContent,
};
const noSuchJobPosition = {
  description: 'The job position does not exist under this client',
  content: errorContent,
};
const jobPositionContent = {
  'application/json': { schema: jobPositionResponseSchema.meta({ id: 'JobPositionResponse' }) },
};
const jobPositionBody = {
  required: true,
  content: {
    'application/json': { schema: jobPositionRequestSchema.meta({ id: 'JobPositionRequest' }) },
  },
};

export const listJobPositionsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/job-positions',
  operationId: 'listJobPositions',
  summary: "List a client's job positions",
  description:
    'The posts the client employs people in (ADR 006), by name, each with the number of current employees in it. Archived positions are left out. Not paginated: a client has a handful.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The job positions',
      content: {
        'application/json': {
          schema: jobPositionListResponseSchema.meta({ id: 'JobPositionListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createJobPositionRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/job-positions',
  operationId: 'createJobPosition',
  summary: 'Add a job position to a client',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: jobPositionBody },
  responses: {
    201: { description: 'The job position', content: jobPositionContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchClient,
    409: {
      description:
        'The client is archived, or already has a position of this name (reason `job_position_name_taken`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateJobPositionRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/job-positions/{jobPositionId}',
  operationId: 'updateJobPosition',
  summary: 'Replace a job position',
  description:
    'Renaming a position never rewrites the contract title of the employees in it: their contracts have not changed.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: jobPositionParams, body: jobPositionBody },
  responses: {
    200: { description: 'The job position after the change', content: jobPositionContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchJobPosition,
    409: {
      description:
        'The client already has a position of this name (reason `job_position_name_taken`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const removeJobPositionRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/job-positions/{jobPositionId}',
  operationId: 'removeJobPosition',
  summary: 'Remove a job position',
  description:
    'A position no employee points at is deleted. One that people who have left still point at is archived instead: it leaves the lists and releases its name, and their history keeps it. Refused with the reason `job_position_held` while current employees are in it.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: jobPositionParams },
  responses: {
    204: { description: 'Deleted or archived' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchJobPosition,
    409: { description: 'Current employees are in this position', content: errorContent },
    ...membershipErrors,
  },
});
