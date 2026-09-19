import { createRoute, z } from '@hono/zod-openapi';
import { documentReadinessResponseSchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

// A client's generated documentation (ADR 005).

const clientParams = z.object({ clientId: z.uuid() });

export const getDocumentReadinessRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/documents/readiness',
  operationId: 'getDocumentReadiness',
  summary: "Whether a client's documentation can be generated, and what is missing",
  description:
    'Documents never leave a data field blank, so generating is refused until the list is empty. The specialist is the caller: their name and professional title come from their profile.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'What is missing, by where it is filled in',
      content: {
        'application/json': {
          schema: documentReadinessResponseSchema.meta({ id: 'DocumentReadinessResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'The client does not exist in the organization', content: errorContent },
    ...membershipErrors,
  },
});
