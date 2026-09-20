import { createRoute, z } from '@hono/zod-openapi';
import {
  saveServiceContractRequestSchema,
  serviceContractResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import { bearerSecurity, errorContent, ownerErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });

const responses = {
  200: {
    description: 'The contract, what is missing for generating it, and its document',
    content: {
      'application/json': {
        schema: serviceContractResponseSchema.meta({ id: 'ServiceContractResponse' }),
      },
    },
  },
  404: { description: 'The client does not exist in the organization', content: errorContent },
  ...ownerErrors,
};

export const getServiceContractRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/service-contract',
  operationId: 'getServiceContract',
  summary: 'Read the service contract of a client or a lead',
  description:
    "Owners only, before and after promotion (ADR 007). `contract` is null until its details are saved, and `suggestedNumber` then continues the organization's register. `readiness` lists what generating the contract is waiting for, by where it is filled in. `document` is the contract as a document, with its draft and issued revisions, once generated.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: clientParams },
  responses: { ...responses, 400: { description: 'Invalid path', content: errorContent } },
});

export const saveServiceContractRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/service-contract',
  operationId: 'saveServiceContract',
  summary: 'Save the details of the service contract of a client or a lead',
  description:
    'Owners only. The number, the dates, the renewal and the services covered; prices are not kept, they are written in the file. `clientRepresentativeName` and `clientRepresentativeRole` are saved on the client, which a lead has no other form for; left out, they stay as they are. Nothing already generated changes: the file is the document.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: saveServiceContractRequestSchema.meta({ id: 'SaveServiceContractRequest' }),
        },
      },
    },
  },
  responses: {
    ...responses,
    400: { description: 'Invalid path or request body', content: errorContent },
    409: {
      description:
        'Another contract of that year has the number (`contract_number_taken`), or the client is archived',
      content: errorContent,
    },
  },
});
