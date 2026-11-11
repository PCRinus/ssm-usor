import type { RouteHandler } from '@hono/zod-openapi';
import {
  type MeResponse,
  type PendingInvitationListResponse,
  type Profile,
  readOnlyDays,
  type SubscriptionSummary,
  type SupportIdentity,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { createAdminClient } from '../../lib/admin-db';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { activeImpersonation, endActiveImpersonation } from '../../lib/impersonation';
import { creditsStore } from '../credits/store';
import { creditsUsageOf } from '../credits/usage';
import { smsUsageStore } from '../sms-usage/store';
import { smsUsageOf } from '../sms-usage/usage';
import type {
  endMyImpersonationRoute,
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

type SubscriptionRow = Pick<
  Database['public']['Tables']['subscriptions']['Row'],
  'plan' | 'status' | 'trial_ends_at' | 'access_until' | 'stripe_subscription_id'
>;

function toSubscription(
  row: SubscriptionRow,
  access: SubscriptionSummary['access']
): SubscriptionSummary {
  const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);
  const deletesAt =
    access === 'read_only' && row.access_until
      ? new Date(new Date(row.access_until).getTime() + readOnlyDays * 86_400_000).toISOString()
      : null;
  return {
    plan: row.plan,
    planChosen: row.stripe_subscription_id !== null,
    status: row.status,
    trialEndsAt: iso(row.trial_ends_at),
    accessUntil: iso(row.access_until),
    access,
    deletesAt,
  };
}

const noUsage = { smsThisMonth: null, creditsThisMonth: null };

// The logs of sends and credits are the secret key's alone. Every page waits for /me, so a failed
// count leaves the bar and the badge's meters out instead of the app.
async function usageOf(c: Context<ApiEnv>, organizationId: string) {
  try {
    const db = createAdminClient(c);
    const store = smsUsageStore(db);
    const row = await store.subscription(organizationId);
    if (!row) return noUsage;
    const now = new Date();
    const [smsThisMonth, creditsThisMonth] = await Promise.all([
      smsUsageOf(store, organizationId, row, now),
      creditsUsageOf(creditsStore(db), organizationId, row, now),
    ]);
    return { smsThisMonth, creditsThisMonth };
  } catch (error) {
    console.error('Usage for /me failed:', error instanceof Error ? error.message : error);
    return noUsage;
  }
}

// The name only labels the banner, so a failed read leaves it out instead of the app.
async function impersonationOf(db: DataClient, adminId: string, targetId: string) {
  const [row, member] = await Promise.all([
    activeImpersonation(db, adminId),
    db.rpc('organization_member_list').eq('user_id', targetId).maybeSingle(),
  ]);
  if (!row || row.target_user_id !== targetId) return null;
  if (member.error) console.error(`Impersonated member for /me failed: ${member.error.code}`);
  return {
    expiresAt: new Date(row.expires_at).toISOString(),
    targetName: member.data?.full_name?.trim() || member.data?.email || null,
  };
}

export const getMe: RouteHandler<typeof meRoute, ApiEnv> = async (c) => {
  const user = c.get('user');
  const db = createDataClient(c);

  const [profile, membership] = await Promise.all([
    db.from('profiles').select(profileColumns).eq('user_id', user.id).maybeSingle(),
    db.rpc('current_membership'),
  ]);
  if (profile.error) throw fromDatabaseError(profile.error, 'me profile');
  if (membership.error) throw fromDatabaseError(membership.error, 'me membership');

  // By the membership's id, not whatever the policies show: a member who is also a participant
  // of another organization's client sees that organization too (ADR 022).
  const organizationId = membership.data[0]?.organization_id;
  const targetId =
    membership.data[0] && membership.data[0].user_id !== user.id
      ? membership.data[0].user_id
      : undefined;
  const [organization, subscription, impersonation] = await Promise.all([
    organizationId
      ? db.from('organizations').select('id, name').eq('id', organizationId).maybeSingle()
      : { data: null, error: null },
    organizationId
      ? db
          .from('subscriptions')
          .select('plan, status, trial_ends_at, access_until, stripe_subscription_id')
          .eq('organization_id', organizationId)
          .maybeSingle()
      : { data: null, error: null },
    targetId ? impersonationOf(db, user.id, targetId) : null,
  ]);
  if (organization.error) throw fromDatabaseError(organization.error, 'me organization');
  if (subscription.error) throw fromDatabaseError(subscription.error, 'me subscription');
  const usage =
    organizationId && subscription.data && membership.data[0]?.access === 'full'
      ? await usageOf(c, organizationId)
      : noUsage;

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
        impersonation && membership.data[0]
          ? {
              targetMemberId: membership.data[0].user_id,
              targetOrganizationId: membership.data[0].organization_id,
              ...impersonation,
            }
          : null,
      subscription:
        subscription.data && membership.data[0]
          ? toSubscription(subscription.data, membership.data[0].access)
          : null,
      ...usage,
    } satisfies MeResponse,
    200
  );
};

export const endMyImpersonation: RouteHandler<typeof endMyImpersonationRoute, ApiEnv> = async (
  c
) => {
  if (!c.get('platformAdmin')) throw new ApiError('forbidden', 'Platform admins only.');
  await endActiveImpersonation(createDataClient(c), c.get('user').id);
  return c.body(null, 204);
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
