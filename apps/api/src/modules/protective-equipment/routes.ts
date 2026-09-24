import { createRoute, z } from '@hono/zod-openapi';
import {
  copyEquipmentRequestSchema,
  equipmentEntryRequestSchema,
  equipmentEntryResponseSchema,
  equipmentListResponseSchema,
  equipmentSuggestionsQuerySchema,
  equipmentSuggestionsResponseSchema,
  jobPositionResponseSchema,
  protectiveEquipmentDecisionSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const positionParams = z.object({ clientId: z.uuid(), jobPositionId: z.uuid() });
const entryParams = positionParams.extend({ entryId: z.uuid() });

const noSuchJobPosition = {
  description: 'The job position does not exist under this client',
  content: errorContent,
};
const noSuchEntry = {
  description: 'The entry does not exist on this job position',
  content: errorContent,
};
const listContent = {
  'application/json': { schema: equipmentListResponseSchema.meta({ id: 'EquipmentListResponse' }) },
};
const entryContent = {
  'application/json': {
    schema: equipmentEntryResponseSchema.meta({ id: 'EquipmentEntryResponse' }),
  },
};
const entryBody = {
  required: true,
  content: {
    'application/json': {
      schema: equipmentEntryRequestSchema.meta({ id: 'EquipmentEntryRequest' }),
    },
  },
};
const archivedClient = {
  description: 'The client is archived (reason `client_archived`)',
  content: errorContent,
};

export const listEquipmentRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/equipment',
  operationId: 'listEquipment',
  summary: "List a job position's protective equipment",
  description:
    'The entries of the position in the order they were added, with the position’s decision: `needsProtectiveEquipment` is null until decided, false when the post needs none, true while it has entries (ADR 011).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: positionParams },
  responses: {
    200: { description: 'The entries and the decision', content: listContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchJobPosition,
    ...membershipErrors,
  },
});

export const createEquipmentEntryRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/equipment',
  operationId: 'createEquipmentEntry',
  summary: 'Add an equipment entry to a job position',
  description:
    'The first entry decides that the position needs equipment. Inventory carries a duration of use in months; a consumable carries none.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: positionParams, body: entryBody },
  responses: {
    201: { description: 'The entry', content: entryContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchJobPosition,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const updateEquipmentEntryRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/equipment/{entryId}',
  operationId: 'updateEquipmentEntry',
  summary: 'Replace an equipment entry',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: entryParams, body: entryBody },
  responses: {
    200: { description: 'The entry after the change', content: entryContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchEntry,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const removeEquipmentEntryRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/equipment/{entryId}',
  operationId: 'removeEquipmentEntry',
  summary: 'Remove an equipment entry',
  description: 'Removing the last entry leaves the position undecided again.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: entryParams },
  responses: {
    204: { description: 'Removed' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEntry,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const copyEquipmentRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/equipment/copy',
  operationId: 'copyEquipment',
  summary: 'Copy the entries of another job position',
  description:
    'Adds copies of the entries of `fromJobPositionId`, another position of the same client, after the entries the position already has.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: positionParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: copyEquipmentRequestSchema.meta({ id: 'CopyEquipmentRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The entries after the copy, and the decision', content: listContent },
    400: {
      description: 'Invalid path or body, or the source is not a position of this client',
      content: errorContent,
    },
    404: noSuchJobPosition,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const decideProtectiveEquipmentRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/protective-equipment',
  operationId: 'decideProtectiveEquipment',
  summary: 'Say that a job position needs no equipment, or take that back',
  description:
    '`needsProtectiveEquipment: false` marks the post as needing none; `null` leaves the question open again. `true` is refused with the reason `equipment_decided_by_entries`: adding an entry says it. Refused with the reason `equipment_entries_exist` while the position has entries.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: positionParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: protectiveEquipmentDecisionSchema.meta({ id: 'ProtectiveEquipmentDecision' }),
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
    409: {
      description:
        'The client is archived, or the position has entries (reason `equipment_entries_exist`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const equipmentSuggestionsRoute = createRoute({
  method: 'get',
  path: '/equipment-suggestions',
  operationId: 'listEquipmentSuggestions',
  summary: 'Risks or items typed before, for autocomplete',
  description:
    'The distinct values of `field` across the organization’s equipment entries that contain `query`, most recently used first, at most twenty.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: equipmentSuggestionsQuerySchema },
  responses: {
    200: {
      description: 'The suggestions',
      content: {
        'application/json': {
          schema: equipmentSuggestionsResponseSchema.meta({ id: 'EquipmentSuggestionsResponse' }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});
