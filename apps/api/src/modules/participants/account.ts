import { type ParticipantChannel, participantErrorReasons } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { ApiError } from '../../lib/errors';
import { isParticipantAccount, PARTICIPANT_ACCOUNT_FLAG } from '../../lib/participant-account';

const unavailable = () =>
  new ApiError(
    'service_unavailable',
    'The account for this address could not be prepared. The invitation is saved; resend it in 10 minutes.',
    undefined,
    participantErrorReasons.accountUnavailable
  );

async function accountOf(admin: AdminClient, channel: ParticipantChannel, address: string) {
  const { data, error } = await admin.rpc('auth_user_id_by_address', {
    p_channel: channel,
    p_address: address,
  });
  if (error) {
    console.error(`Participant account lookup failed: ${error.code ?? 'no code'}`);
    throw unavailable();
  }
  return data ?? null;
}

/**
 * The account a code is sent to (ADR 022): created unconfirmed for a new address, so the first
 * code confirms it, or the one the address already has, a member's or an earlier participant's.
 * Either way it carries the participant flag, without which the Send SMS hook sends nothing.
 */
export async function ensureParticipantAccount(
  admin: AdminClient,
  channel: ParticipantChannel,
  address: string
) {
  let userId = await accountOf(admin, channel, address);
  if (!userId) {
    const metadata = { [PARTICIPANT_ACCOUNT_FLAG]: true };
    const created = await admin.auth.admin.createUser(
      channel === 'email'
        ? { email: address, email_confirm: false, app_metadata: metadata }
        : { phone: address, phone_confirm: false, app_metadata: metadata }
    );
    if (!created.error) return;
    if (created.error.code !== 'email_exists' && created.error.code !== 'phone_exists') {
      console.error(`Participant account creation failed: ${created.error.code ?? 'no code'}`);
      throw unavailable();
    }
    userId = await accountOf(admin, channel, address);
    if (!userId) throw unavailable();
  }

  const existing = await admin.auth.admin.getUserById(userId);
  if (existing.error) {
    console.error(`Participant account read failed: ${existing.error.code ?? 'no code'}`);
    throw unavailable();
  }
  const appMetadata = existing.data.user.app_metadata;
  if (isParticipantAccount(appMetadata)) return;
  // The whole object, so that a platform admin's role and the provider keys stay whatever Auth
  // does with a partial one.
  const updated = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...appMetadata, [PARTICIPANT_ACCOUNT_FLAG]: true },
  });
  if (updated.error) {
    console.error(`Participant account flag failed: ${updated.error.code ?? 'no code'}`);
    throw unavailable();
  }
}
