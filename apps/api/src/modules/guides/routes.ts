import { createRoute, z } from '@hono/zod-openapi';
import {
  guideIdSchema,
  guideStateListResponseSchema,
  guideStateSchema,
  recordGuideRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { authErrors, bearerSecurity, errorContent } from '../../lib/openapi';

export const listGuidesRoute = createRoute({
  method: 'get',
  path: '/me/guides',
  operationId: 'listMyGuides',
  summary: 'List the guides the caller finished or skipped',
  description:
    "One entry per guide the caller has a state for, with the guide's version it was recorded at. A guide missing here was never seen. Not organization data: an account without a membership may call it too.",
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "The caller's guide states",
      content: {
        'application/json': {
          schema: guideStateListResponseSchema.meta({ id: 'GuideStateListResponse' }),
        },
      },
    },
    ...authErrors,
  },
});

export const recordGuideRoute = createRoute({
  method: 'put',
  path: '/me/guides/{guide}',
  operationId: 'recordMyGuide',
  summary: 'Record that the caller finished or skipped a guide',
  description: 'Replaces what was recorded for this guide before, the version included.',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  request: {
    params: z.object({ guide: guideIdSchema }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: recordGuideRequestSchema.meta({ id: 'RecordGuideRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The saved guide state',
      content: { 'application/json': { schema: guideStateSchema.meta({ id: 'GuideState' }) } },
    },
    400: { description: 'Invalid guide id or request body', content: errorContent },
    ...authErrors,
  },
});
