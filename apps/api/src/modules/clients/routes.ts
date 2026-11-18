import { createRoute } from '@hono/zod-openapi';
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
import {
  authErrors,
  bearerSecurity,
  clientNotFoundResponse,
  clientParams,
  errorContent,
  membershipErrors,
  ownerErrors,
} from '../../lib/openapi';

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/clients',
  operationId: 'listClients',
  summary: "List the organization's clients or its leads, active or archived",
  description:
    'Paginated. `stage` chooses the clients, the default, or the leads, which only an owner may ask for (`403` otherwise); `status` chooses the active ones, the default, or the archived ones. Never both of either. `q` matches every term against the legal name, the CUI and the locality, ignoring diacritics, legal forms and an RO before the CUI. The filters (`documentation`, `fireSafetyDocumentation`, `training`, `attention`, `county`, `contract`) take one value or the parameter repeated; within one any value matches, across them every one must. They apply to clients only (`400` for leads), and `contract` only for an owner (`403` otherwise). The training filters never match an archived client, whose employees are not followed for training. Leads take `contractState` instead, the state of their service contract, which clients refuse (`400`). One sort key at a time; "legalName" is the default. Clients sort by "legalName", "cui", "currentEmployeeCount", "documentation", "fireSafetyDocumentation", "training", "nextTrainingDueOn" or "clientSince", and leads by "legalName", "cui", "declaredEmployeeCount", "serviceContractState" or "createdAt" (`400` otherwise). "documentation" and "fireSafetyDocumentation" sort by the state of the set and then the number of issued documents, "training" by urgency, "nextTrainingDueOn" by the nearest due date with clients without one last, and "clientSince" by when the company became a client; "declaredEmployeeCount" puts leads that declared none last, and "serviceContractState" sorts in the order of the states and, within a state and either way, puts first the contract that reached it earliest. A client carries where each of its documentation sets and the training of its employees stand; a lead carries null for these, and its contract state instead, with the date it reached it and when its last return link expires. `unfilteredTotal` counts the list with no search and no filter.',
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
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The client',
      content: {
        'application/json': { schema: clientResponseSchema.meta({ id: 'ClientResponse' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: clientNotFoundResponse,
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
    params: clientParams,
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
    404: clientNotFoundResponse,
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
  404: clientNotFoundResponse,
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
  request: { params: clientParams },
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
  request: { params: clientParams },
  responses: archivingResponses,
});

export const deleteClientRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}',
  operationId: 'deleteClient',
  summary: 'Delete an archived client outright, with everything under it',
  description:
    "For testing with real documents, where an archived client's CUI keeps the same company from being added or imported again. Outside production any member may; in production a platform admin only (`403` otherwise), as `canDelete` on the client says. Only an archived client (`409` with the reason `client_not_archived` otherwise). Its employees, positions, workplaces, trainings and their signatures, tests, sheets, documents, files, risk evaluations, fire-safety data, participants and imports are deleted with it, and then its stored files, as far as the storage answers. Nothing is kept to restore it.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    204: { description: 'The client is deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: clientNotFoundResponse,
    409: { description: 'The client is not archived', content: errorContent },
    ...authErrors,
    403: {
      description:
        'The account is not a member of an organization, or this is production and the caller is not a platform admin',
      content: errorContent,
    },
  },
});

export const promoteLeadRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/promote',
  operationId: 'promoteLead',
  summary: 'Turn a lead into a client',
  description:
    'Owners only, and one way: the whole team sees the company from then on, and its safety records can start. The database records who and when. Promoting a client changes nothing. An archived lead is restored first.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: clientParams },
  responses: {
    ...archivingResponses,
    409: { description: 'The lead is archived', content: errorContent },
  },
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
  404: clientNotFoundResponse,
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
  request: { params: clientParams },
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
    params: clientParams,
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
