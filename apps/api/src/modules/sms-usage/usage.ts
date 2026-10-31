import type { BillingSmsUsage } from '@ssm-usor/contracts';

import { smsPolicy, smsState, type SmsSubscription } from './policy';
import type { SmsUsageStore } from './store';

export async function smsUsageOf(
  store: Pick<SmsUsageStore, 'periodUsage'>,
  organizationId: string,
  row: SmsSubscription | null,
  now: Date
): Promise<BillingSmsUsage> {
  const policy = smsPolicy(row, now);
  if (!policy.sends) {
    return {
      used: 0,
      included: 0,
      allowance: 0,
      granted: 0,
      cap: null,
      capFactor: null,
      overage: 0,
      periodStart: null,
      periodEnd: null,
      state: 'none',
    };
  }
  const counts = await store.periodUsage(organizationId, policy.period);
  const included = policy.allowance === null ? null : policy.allowance + counts.granted;
  const cap = policy.cap === null ? null : policy.cap + counts.granted;
  return {
    used: counts.used,
    included,
    allowance: policy.allowance,
    granted: counts.granted,
    cap,
    capFactor: policy.capFactor,
    overage: counts.overage,
    periodStart: policy.period.start.toISOString(),
    periodEnd: policy.period.end.toISOString(),
    state: smsState(policy, { used: counts.used, included, cap }),
  };
}
