import { createRoute, type RouteHandler } from '@hono/zod-openapi';
import {
  type OrganizationMemberListResponse,
  organizationMemberListResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, membershipErrors } from '../../lib/openapi';
import { createRouter } from '../../router';

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

// Emails live in auth.users, so the list comes from a database function, not a table.
const listOrganizationMembers: RouteHandler<typeof listOrganizationMembersRoute, ApiEnv> = async (
  c
) => {
  const { data, error } = await createDataClient(c)
    .rpc('organization_member_list')
    .order('joined_at', { ascending: true });
  if (error) throw fromDatabaseError(error, 'organization members');

  return c.json(
    {
      items: data.map((member) => ({
        userId: member.user_id,
        email: member.email,
        fullName: member.full_name,
        role: member.role,
        joinedAt: new Date(member.joined_at).toISOString(),
      })),
    } satisfies OrganizationMemberListResponse,
    200
  );
};

export const organizationRouter = createRouter().openapi(
  listOrganizationMembersRoute,
  listOrganizationMembers
);
