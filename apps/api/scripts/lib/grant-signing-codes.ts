import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/database.types';
import { smsPolicy, smsSubscriptionColumns } from '../../src/modules/sms-usage/policy';

export type GrantInput = { email: string; codes: number; reason: string; actor: string };

export type GrantResult = {
  organizationId: string;
  organizationName: string;
  periodStart: Date;
  periodEnd: Date;
  granted: number;
};

export async function grantSigningCodes(
  client: SupabaseClient<Database>,
  input: GrantInput,
  now = new Date()
): Promise<GrantResult> {
  if (!Number.isInteger(input.codes) || input.codes < 1 || input.codes > 10_000) {
    throw new Error('Give a whole number of codes between 1 and 10000.');
  }
  if (input.reason.trim().length < 3 || !input.actor.trim()) {
    throw new Error('Give a reason of at least three characters, and who runs this.');
  }

  const user = await client.rpc('auth_user_id_by_address', {
    p_channel: 'email',
    p_address: input.email,
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
    throw new Error(`No organization has an owner with the email ${input.email}.`);
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
  const policy = smsPolicy(subscription.data, now);
  if (!policy.sends) {
    throw new Error(
      'That organization sends no SMS: a trial needs the tester switch ("Extinde perioada de probă") first.'
    );
  }
  if (policy.allowance === null) {
    throw new Error('That organization has no limit on signing codes; nothing to add.');
  }

  const granted = await client.rpc('grant_signing_codes', {
    p_organization_id: organizationId,
    p_period_start: policy.period.start.toISOString(),
    p_period_end: policy.period.end.toISOString(),
    p_codes: input.codes,
    p_reason: input.reason,
    p_actor: input.actor,
  });
  if (granted.error) {
    if (granted.error.code === '22023') {
      throw new Error('Give a reason of at least three characters, and who runs this.');
    }
    throw new Error(`${granted.error.code}: ${granted.error.message}`);
  }
  return {
    organizationId,
    organizationName: membership.data.organizations?.name ?? organizationId,
    periodStart: policy.period.start,
    periodEnd: policy.period.end,
    granted: granted.data,
  };
}
