import type { RouteHandler } from '@hono/zod-openapi';
import type { MeResponse, PendingInvitationListResponse, Profile } from '@ssm-usor/contracts';

import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import type { listMyInvitationsRoute, meRoute, updateProfileRoute } from './routes';

const profileColumns = 'full_name, terms_version, terms_accepted_at';

interface ProfileRow {
  full_name: string;
  terms_version: string | null;
  terms_accepted_at: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    fullName: row.full_name,
    termsVersion: row.terms_version,
    termsAcceptedAt: row.terms_accepted_at ? new Date(row.terms_accepted_at).toISOString() : null,
  };
}

export const getMe: RouteHandler<typeof meRoute, ApiEnv> = async (c) => {
  const user = c.get('user');
  const db = createDataClient(c);

  // Row-level security shows a member exactly one organization: their own.
  const [profile, membership, organization] = await Promise.all([
    db.from('profiles').select(profileColumns).eq('user_id', user.id).maybeSingle(),
    db.rpc('current_membership'),
    db.from('organizations').select('id, name').maybeSingle(),
  ]);
  if (profile.error) throw fromDatabaseError(profile.error, 'me profile');
  if (membership.error) throw fromDatabaseError(membership.error, 'me membership');
  if (organization.error) throw fromDatabaseError(organization.error, 'me organization');

  const role = membership.data[0]?.role;
  return c.json(
    {
      user,
      profile: profile.data ? toProfile(profile.data) : null,
      membership:
        role && organization.data
          ? { organization: { id: organization.data.id, name: organization.data.name }, role }
          : null,
    } satisfies MeResponse,
    200
  );
};

export const updateProfile: RouteHandler<typeof updateProfileRoute, ApiEnv> = async (c) => {
  const { fullName } = c.req.valid('json');
  const user = c.get('user');
  const db = createDataClient(c);

  // Not an upsert: the user may write only `full_name`, and an upsert also sets the key.
  const updated = await db
    .from('profiles')
    .update({ full_name: fullName })
    .eq('user_id', user.id)
    .select(profileColumns)
    .maybeSingle();
  if (updated.error) throw fromDatabaseError(updated.error, 'profile update');
  if (updated.data) return c.json(toProfile(updated.data), 200);

  const created = await db
    .from('profiles')
    .insert({ user_id: user.id, full_name: fullName })
    .select(profileColumns)
    .single();
  if (created.error) throw fromDatabaseError(created.error, 'profile create');
  return c.json(toProfile(created.data), 200);
};

export const listMyInvitations: RouteHandler<typeof listMyInvitationsRoute, ApiEnv> = async (c) => {
  const { data, error } = await createDataClient(c).rpc('my_open_invitations');
  if (error) throw fromDatabaseError(error, 'my invitations');

  return c.json(
    {
      items: data.map((invitation) => ({
        organizationName: invitation.organization_name,
        inviterName: invitation.inviter_name,
        role: invitation.role,
        expiresAt: new Date(invitation.expires_at).toISOString(),
      })),
    } satisfies PendingInvitationListResponse,
    200
  );
};
