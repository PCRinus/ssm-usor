import type { RouteHandler } from '@hono/zod-openapi';
import type {
  MeResponse,
  PendingInvitationListResponse,
  Profile,
  SupportIdentity,
} from '@ssm-usor/contracts';

import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  listMyInvitationsRoute,
  meRoute,
  supportIdentityRoute,
  updateProfileRoute,
} from './routes';

const profileColumns = 'full_name, professional_title, terms_version, terms_accepted_at';

interface ProfileRow {
  full_name: string;
  professional_title: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    fullName: row.full_name,
    professionalTitle: row.professional_title,
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
      impersonation:
        membership.data[0] && membership.data[0].user_id !== user.id
          ? {
              targetMemberId: membership.data[0].user_id,
              targetOrganizationId: membership.data[0].organization_id,
            }
          : null,
    } satisfies MeResponse,
    200
  );
};

export const getSupportIdentity: RouteHandler<typeof supportIdentityRoute, ApiEnv> = async (c) => {
  const secret = c.env.POSTHOG_SUPPORT_SECRET_KEY;
  if (!secret) throw new ApiError('service_unavailable', 'Support is not configured.');

  const distinctId = c.get('user').id;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(distinctId));
  const hash = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');

  return c.json({ distinctId, hash } satisfies SupportIdentity, 200);
};

export const updateProfile: RouteHandler<typeof updateProfileRoute, ApiEnv> = async (c) => {
  const { fullName, professionalTitle } = c.req.valid('json');
  const user = c.get('user');
  const db = createDataClient(c);
  // Left out, the title stays as it is; null clears it.
  const changes = {
    full_name: fullName,
    ...(professionalTitle === undefined ? {} : { professional_title: professionalTitle }),
  };

  // Not an upsert: the user may write only `full_name`, and an upsert also sets the key.
  const updated = await db
    .from('profiles')
    .update(changes)
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
  if (!professionalTitle) return c.json(toProfile(created.data), 200);

  // The insert grant covers the name only, so a title given with the first save follows it.
  const titled = await db
    .from('profiles')
    .update({ professional_title: professionalTitle })
    .eq('user_id', user.id)
    .select(profileColumns)
    .single();
  if (titled.error) throw fromDatabaseError(titled.error, 'profile title');
  return c.json(toProfile(titled.data), 200);
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
