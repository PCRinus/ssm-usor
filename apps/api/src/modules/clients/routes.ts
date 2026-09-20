import { createRoute, z } from '@hono/zod-openapi';
import {
  clientListResponseSchema,
  clientOwnerNotesResponseSchema,
  clientResponseSchema,
  createClientRequestSchema,
  listClientsQuerySchema,
  saveClientOwnerNotesRequestSchema,
  updateClientRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors, ownerErrors } from '../../lib/openapi';

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/clients',
  operationId: 'listClients',
  summary: "List the organization's clients or its leads, active or archived",
  description:
    'Paginated. `stage` chooses the clients, the default, or the leads, which only an owner may ask for (`403` otherwise); `status` chooses the active ones, the default, or the archived ones. Never both of either. One sort key at a time; "legalName" is the default.',
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
  summary: 'Read one client or lead, archived or not',
  description: 'A lead does not exist for a member who is not an owner.',
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
  summary: 'Create a client or a lead in the organization',
  description:
    '`stage` is `client` unless given. Only an owner creates a lead; anyone else gets `403`. A lead has no employees, job positions, workplaces or documentation set until it is promoted: those routes answer `409` with the reason `client_is_lead`.',
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
    409: {
      description:
        'The CUI is taken: `cui_taken`, `cui_taken_by_archived`, or `cui_taken_by_lead`, which is also the answer when the holder is a lead the caller cannot see',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateClientRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}',
  operationId: 'updateClient',
  summary: 'Replace what was entered about a client',
  description:
    "The same fields and rules as creating one, without the legal representative's name, which the document details own, and without the stage, which only promotion changes. A contact field that is left out stays as it is; `null` clears it. An archived client is not edited.",
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

const ownerNotesResponses = {
  200: {
    description: 'The notes; an empty body when none were written',
    content: {
      'application/json': {
        schema: clientOwnerNotesResponseSchema.meta({ id: 'ClientOwnerNotesResponse' }),
      },
    },
  },
  404: { description: 'The client does not exist in the organization', content: errorContent },
  ...ownerErrors,
};

export const getClientOwnerNotesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/owner-notes',
  operationId: 'getClientOwnerNotes',
  summary: "Read the owners' notes about a client or a lead",
  description:
    'Owners only, before and after promotion: the notes may hold prices and a negotiation.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: z.object({ clientId: z.uuid() }) },
  responses: {
    ...ownerNotesResponses,
    400: { description: 'Invalid path', content: errorContent },
  },
});

export const saveClientOwnerNotesRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/owner-notes',
  operationId: 'saveClientOwnerNotes',
  summary: "Replace the owners' notes about a client or a lead",
  description:
    'Owners only. Free text, up to 5000 characters. Nothing is written for an archived client.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    params: z.object({ clientId: z.uuid() }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: saveClientOwnerNotesRequestSchema.meta({ id: 'SaveClientOwnerNotesRequest' }),
        },
      },
    },
  },
  responses: {
    ...ownerNotesResponses,
    400: { description: 'Invalid path or request body', content: errorContent },
    409: { description: 'The client is archived', content: errorContent },
  },
});
