import { createRoute, z } from '@hono/zod-openapi';
import {
  riskZoneNamesQuerySchema,
  riskZoneNamesResponseSchema,
  riskZoneRequestSchema,
  riskZonesResponseSchema,
  updateRiskZonesStateRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import {
  bearerSecurity,
  clientNotFoundResponse,
  clientParams,
  errorContent,
  membershipErrors,
} from '../../lib/openapi';

const zoneParams = clientParams.extend({ zoneId: z.uuid() });

const zonesContent = {
  'application/json': { schema: riskZonesResponseSchema.meta({ id: 'RiskZonesResponse' }) },
};

const zoneBody = {
  required: true,
  content: {
    'application/json': { schema: riskZoneRequestSchema.meta({ id: 'RiskZoneRequest' }) },
  },
};

const invalidZone = {
  description:
    'Invalid path or body: no linked factor and no measures of its own (`measures`), a workplace that is not a current one of this client (`workplaceId`), or a factor that is not one of its (`factorIds`)',
  content: errorContent,
};

const noSuchZone = {
  description: 'The zone does not exist under this client',
  content: errorContent,
};

const zonesAnswer =
  'Answers with all of the client’s zones, its state and the suggestions, as reading them does.';

export const listRiskZonesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/risk-zones',
  operationId: 'listRiskZones',
  summary: "Read a client's zones of high and specific risk",
  description:
    'The zones in the order they were added, each with its workplace and its linked factors, the highest level first, with their level, evaluation and prevention measures as the evaluation holds them now; the client’s `state`; `factors`, every factor of current posts and client-level evaluations a zone may link, whatever its level, in the evaluations’ order; and the `suggestions` (ADR 045): the unacceptable factors (level above 3) of current posts and client-level evaluations that no zone links yet, grouped by the position’s work zone, or the position’s name without one, or the evaluation’s title outside the posts, each offered as a zone named after its group. `existingZoneId` names a zone of the client with that name already. Nothing is saved until a zone is added.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: { description: 'The zones, the state and the suggestions', content: zonesContent },
    400: { description: 'Invalid path', content: errorContent },
    404: clientNotFoundResponse,
    ...membershipErrors,
  },
});

export const createRiskZoneRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/risk-zones',
  operationId: 'createRiskZone',
  summary: 'Add a zone of high and specific risk',
  description: `A zone links at least one of the client’s risk factors or has measures of its own. Adding one sets the state to \`listed\`, replacing a declaration that there are none. Two zones of a client differ in name, ignoring case and spaces (reason \`risk_zone_name_taken\`). ${zonesAnswer}`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: zoneBody },
  responses: {
    201: { description: 'The zones after the change', content: zonesContent },
    400: invalidZone,
    404: clientNotFoundResponse,
    409: {
      description: 'The client is archived or a lead, or the name is taken',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateRiskZoneRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/risk-zones/{zoneId}',
  operationId: 'updateRiskZone',
  summary: 'Replace a zone and its linked factors',
  description: `Every field is replaced, and \`factorIds\` becomes the zone’s whole set of linked factors. A workplace archived after the zone named it may be sent again. ${zonesAnswer}`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: zoneParams, body: zoneBody },
  responses: {
    200: { description: 'The zones after the change', content: zonesContent },
    400: invalidZone,
    404: noSuchZone,
    409: {
      description: 'The client is archived, or the name is taken (`risk_zone_name_taken`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const removeRiskZoneRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/risk-zones/{zoneId}',
  operationId: 'removeRiskZone',
  summary: 'Delete a zone',
  description: `Its links go with it; the factors stay. Deleting the last zone sets the state back to \`undecided\`. ${zonesAnswer}`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: zoneParams },
  responses: {
    200: { description: 'The zones after the change', content: zonesContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchZone,
    409: { description: 'The client is archived (`client_archived`)', content: errorContent },
    ...membershipErrors,
  },
});

export const updateRiskZonesStateRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/risk-zones-state',
  operationId: 'updateRiskZonesState',
  summary: 'Say whether a client has zones of high and specific risk',
  description: `\`none\` declares that the client has no zones of high and specific risk, so document 9.2 says so; \`undecided\` withdraws the declaration. \`listed\` is never sent: the database sets it while the client has a zone, and both values are refused meanwhile (\`409\`, reason \`risk_zones_listed\`). ${zonesAnswer}`,
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateRiskZonesStateRequestSchema.meta({ id: 'UpdateRiskZonesStateRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The zones after the change', content: zonesContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: clientNotFoundResponse,
    409: {
      description: 'The client is archived (`client_archived`) or has zones (`risk_zones_listed`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const riskZoneNamesRoute = createRoute({
  method: 'get',
  path: '/risk-zone-names',
  operationId: 'listRiskZoneNames',
  summary: 'The zone names the organization used before',
  description:
    'The distinct names of the organization’s zones under clients that are not archived, leaving out those of `exceptClientId`, ignoring case and spaces, each with the own measures of its most recently changed zone, in Romanian alphabetical order, at most 200. The zone dialog offers them as the name, and the measures to start from.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: riskZoneNamesQuerySchema },
  responses: {
    200: {
      description: 'The names',
      content: {
        'application/json': {
          schema: riskZoneNamesResponseSchema.meta({ id: 'RiskZoneNamesResponse' }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});
