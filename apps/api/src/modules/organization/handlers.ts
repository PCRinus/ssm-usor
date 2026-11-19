import type { RouteHandler } from '@hono/zod-openapi';
import {
  billingPlans,
  type MemberErrorReason,
  type OnboardingErrorReason,
  type OrganizationMemberListResponse,
  type OrganizationMembership,
  type OrganizationSeats,
} from '@ssm-usor/contracts';

import { createAdminClient } from '../../lib/admin-db';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { usageLimits } from '../billing/rules';
import { countMemberSeats, loadSubscription } from '../billing/store';
import type {
  changeMemberRoleRoute,
  createOrganizationRoute,
  getOrganizationSeatsRoute,
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
    return ApiError.conflict(
      'own_membership' satisfies MemberErrorReason,
      'You cannot change your own membership.'
    );
  }
  return fromDatabaseError(error, context);
}

// Runs as the caller, who has no membership yet, so no policy could allow the writes: the
// database function checks the confirmed email and the missing membership itself.
export const createOrganization: RouteHandler<typeof createOrganizationRoute, ApiEnv> = async (
  c
) => {
  const { organizationName, fullName, termsVersion, acceptsSpecialClauses } = c.req.valid('json');

  const { data: id, error } = await createDataClient(c).rpc('create_organization', {
    organization_name: organizationName,
    owner_full_name: fullName,
    accepted_terms_version: termsVersion,
    accepts_special_clauses: acceptsSpecialClauses,
  });
  if (error) {
    if (error.code === 'ORG01') {
      throw ApiError.conflict(
        'already_in_organization' satisfies OnboardingErrorReason,
        'This account already belongs to an organization.'
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
  const db = createDataClient(c);
  const owner = c.get('membership').role === 'owner';
  const [members, activity] = await Promise.all([
    db.rpc('organization_member_list').order('joined_at', { ascending: true }),
    owner ? db.rpc('organization_member_activity') : null,
  ]);
  if (members.error) throw fromDatabaseError(members.error, 'organization members');
  if (activity?.error) throw fromDatabaseError(activity.error, 'organization member activity');
  const lastActive = new Map(
    (activity?.data ?? []).map((row) => [row.user_id, row.last_active_at as string | null])
  );

  return c.json(
    {
      items: members.data.map((member) => {
        const active = lastActive.get(member.user_id);
        return {
          userId: member.user_id,
          email: member.email,
          fullName: member.full_name,
          professionalTitle: member.professional_title,
          role: member.role,
          joinedAt: new Date(member.joined_at).toISOString(),
          ...(owner && { lastActiveAt: active ? new Date(active).toISOString() : null }),
        };
      }),
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

// Counts across the organization, which no member's own policies may read whole; the secret key is
// scoped to the caller's organization here.
export const getOrganizationSeats: RouteHandler<typeof getOrganizationSeatsRoute, ApiEnv> = async (
  c
) => {
  const admin = createAdminClient(c);
  const { organizationId, access } = c.get('membership');
  const [row, seats] = await Promise.all([
    loadSubscription(admin, organizationId),
    countMemberSeats(admin, organizationId),
  ]);

  const limit = usageLimits(row, new Date()).members;

  return c.json(
    {
      ...seats,
      limit,
      // A trial already has Profesional's users, so moving there would add none.
      canUpgrade:
        limit !== null &&
        limit < billingPlans.profesional.members &&
        row?.plan === 'start' &&
        row.stripe_subscription_id !== null &&
        row.status !== 'canceled' &&
        access !== 'read_only',
    } satisfies OrganizationSeats,
    200
  );
};
