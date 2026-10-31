import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/database.types';
import { type SmsSubscription, smsSubscriptionColumns } from '../../src/modules/sms-usage/policy';

export type OwnerOrganization = {
  organizationId: string;
  organizationName: string;
  subscription: SmsSubscription | null;
};

export async function ownerOrganization(
  client: SupabaseClient<Database>,
  email: string
): Promise<OwnerOrganization> {
  const user = await client.rpc('auth_user_id_by_address', {
    p_channel: 'email',
    p_address: email,
  });
  if (user.error) throw new Error(`${user.error.code}: ${user.error.message}`);
  const membership = user.data
    ? await client
        .from('organization_members')
        .select('organization_id, organizations(name)')
        .eq('user_id', user.data)
        .eq('role', 'owner')
        .maybeSingle()
    : null;
  if (membership?.error) throw new Error(`${membership.error.code}: ${membership.error.message}`);
  if (!membership?.data) {
    throw new Error(`No organization has an owner with the email ${email}.`);
  }
  const organizationId = membership.data.organization_id;

  const subscription = await client
    .from('subscriptions')
    .select(smsSubscriptionColumns)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (subscription.error) {
    throw new Error(`${subscription.error.code}: ${subscription.error.message}`);
  }
  return {
    organizationId,
    organizationName: membership.data.organizations?.name ?? organizationId,
    subscription: subscription.data,
  };
}
