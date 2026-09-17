import { createRoute } from '@hono/zod-openapi';
import { type ApiHealth, apiHealthSchema } from '@ssm-usor/contracts';

import { publicErrors } from '../../lib/openapi';
import { createRouter } from '../../router';

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  summary: 'Check API availability',
  responses: {
    200: {
      description: 'API is running',
      content: { 'application/json': { schema: apiHealthSchema.meta({ id: 'ApiHealth' }) } },
    },
    ...publicErrors,
  },
});

// Checks the Worker only, not Supabase connectivity.
export const healthRouter = createRouter().openapi(healthRoute, (c) =>
  c.json({ status: 'ok', service: 'ssm-usor-api' } satisfies ApiHealth, 200)
);
