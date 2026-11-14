import {
  billingPlans,
  type PaidPlan,
  type PlanStep,
  planStep,
  type SmsUsageState,
  testerMonthlySms,
} from '@ssm-usor/contracts';

import { smsExtraCents } from '../extras/policy';

export type SmsSubscription = {
  plan: string;
  status: string;
  created_at: string;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  tester_allowances: boolean;
  first_paid_at: string | null;
  billing_anchor_at: string | null;
  current_period_end: string | null;
  employee_step: number | null;
};

export const smsSubscriptionColumns =
  'organization_id, plan, status, created_at, trial_ends_at, stripe_subscription_id, stripe_customer_id, tester_allowances, first_paid_at, billing_anchor_at, current_period_end, employee_step';

/** The step a chosen plan's allowances come from; a row without one has its plan's first. */
export function stepOf(row: Pick<SmsSubscription, 'plan' | 'employee_step'>): PlanStep {
  const plan = row.plan as PaidPlan;
  return (
    (row.employee_step === null ? undefined : planStep(plan, row.employee_step)) ??
    billingPlans[plan].steps[0]!
  );
}

export type Period = { start: Date; end: Date };

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

// Stripe's months: the anchor's day, or the month's last day where the month is shorter.
export function addMonths(anchor: Date, months: number) {
  const target = new Date(anchor);
  target.setUTCDate(1);
  target.setUTCMonth(anchor.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return target;
}

export function monthAround(anchor: Date, now: Date): Period {
  let months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  while (addMonths(anchor, months) > now) months -= 1;
  while (addMonths(anchor, months + 1) <= now) months += 1;
  return { start: addMonths(anchor, months), end: addMonths(anchor, months + 1) };
}

export function calendarMonth(now: Date): Period {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export const dateOf = (value: string | null) => (value ? new Date(value) : null);

/** A tester's months run from the trial's start, which stays put when the trial is extended. */
export function trialMonth(row: SmsSubscription, now: Date): Period {
  return monthAround(new Date(row.created_at), now);
}

// Stripe calls a subscription active only once an invoice is paid; the status also covers a
// first payment whose webhook came before the organization's row existed.
export const isPaid = (row: SmsSubscription) =>
  row.stripe_subscription_id !== null && (row.first_paid_at !== null || row.status === 'active');

export const billingAnchor = (row: SmsSubscription) =>
  dateOf(row.billing_anchor_at) ??
  dateOf(row.current_period_end) ??
  dateOf(row.first_paid_at) ??
  new Date(row.created_at);

export function smsPolicy(row: SmsSubscription | null, now: Date): SmsPolicy {
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
