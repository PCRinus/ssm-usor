import { createRoute, z } from '@hono/zod-openapi';
import {
  changeMemberRoleRequestSchema,
  organizationMemberListResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors, ownerErrors } from '../../lib/openapi';

const memberParams = z.object({ userId: z.uuid() });

export const listOrganizationMembersRoute = createRoute({
  method: 'get',
  path: '/organization/members',
  operationId: 'listOrganizationMembers',
  summary: "List the organization's members",
  description: 'Every member may read it. Ordered by when people joined; not paginated.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The members with their names, emails, and roles',
      content: {
        'application/json': {
          schema: organizationMemberListResponseSchema.meta({
            id: 'OrganizationMemberListResponse',
          }),
        },
      },
    },
    ...membershipErrors,
  },
});

export const changeMemberRoleRoute = createRoute({
  method: 'patch',
  path: '/organization/members/{userId}',
  operationId: 'changeMemberRole',
  summary: "Change a member's role",
  description:
    'Owners only, and never on their own membership, which is what keeps an organization from ending up without an owner.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    params: memberParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: changeMemberRoleRequestSchema.meta({ id: 'ChangeMemberRoleRequest' }),
        },
      },
    },
  },
  responses: {
    204: { description: 'The member has the role' },
    400: { description: 'Invalid path or body', content: errorContent },
    404: { description: 'No such member in the organization', content: errorContent },
    409: { description: "The caller's own membership; see `reason`", content: errorContent },
    ...ownerErrors,
  },
});

export const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/organization/members/{userId}',
  operationId: 'removeMember',
  summary: 'Remove a member from the organization',
  description:
    'Owners only, and never themselves. Only the membership is deleted: the account, the profile, and what the person created stay, and they can be invited again.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: { params: memberParams },
  responses: {
    204: { description: 'Removed' },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such member in the organization', content: errorContent },
    409: { description: "The caller's own membership; see `reason`", content: errorContent },
    ...ownerErrors,
  },
});
