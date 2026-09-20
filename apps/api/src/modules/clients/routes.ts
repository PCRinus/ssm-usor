import { createRoute, z } from '@hono/zod-openapi';
import {
  clientListResponseSchema,
  clientResponseSchema,
  createClientRequestSchema,
  listClientsQuerySchema,
  updateClientRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors, ownerErrors } from '../../lib/openapi';

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/clients',
  operationId: 'listClients',
  summary: "List the organization's clients, active or archived",
  description:
    'Paginated. `status` chooses the active clients, the default, or the archived ones; never both. One sort key at a time; "legalName" is the default.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: listClientsQuerySchema },
  responses: {
    200: {
      description: 'One page of clients with the total count',
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

export const updateClientRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}',
  operationId: 'updateClient',
  summary: 'Replace what was entered about a client',
  description:
    "The same fields and rules as creating one, without the legal representative's name, which the document details own. An archived client is not edited.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: z.object({ clientId: z.uuid() }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateClientRequestSchema.meta({ id: 'UpdateClientRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The client after the change',
      content: {
        'application/json': { schema: clientResponseSchema.meta({ id: 'ClientResponse' }) },
      },
    },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    409: {
      description: 'Another client has this CUI, or the client is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

const archivingResponses = {
  200: {
    description: 'The client after the change',
    content: {
      'application/json': { schema: clientResponseSchema.meta({ id: 'ClientResponse' }) },
    },
  },
  400: { description: 'Invalid path', content: errorContent },
  404: { description: 'The client does not exist in the organization', content: errorContent },
  ...ownerErrors,
};

export const archiveClientRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/archive',
  operationId: 'archiveClient',
  summary: 'Archive a client',
  description:
    'Owners only. The client leaves the list of active clients; its employees, job positions and documents stay as they are and stay readable. Archiving an archived client changes nothing.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: z.object({ clientId: z.uuid() }) },
  responses: archivingResponses,
});

export const restoreClientRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/restore',
  operationId: 'restoreClient',
  summary: 'Bring an archived client back',
  description: 'Owners only. Restoring an active client changes nothing.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: z.object({ clientId: z.uuid() }) },
  responses: archivingResponses,
});
