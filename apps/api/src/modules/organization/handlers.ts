import type { RouteHandler } from '@hono/zod-openapi';
import type {
  MemberErrorReason,
  OnboardingErrorReason,
  OrganizationMemberListResponse,
  OrganizationMembership,
} from '@ssm-usor/contracts';

import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  changeMemberRoleRoute,
  createOrganizationRoute,
  listOrganizationMembersRoute,
  removeMemberRoute,
} from './routes';

interface PostgrestError {
  code?: string | null;
  message?: string;
}

// The member functions raise their own SQLSTATE; see the migration that defines them.
function fromMemberError(error: PostgrestError, context: string): ApiError {
  if (error.code === 'MEM01') {
    return new ApiError(
      'conflict',
      'You cannot change your own membership.',
      undefined,
      'own_membership' satisfies MemberErrorReason
    );
  }
  return fromDatabaseError(error, context);
}

// Runs as the caller, who has no membership yet, so no policy could allow the writes: the
// database function checks the confirmed email and the missing membership itself.
export const createOrganization: RouteHandler<typeof createOrganizationRoute, ApiEnv> = async (
  c
) => {
  const { organizationName, fullName, termsVersion } = c.req.valid('json');

  const { data: id, error } = await createDataClient(c).rpc('create_organization', {
    organization_name: organizationName,
    owner_full_name: fullName,
    accepted_terms_version: termsVersion,
  });
  if (error) {
    if (error.code === 'ORG01') {
      throw new ApiError(
        'conflict',
        'This account already belongs to an organization.',
        undefined,
        'already_in_organization' satisfies OnboardingErrorReason
      );
    }
    if (error.code === '42501') {
      throw new ApiError(
        'forbidden',
        'Confirm your email address first.',
        undefined,
        'email_not_confirmed' satisfies OnboardingErrorReason
      );
    }
    throw fromDatabaseError(error, 'organization create');
  }

  return c.json(
    {
      organization: { id, name: organizationName },
      role: 'owner',
    } satisfies OrganizationMembership,
    201
  );
};

const noSuchMember = () => new ApiError('not_found', 'The member does not exist.');

// Emails live in auth.users, so the list comes from a database function, not a table.
export const listOrganizationMembers: RouteHandler<
  typeof listOrganizationMembersRoute,
  ApiEnv
> = async (c) => {
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
        professionalTitle: member.professional_title,
        role: member.role,
        joinedAt: new Date(member.joined_at).toISOString(),
      })),
    } satisfies OrganizationMemberListResponse,
    200
  );
};

export const changeMemberRole: RouteHandler<typeof changeMemberRoleRoute, ApiEnv> = async (c) => {
  const { userId } = c.req.valid('param');
  const { role } = c.req.valid('json');

  const { data: changed, error } = await createDataClient(c).rpc(
    'change_organization_member_role',
    { member_user_id: userId, new_role: role }
  );
  if (error) throw fromMemberError(error, 'member role');
  if (!changed) throw noSuchMember();

  return c.body(null, 204);
};

export const removeMember: RouteHandler<typeof removeMemberRoute, ApiEnv> = async (c) => {
  const { userId } = c.req.valid('param');

  const { data: removed, error } = await createDataClient(c).rpc('remove_organization_member', {
    member_user_id: userId,
  });
  if (error) throw fromMemberError(error, 'member remove');
  if (!removed) throw noSuchMember();

  return c.body(null, 204);
};
