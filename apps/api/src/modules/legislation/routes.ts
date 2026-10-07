import { createRoute } from '@hono/zod-openapi';
import { legalActListResponseSchema, legalChangeListResponseSchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, membershipErrors } from '../../lib/openapi';

export const listLegalActsRoute = createRoute({
  method: 'get',
  path: '/legislation/acts',
  operationId: 'listLegalActs',
  summary: 'List the watched legal acts',
  description:
    'The acts the built-in templates cite, by name, with what the Portal Legislativ showed when last checked (ADR 017). The same for every organization; not paginated.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The watched acts',
      content: {
        'application/json': {
          schema: legalActListResponseSchema.meta({ id: 'LegalActListResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});

export const listLegalChangesRoute = createRoute({
  method: 'get',
  path: '/legislation/changes',
  operationId: 'listLegalChanges',
  summary: 'List the legal changes',
  description:
    'Newer consolidated forms of the watched acts, newest first, each with its act and how it was resolved. The same for every organization; not paginated.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The legal changes',
      content: {
        'application/json': {
          schema: legalChangeListResponseSchema.meta({ id: 'LegalChangeListResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});
