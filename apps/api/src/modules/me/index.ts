import { createRoute } from '@hono/zod-openapi';
import { type MeResponse, meResponseSchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { authErrors, bearerSecurity } from '../../lib/openapi';
import { createRouter } from '../../router';

export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  operationId: 'getMe',
  summary: 'Get the authenticated user',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Verified user identity',
      content: { 'application/json': { schema: meResponseSchema.meta({ id: 'MeResponse' }) } },
    },
    ...authErrors,
  },
});

export const meRouter = createRouter().openapi(meRoute, (c) =>
  c.json({ user: c.get('user') } satisfies MeResponse, 200)
);
