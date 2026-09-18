import type { RouteHandler } from '@hono/zod-openapi';
import type {
  Invitation,
  InvitationAcceptedResponse,
  InvitationListResponse,
  InvitationLookupResponse,
  InvitationStatus,
  OrganizationRole,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import { type ApiEnv, appOrigin } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createToken, hashToken } from '../../lib/tokens';
import { accountExists, fromInvitationError, invitationNotOpen } from './errors';
import type {
  acceptInvitationRoute,
  createInvitationRoute,
  joinWithInvitationRoute,
  listInvitationsRoute,
  lookupInvitationRoute,
  resendInvitationRoute,
  revokeInvitationRoute,
} from './routes';

// A pending invitation gets at most one email in this window, so resending cannot be
// used to flood someone's inbox.
const RESEND_AFTER_MS = 10 * 60 * 1000;

// Never the token hash: owners cannot select it, and nothing here needs it.
const invitationColumns = 'id, email, role, sent_at, expires_at, created_at';

interface InvitationRow {
  id: string;
  email: string;
  role: OrganizationRole;
  sent_at: string | null;
  expires_at: string;
  created_at: string;
}

const toIso = (value: string) => new Date(value).toISOString();

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: Date.parse(row.expires_at) <= Date.now() ? 'expired' : 'open',
    sentAt: row.sent_at ? toIso(row.sent_at) : null,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
  };
}

// Owner side ------------------------------------------------------------------------

export const listInvitations: RouteHandler<typeof listInvitationsRoute, ApiEnv> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('organization_invitations')
    .select(invitationColumns)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw fromDatabaseError(error, 'invitations list');

  return c.json({ items: data.map(toInvitation) } satisfies InvitationListResponse, 200);
};

// Creates or renews the invitation as the owner, then gives it a token and emails the
// link. Only the secret key can write the token hash: an owner who could would be able to
// mint a link and create a confirmed account for someone else's address.
async function sendInvitation(c: Context<ApiEnv>, email: string, role: OrganizationRole) {
  const mail = c.env.MAIL;
  if (!mail) throw new ApiError('service_unavailable');
  const admin = createAdminClient(c);
  const db = createDataClient(c);

  const created = await db.rpc('create_organization_invitation', {
    invitee_email: email,
    invitee_role: role,
  });
  if (created.error) throw fromInvitationError(created.error, 'invitation create');
  const row = created.data[0];
  if (!row) throw new ApiError('internal_error');

  if (row.sent_at && Date.now() - Date.parse(row.sent_at) < RESEND_AFTER_MS) {
    throw new ApiError(
      'conflict',
      'An invitation was emailed to this address in the last 10 minutes.',
      undefined,
      'sent_recently'
    );
  }

  const [organization, inviter] = await Promise.all([
    db.from('organizations').select('name').eq('id', c.get('membership').organizationId).single(),
    db.from('profiles').select('full_name').eq('user_id', c.get('user').id).maybeSingle(),
  ]);
  if (organization.error) throw fromDatabaseError(organization.error, 'invitation organization');
  if (inviter.error) throw fromDatabaseError(inviter.error, 'invitation inviter');

  // Every email carries a fresh token; an older link stops working once a new one is sent.
  const token = createToken();
  const hashed = await admin
    .from('organization_invitations')
    .update({ token_hash: await hashToken(token) })
    .eq('id', row.id);
  if (hashed.error) throw fromDatabaseError(hashed.error, 'invitation token');

  const acceptUrl = new URL('/accept-invitation', appOrigin(c.env));
  acceptUrl.searchParams.set('token', token);

  try {
    await mail.sendOrganizationInvitation({
      to: row.email,
      acceptUrl: acceptUrl.href,
      organizationName: organization.data.name,
      inviterName: inviter.data?.full_name ?? null,
      expiresAt: toIso(row.expires_at),
    });
  } catch (error) {
    // The sent time is left as it was, so the owner can retry right away.
    console.error(`Invitation email failed: ${error instanceof Error ? error.name : 'unknown'}`);
    throw new ApiError('service_unavailable', 'The invitation email could not be sent.');
  }

  const sentAt = new Date().toISOString();
  const marked = await admin
    .from('organization_invitations')
    .update({ sent_at: sentAt })
    .eq('id', row.id);
  if (marked.error) throw fromDatabaseError(marked.error, 'invitation mark sent');

  return toInvitation({ ...row, sent_at: sentAt });
}

export const createInvitation: RouteHandler<typeof createInvitationRoute, ApiEnv> = async (c) => {
  const { email, role } = c.req.valid('json');
  return c.json(await sendInvitation(c, email, role), 201);
};

export const resendInvitation: RouteHandler<typeof resendInvitationRoute, ApiEnv> = async (c) => {
  const { invitationId } = c.req.valid('param');

  const found = await createDataClient(c)
    .from('organization_invitations')
    .select('email, role')
    .eq('id', invitationId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle();
  if (found.error) throw fromDatabaseError(found.error, 'invitation resend lookup');
  if (!found.data) throw new ApiError('not_found', 'The invitation does not exist.');

  return c.json(await sendInvitation(c, found.data.email, found.data.role), 200);
};

export const revokeInvitation: RouteHandler<typeof revokeInvitationRoute, ApiEnv> = async (c) => {
  const { invitationId } = c.req.valid('param');

  const { data: revoked, error } = await createDataClient(c).rpc('revoke_organization_invitation', {
    invitation_id: invitationId,
  });
  if (error) throw fromInvitationError(error, 'invitation revoke');
  if (!revoked) throw new ApiError('not_found', 'The invitation does not exist.');

  return c.body(null, 204);
};

// Invitee side ----------------------------------------------------------------------

async function findByToken(c: Context<ApiEnv>, token: string) {
  const admin = createAdminClient(c);
  const tokenHash = await hashToken(token);

  const { data, error } = await admin.rpc('organization_invitation_by_token', {
    invitation_token_hash: tokenHash,
  });
  if (error) throw fromDatabaseError(error, 'invitation lookup');
  const invitation = data[0];
  if (!invitation) throw new ApiError('not_found', 'The invitation does not exist.');

  return { admin, tokenHash, invitation };
}

export const lookupInvitation: RouteHandler<typeof lookupInvitationRoute, ApiEnv> = async (c) => {
  const { invitation } = await findByToken(c, c.req.valid('json').token);

  return c.json(
    {
      organizationName: invitation.organization_name,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status as InvitationStatus,
      inviterName: invitation.inviter_name,
      accountExists: invitation.account_exists,
      expiresAt: toIso(invitation.expires_at),
    } satisfies InvitationLookupResponse,
    200
  );
};

export const acceptInvitation: RouteHandler<typeof acceptInvitationRoute, ApiEnv> = async (c) => {
  const { token, fullName, password, termsVersion } = c.req.valid('json');
  const { admin, tokenHash, invitation } = await findByToken(c, token);

  // Checked again inside the transaction below; this only avoids creating an account
  // that would have to be deleted a moment later.
  if (invitation.status !== 'open') throw invitationNotOpen(invitation.status);
  if (invitation.account_exists) throw accountExists();

  // The token reached the invited mailbox, which is what email confirmation proves.
  const created = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
  });
  if (created.error) {
    if (created.error.code === 'email_exists') throw accountExists();
    if (created.error.code === 'weak_password') {
      throw new ApiError('validation_error', 'The password was rejected.', [
        { path: 'password', message: 'Too weak.' },
      ]);
    }
    console.error(`Invitation account creation failed: ${created.error.code ?? 'no code'}`);
    throw new ApiError('service_unavailable', 'The account could not be created.');
  }
  const userId = created.data.user.id;

  const accepted = await admin.rpc('accept_invitation_as', {
    invitation_token_hash: tokenHash,
    accepting_user_id: userId,
    new_full_name: fullName,
    accepted_terms_version: termsVersion,
  });
  if (accepted.error) {
    // Without a membership the account is useless and would block a second attempt.
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error(`Invitation account cleanup failed: ${removed.error.code ?? 'no code'}`);
    }
    throw fromInvitationError(accepted.error, 'invitation accept');
  }

  return c.json(
    { organizationId: accepted.data, email: invitation.email } satisfies InvitationAcceptedResponse,
    201
  );
};

export const joinWithInvitation: RouteHandler<typeof joinWithInvitationRoute, ApiEnv> = async (
  c
) => {
  const { token, fullName, termsVersion } = c.req.valid('json');
  const user = c.get('user');
  if (!user.email) throw new ApiError('forbidden', 'This account has no email address.');
  const db = createDataClient(c);

  if (!fullName) {
    const profile = await db
      .from('profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile.error) throw fromDatabaseError(profile.error, 'invitation join profile');
    if (!profile.data) {
      throw new ApiError(
        'validation_error',
        'A name is required.',
        [{ path: 'fullName', message: 'Required for an account without a profile.' }],
        'full_name_required'
      );
    }
  }

  // Runs as the signed-in user: the database compares the invited address with the
  // account's confirmed email, so no secret key is involved.
  const accepted = await db.rpc('accept_organization_invitation', {
    invitation_token_hash: await hashToken(token),
    new_full_name: fullName,
    accepted_terms_version: termsVersion,
  });
  if (accepted.error) throw fromInvitationError(accepted.error, 'invitation join');

  return c.json(
    { organizationId: accepted.data, email: user.email } satisfies InvitationAcceptedResponse,
    200
  );
};
