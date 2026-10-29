import { createRoute, z } from '@hono/zod-openapi';
import {
  setupGuideSchema,
  setupMemberStepIdSchema,
  updateSetupGuideRequestSchema,
} from '@ssm-usor/contracts';

import { allowWhileReadOnly } from '../../lib/access';
import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const setupGuideResponse = {
  description: "The caller's setup guide",
  content: { 'application/json': { schema: setupGuideSchema.meta({ id: 'SetupGuide' }) } },
};

const personalWriteMiddleware = [requireAuth, allowWhileReadOnly, requireMembership];

export const getSetupGuideRoute = createRoute({
  method: 'get',
  path: '/me/setup',
  operationId: 'getMySetupGuide',
  summary: "Get the caller's setup guide",
  description:
    "The fifteen steps of the setup guide in order (ADR 031), each done, skipped, locked or open for the caller in their organization, with the next step, the client the steps on a client open, and whether the caller closed or finished the guide. During an impersonation the done steps, skips, `closed` and `finished` are the signed-in admin's own, while `canDo` and `next` follow the impersonated member's role, and the locks their organization.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: { 200: setupGuideResponse, ...membershipErrors },
});

export const updateSetupGuideRoute = createRoute({
  method: 'put',
  path: '/me/setup',
  operationId: 'updateMySetupGuide',
  summary: 'Record that the caller closed, reopened or finished the setup guide',
  description:
    "`true` records the moment on the caller's profile, `false` clears it, and a missing key leaves it. Allowed while the organization is read-only. `409` with `reason: profile_missing` for an account without a profile.",
  security: bearerSecurity,
  middleware: personalWriteMiddleware,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateSetupGuideRequestSchema.meta({ id: 'UpdateSetupGuideRequest' }),
        },
      },
    },
  },
  responses: {
    200: setupGuideResponse,
    400: { description: 'Invalid request body', content: errorContent },
    409: { description: 'The account has no profile', content: errorContent },
    ...membershipErrors,
  },
});

const skipParams = z.object({ step: setupMemberStepIdSchema });

export const skipSetupStepRoute = createRoute({
  method: 'put',
  path: '/me/setup/skips/{step}',
  operationId: 'skipMySetupStep',
  summary: 'Mark a member step of the setup guide as known (Știu deja)',
  description:
    'Idempotent. Only the eleven member steps can be skipped. Allowed while the organization is read-only.',
  security: bearerSecurity,
  middleware: personalWriteMiddleware,
  request: { params: skipParams },
  responses: {
    200: setupGuideResponse,
    400: { description: 'Not a member step', content: errorContent },
    ...membershipErrors,
  },
});

export const unskipSetupStepRoute = createRoute({
  method: 'delete',
  path: '/me/setup/skips/{step}',
  operationId: 'unskipMySetupStep',
  summary: 'Undo skipping a member step of the setup guide',
  description:
    'Idempotent: a step that was not skipped stays as it is. Allowed while the organization is read-only.',
  security: bearerSecurity,
  middleware: personalWriteMiddleware,
  request: { params: skipParams },
  responses: {
    200: setupGuideResponse,
    400: { description: 'Not a member step', content: errorContent },
    ...membershipErrors,
  },
});
