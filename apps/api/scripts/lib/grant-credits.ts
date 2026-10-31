import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/database.types';
import { creditPolicy } from '../../src/modules/credits/policy';
import { creditsStore } from '../../src/modules/credits/store';
import { ownerOrganization } from './owner-organization';

export type GrantCreditsInput = { email: string; credits: number; reason: string; actor: string };

export type GrantCreditsResult = {
  organizationId: string;
  organizationName: string;
  periodStart: Date;
  periodEnd: Date;
  // The month's balance after the grant; the gift is apart.
  balance: number;
};

const wrongInput = 'Give a reason of at least three characters, and who runs this.';

export async function grantCredits(
  client: SupabaseClient<Database>,
  input: GrantCreditsInput,
  now = new Date()
): Promise<GrantCreditsResult> {
  if (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > 100_000) {
    throw new Error('Give a whole number of credits between 1 and 100000.');
  }
  if (input.reason.trim().length < 3 || !input.actor.trim()) throw new Error(wrongInput);

  const { organizationId, organizationName, subscription } = await ownerOrganization(
    client,
    input.email
  );
  const policy = creditPolicy(subscription, now);
  if (!policy.limited) {
    throw new Error('That organization has no limit on credits; nothing to add.');
  }

  let balance: number;
  try {
    balance = await creditsStore(client).grant({
      organizationId,
      policy,
      credits: input.credits,
      reason: input.reason,
      actor: input.actor,
    });
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    if (code === '22023') throw new Error(wrongInput, { cause: error });
    throw new Error(`${code}: ${message}`, { cause: error });
  }
  return {
    organizationId,
    organizationName,
    periodStart: policy.period.start,
    periodEnd: policy.period.end,
    balance,
  };
}
