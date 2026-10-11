import { createRoute, z } from '@hono/zod-openapi';
import {
  clientFireSafetyResponseSchema,
  fireEquipmentListResponseSchema,
  fireEquipmentRequestSchema,
  fireEquipmentResponseSchema,
  fireInstallationListResponseSchema,
  fireInstallationRequestSchema,
  fireInstallationResponseSchema,
  fireSubstanceRequestSchema,
  fireSubstanceResponseSchema,
  fireSubstancesResponseSchema,
  fireSubstancesStateResponseSchema,
  updateClientFireSafetyRequestSchema,
  updateFireSubstancesStateRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const equipmentParams = clientParams.extend({ equipmentId: z.uuid() });
const installationParams = clientParams.extend({ installationId: z.uuid() });
const substanceParams = clientParams.extend({ substanceId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in the organization',
  content: errorContent,
};
const noSuchEquipment = {
  description: 'The client or the equipment does not exist',
  content: errorContent,
};
const noSuchInstallation = {
  description: 'The client or the installation does not exist',
  content: errorContent,
};
const noSuchSubstance = {
  description: 'The client or the substance does not exist',
  content: errorContent,
};
const refusedClient = {
  description: 'The client is archived (reason `client_archived`) or a lead (`client_is_lead`)',
  content: errorContent,
};
const invalidBody = {
  description:
    'Invalid path or body, or `workplaceId` is not an active workplace of this client (an issue on `workplaceId`)',
  content: errorContent,
};

const fireSafetyContent = {
  'application/json': {
    schema: clientFireSafetyResponseSchema.meta({ id: 'ClientFireSafetyResponse' }),
  },
};
const equipmentContent = {
  'application/json': {
    schema: fireEquipmentResponseSchema.meta({ id: 'FireEquipmentResponse' }),
  },
};
const equipmentBody = {
  required: true,
  content: {
    'application/json': {
      schema: fireEquipmentRequestSchema.meta({ id: 'FireEquipmentRequest' }),
    },
  },
};
const installationContent = {
  'application/json': {
    schema: fireInstallationResponseSchema.meta({ id: 'FireInstallationResponse' }),
  },
};
const installationBody = {
  required: true,
  content: {
    'application/json': {
      schema: fireInstallationRequestSchema.meta({ id: 'FireInstallationRequest' }),
    },
  },
};

export const getClientFireSafetyRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/fire-safety',
  operationId: 'getClientFireSafety',
  summary: "Read a client's fire-safety training schedule, smoking policy and waste",
  description:
    'Every field is null and `exists` false until the first save, so the app can open the form on its starting values (ADR 018). A row the substances state alone created does not count as saved.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: { description: 'The fire-safety facts', content: fireSafetyContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const updateClientFireSafetyRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/fire-safety',
  operationId: 'updateClientFireSafety',
  summary: "Replace a client's fire-safety training schedule, smoking policy and waste",
  description:
    'Created on the first save. A field left out or null is cleared, and `wasteKinds` left out is empty.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateClientFireSafetyRequestSchema.meta({
            id: 'UpdateClientFireSafetyRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The fire-safety facts after the change', content: fireSafetyContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchClient,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const listFireEquipmentRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/fire-equipment',
  operationId: 'listFireEquipment',
  summary: "List a client's fire-fighting equipment",
  description:
    'Every unit on an active workplace, by workplace in the order of the workplaces list, then by kind, agent, capacity and label.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The equipment',
      content: {
        'application/json': {
          schema: fireEquipmentListResponseSchema.meta({ id: 'FireEquipmentListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createFireEquipmentRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/fire-equipment',
  operationId: 'createFireEquipment',
  summary: 'Add a unit of fire-fighting equipment to a workplace',
  description:
    'An extinguisher carries its agent and its capacity in kilograms or litres, and may be wheeled; other equipment carries neither.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: equipmentBody },
  responses: {
    201: { description: 'The created unit', content: equipmentContent },
    400: invalidBody,
    404: noSuchClient,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const updateFireEquipmentRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/fire-equipment/{equipmentId}',
  operationId: 'updateFireEquipment',
  summary: 'Replace a unit of fire-fighting equipment',
  description: 'The unit may move to another active workplace of the same client.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: equipmentParams, body: equipmentBody },
  responses: {
    200: { description: 'The unit after the change', content: equipmentContent },
    400: invalidBody,
    404: noSuchEquipment,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const deleteFireEquipmentRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/fire-equipment/{equipmentId}',
  operationId: 'deleteFireEquipment',
  summary: 'Delete a unit of fire-fighting equipment',
  description:
    'A unit taken away is deleted, not archived; issued documents keep what they printed.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: equipmentParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEquipment,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const listFireInstallationsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/fire-installations',
  operationId: 'listFireInstallations',
  summary: "List a client's fire-safety installations",
  description:
    'Every installation on an active workplace, by workplace in the order of the workplaces list, then by kind and description.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The installations',
      content: {
        'application/json': {
          schema: fireInstallationListResponseSchema.meta({
            id: 'FireInstallationListResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createFireInstallationRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/fire-installations',
  operationId: 'createFireInstallation',
  summary: 'Add a fire-safety installation to a workplace',
  description: 'An installation of the kind `other` needs a description.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: installationBody },
  responses: {
    201: { description: 'The created installation', content: installationContent },
    400: invalidBody,
    404: noSuchClient,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const updateFireInstallationRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/fire-installations/{installationId}',
  operationId: 'updateFireInstallation',
  summary: 'Replace a fire-safety installation',
  description: 'The installation may move to another active workplace of the same client.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: installationParams, body: installationBody },
  responses: {
    200: { description: 'The installation after the change', content: installationContent },
    400: invalidBody,
    404: noSuchInstallation,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const deleteFireInstallationRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/fire-installations/{installationId}',
  operationId: 'deleteFireInstallation',
  summary: 'Delete a fire-safety installation',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: installationParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchInstallation,
    409: refusedClient,
    ...membershipErrors,
  },
});

const substanceContent = {
  'application/json': {
    schema: fireSubstanceResponseSchema.meta({ id: 'FireSubstanceResponse' }),
  },
};
const substanceBody = {
  required: true,
  content: {
    'application/json': {
      schema: fireSubstanceRequestSchema.meta({ id: 'FireSubstanceRequest' }),
    },
  },
};

export const listFireSubstancesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/fire-substances',
  operationId: 'listFireSubstances',
  summary: "Read a client's dangerous substances and whether it uses any",
  description:
    '`state` is `undecided` until a member says the client uses none (`none`) or lists them (`listed`); the entries are in the order they were added (ADR 018).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The state and the entries',
      content: {
        'application/json': {
          schema: fireSubstancesResponseSchema.meta({ id: 'FireSubstancesResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const updateFireSubstancesStateRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/fire-substances/state',
  operationId: 'updateFireSubstancesState',
  summary: 'Say whether a client uses dangerous substances',
  description:
    '`none` declares that the client uses none, `listed` that it lists them below, `undecided` leaves the question open again. Only `listed` is accepted while the client has entries (`409`, reason `substances_listed`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateFireSubstancesStateRequestSchema.meta({
            id: 'UpdateFireSubstancesStateRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The state after the change',
      content: {
        'application/json': {
          schema: fireSubstancesStateResponseSchema.meta({ id: 'FireSubstancesStateResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchClient,
    409: {
      description:
        'The client is archived (`client_archived`) or a lead (`client_is_lead`), or still has entries (`substances_listed`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const createFireSubstanceRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/fire-substances',
  operationId: 'createFireSubstance',
  summary: "Add a dangerous substance to a client's list",
  description:
    'The name, the CLP classification and the quantity are required; the other texts are copied from the safety data sheet and may be left out. Only under a client whose state is `listed`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: substanceBody },
  responses: {
    201: { description: 'The created entry', content: substanceContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchClient,
    409: {
      description:
        'The client is archived (`client_archived`) or a lead (`client_is_lead`), or does not list its substances (`substances_not_listed`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateFireSubstanceRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/fire-substances/{substanceId}',
  operationId: 'updateFireSubstance',
  summary: 'Replace a dangerous substance',
  description: 'A text left out or null is cleared.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: substanceParams, body: substanceBody },
  responses: {
    200: { description: 'The entry after the change', content: substanceContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchSubstance,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const deleteFireSubstanceRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/fire-substances/{substanceId}',
  operationId: 'deleteFireSubstance',
  summary: 'Delete a dangerous substance',
  description:
    'Deleting the last entry leaves the state `listed`, which blocks the fire-safety set until an entry is added or the client declares it uses none.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: substanceParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchSubstance,
    409: refusedClient,
    ...membershipErrors,
  },
});
