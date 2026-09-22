import { createRoute } from '@hono/zod-openapi';
import {
  meResponseSchema,
  pendingInvitationListResponseSchema,
  profileSchema,
  supportIdentitySchema,
  updateProfileRequestSchema,
} from '@ssm-usor/contracts';

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

export const supportIdentityRoute = createRoute({
  method: 'get',
  path: '/me/support-identity',
  operationId: 'getSupportIdentity',
  summary: 'Get the signed identity for the authenticated user in PostHog Support',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'The caller ID and its server-generated signature',
      content: {
        'application/json': { schema: supportIdentitySchema.meta({ id: 'SupportIdentity' }) },
      },
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

export const listMyInvitationsRoute = createRoute({
  method: 'get',
  path: '/me/invitations',
  operationId: 'listMyInvitations',
  summary: "List open invitations sent to the authenticated user's address",
  description:
    'For onboarding, so a person is told about an invitation before creating an organization of their own. Carries no id and no token: only the emailed link accepts an invitation.',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Open invitations, newest first',
      content: {
        'application/json': {
          schema: pendingInvitationListResponseSchema.meta({
            id: 'PendingInvitationListResponse',
          }),
        },
      },
    },
    ...authErrors,
  },
});
