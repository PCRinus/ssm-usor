import { createRoute } from '@hono/zod-openapi';
import {
  clientListResponseSchema,
  clientResponseSchema,
  createClientRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/clients',
  operationId: 'listClients',
  summary: "List the organization's active clients",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'Active clients ordered by legal name',
      content: {
        'application/json': {
          schema: clientListResponseSchema.meta({ id: 'ClientListResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});

export const createClientRoute = createRoute({
  method: 'post',
  path: '/clients',
  operationId: 'createClient',
  summary: 'Create a client in the organization',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createClientRequestSchema.meta({ id: 'CreateClientRequest' }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'The created client',
      content: {
        'application/json': { schema: clientResponseSchema.meta({ id: 'ClientResponse' }) },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    409: { description: 'A client with this CUI already exists', content: errorContent },
    ...membershipErrors,
  },
});
