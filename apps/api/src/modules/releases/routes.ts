import { createRoute, z } from '@hono/zod-openapi';
import {
  acknowledgeReleasesRequestSchema,
  acknowledgeReleasesResponseSchema,
  releaseListResponseSchema,
  releaseSchema,
  releaseTagSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { authErrors, bearerSecurity, errorContent } from '../../lib/openapi';

export const listReleasesRoute = createRoute({
  method: 'get',
  path: '/releases',
  operationId: 'listReleases',
  summary: 'List the releases with their updates',
  description:
    'Every release that has an update, newest first, in full, each marked unread or not for the caller (ADR 026). Not organization data: an account without a membership may call it too. Not paginated.',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'The releases, newest first',
      content: {
        'application/json': {
          schema: releaseListResponseSchema.meta({ id: 'ReleaseListResponse' }),
        },
      },
    },
    ...authErrors,
  },
});

export const getReleaseRoute = createRoute({
  method: 'get',
  path: '/releases/{tag}',
  operationId: 'getRelease',
  summary: 'Get one release with its update',
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  request: { params: z.object({ tag: releaseTagSchema }) },
  responses: {
    200: {
      description: 'The release',
      content: { 'application/json': { schema: releaseSchema.meta({ id: 'Release' }) } },
    },
    400: { description: 'The tag is not a release tag', content: errorContent },
    404: { description: 'No release has this tag', content: errorContent },
    ...authErrors,
  },
});

export const acknowledgeReleasesRoute = createRoute({
  method: 'post',
  path: '/releases/acknowledge',
  operationId: 'acknowledgeReleases',
  summary: 'Acknowledge every release up to and including one',
  description:
    "Records the release on the caller's profile, unless a release published later is acknowledged already; that one is kept and returned. `409` with `reason: profile_missing` for an account that has not named itself yet, which has nothing unread.",
  security: bearerSecurity,
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: acknowledgeReleasesRequestSchema.meta({ id: 'AcknowledgeReleasesRequest' }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The release the profile is acknowledged through',
      content: {
        'application/json': {
          schema: acknowledgeReleasesResponseSchema.meta({ id: 'AcknowledgeReleasesResponse' }),
        },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    404: { description: 'No release has this tag', content: errorContent },
    409: { description: 'The account has no profile', content: errorContent },
    ...authErrors,
  },
});
