import { createRoute } from '@hono/zod-openapi';
import { apiErrorResponseSchema, apiHealthSchema, meResponseSchema } from '@ssm-usor/contracts';

import { requireAuth } from './auth';

const errorContent = {
  'application/json': { schema: apiErrorResponseSchema.meta({ id: 'ApiErrorResponse' }) },
};

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
    500: { description: 'Unexpected API error', content: errorContent },
  },
});

export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  operationId: 'getMe',
  summary: 'Get the authenticated user',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Verified user identity',
      content: { 'application/json': { schema: meResponseSchema.meta({ id: 'MeResponse' }) } },
    },
    401: { description: 'A valid user access token is required', content: errorContent },
    503: { description: 'Authentication is temporarily unavailable', content: errorContent },
    500: { description: 'Unexpected API error', content: errorContent },
  },
});

export const openApiConfig = {
  openapi: '3.0.3',
  info: { title: 'SSM Ușor API', version: '0.1.0' },
};
