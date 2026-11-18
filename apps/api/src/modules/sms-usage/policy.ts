import { type SmsUsageState, testerMonthlySms } from '@ssm-usor/contracts';

import {
  billingAnchor,
  calendarMonth,
  dateOf,
  type EntitlementRow,
  isPaid,
  monthAround,
  type Period,
  stepOf,
  trialMonth,
} from '../billing/entitlements';
import { smsExtraCents } from '../extras/policy';

// billing/rules imports it from here until it is pointed at billing/entitlements.
export { addMonths } from '../billing/entitlements';

export type SmsPolicy =
  | { sends: false }
  | {
      sends: true;
      period: Period;
      // Null where nothing limits the signing codes.
      allowance: number | null;
      // What an extra code costs while extras may apply; null for a hard stop at the allowance,
      // or past it at the owner's ceiling.
      extraCents: number | null;
    };

export function smsPolicy(row: EntitlementRow | null, now: Date): SmsPolicy {
  if (!row || row.plan === 'enterprise') {
    return {
      sends: true,
      period: calendarMonth(now),
      allowance: null,
      extraCents: null,
    };
  }
  // A subscription created with a trial end is unpaid until that end and sends as the trial does;
  // once its first charge fails it has the plan's full access during the retries (ADR 029).
  if (!isPaid(row) && row.status !== 'past_due') {
    const trialEnd = dateOf(row.trial_ends_at);
    const testerTrial =
      row.status === 'trialing' && row.tester_allowances && trialEnd !== null && trialEnd > now;
    if (!testerTrial) return { sends: false };
    return {
      sends: true,
      period: trialMonth(row, now),
      allowance: testerMonthlySms,
      extraCents: null,
    };
  }
  return {
    sends: true,
    period: monthAround(billingAnchor(row), now),
    allowance: stepOf(row).monthlySms,
    extraCents: smsExtraCents(row),
  };
}

export function smsState(
  policy: SmsPolicy,
  counts: { used: number; included: number | null; overage: number; ceilingCents: number | null }
): SmsUsageState {
  if (!policy.sends) return 'none';
  const { used, included } = counts;
  if (included === null) return 'ok';
  if (used >= included) {
    const { extraCents } = policy;
    const room =
      extraCents !== null &&
      counts.ceilingCents !== null &&
      (counts.overage + 1) * extraCents <= counts.ceilingCents;
    return room ? 'extra' : 'stopped';
  }
  return used >= included * 0.8 ? 'near' : 'ok';
}
