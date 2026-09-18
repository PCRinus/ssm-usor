import { createRoute } from '@hono/zod-openapi';
import { meResponseSchema, profileSchema, updateProfileRequestSchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { authErrors, bearerSecurity, errorContent } from '../../lib/openapi';

export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  operationId: 'getMe',
  summary: 'Get the authenticated user, their profile, and their organization',
  description:
    'Answers for an account without a membership too, with `membership: null`, so the SPA can tell that apart from a failure.',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Verified user identity with profile and membership',
      content: { 'application/json': { schema: meResponseSchema.meta({ id: 'MeResponse' }) } },
    },
    ...authErrors,
  },
});

export const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/me/profile',
  operationId: 'updateProfile',
  summary: "Change the authenticated user's name",
  description: 'Creates the profile when the account has none yet.',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateProfileRequestSchema.meta({ id: 'UpdateProfileRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The saved profile',
      content: { 'application/json': { schema: profileSchema.meta({ id: 'ProfileResponse' }) } },
    },
    400: { description: 'Invalid request body', content: errorContent },
    ...authErrors,
  },
});
