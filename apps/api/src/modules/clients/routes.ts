import { createRoute, z } from '@hono/zod-openapi';
import {
  clientListResponseSchema,
  clientResponseSchema,
  createClientRequestSchema,
  listClientsQuerySchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/clients',
  operationId: 'listClients',
  summary: "List the organization's active clients",
  description:
    'Paginated. Archived clients are never listed. One sort key at a time; "legalName" is the default.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: listClientsQuerySchema },
  responses: {
    200: {
      description: 'One page of active clients with the total count',
      content: {
        'application/json': {
          schema: clientListResponseSchema.meta({ id: 'ClientListResponse' }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const getClientRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}',
  operationId: 'getClient',
  summary: 'Read one client, archived or not',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: z.object({ clientId: z.uuid() }) },
  responses: {
    200: {
      description: 'The client',
      content: {
        'application/json': { schema: clientResponseSchema.meta({ id: 'ClientResponse' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
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
