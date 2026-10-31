import type { SmsRefusalReason } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { isRomanianNumber, smsPolicy, type SmsSubscription } from './policy';
import type { SmsUsageStore } from './store';

export type SignInOrganization =
  | { organizationId: string; subscription: SmsSubscription | null }
  | { refusal: SmsRefusalReason }
  | { refusal: 'no_organization' };

/**
 * Supabase's hook names no organization, so a sign-in code goes by SMS when any organization the
 * participant belongs to, or is invited by at that number, may send one. The code is not counted;
 * the row names the most recent invitation's organization among those, for support.
 */
export async function signInOrganization(
  deps: { db: AdminClient; store: Pick<SmsUsageStore, 'subscriptions'> },
  account: { userId: string | null; phone: string },
  now = new Date()
): Promise<SignInOrganization> {
  if (!isRomanianNumber(account.phone)) return { refusal: 'sms_foreign_number' };

  const [invitations, participants] = await Promise.all([
    deps.db
      .from('participant_invitations')
      .select('organization_id, last_sent_at')
      .eq('channel', 'sms')
      .eq('address', account.phone)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', now.toISOString())
      .order('last_sent_at', { ascending: false })
      .limit(50),
    account.userId
      ? deps.db
          .from('client_participants')
          .select('organization_id, created_at')
          .eq('user_id', account.userId)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (invitations.error) throw fromDatabaseError(invitations.error, 'sign-in invitations');
  if (participants.error) throw fromDatabaseError(participants.error, 'sign-in participants');

  const candidates = [
    ...new Set([
      ...invitations.data.map((row) => row.organization_id),
      ...participants.data.map((row) => row.organization_id),
    ]),
  ];
  if (candidates.length === 0) return { refusal: 'no_organization' };

  const subscriptions = await deps.store.subscriptions(candidates);
  const fitting = candidates.find(
    (organizationId) => smsPolicy(subscriptions.get(organizationId) ?? null, now).sends
  );
  if (!fitting) return { refusal: 'sms_trial' };
  return { organizationId: fitting, subscription: subscriptions.get(fitting) ?? null };
}
