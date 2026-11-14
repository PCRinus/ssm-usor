import { testerMonthlyCredits, trialCredits } from '@ssm-usor/contracts';

import { creditBlockCents } from '../extras/policy';
import {
  billingAnchor,
  calendarMonth,
  dateOf,
  isPaid,
  monthAround,
  type Period,
  type SmsSubscription,
  stepOf,
  trialMonth,
} from '../sms-usage/policy';

export type CreditMonth = { period: Period; allowance: number };

export type CreditPolicy =
  | { limited: false; period: Period }
  | {
      limited: true;
      kind: 'trial' | 'month';
      period: Period;
      allowance: number;
      // The month whose shortfall comes off this one; null where there is none.
      previous: CreditMonth | null;
      // What a block of extra credits costs while extras may apply; null buys none.
      blockCents: number | null;
    };

const day = 86_400_000;

export const welcomeCreditsOf = (row: Pick<SmsSubscription, 'plan' | 'employee_step'>) =>
  row.plan === 'start' || row.plan === 'profesional' ? stepOf(row).welcomeCredits : 0;

const before = (period: Period) => new Date(period.start.getTime() - 1);

function testerMonths(row: SmsSubscription, now: Date) {
  const period = trialMonth(row, now);
  const start = new Date(row.created_at);
  const previous =
    period.start > start
      ? { period: monthAround(start, before(period)), allowance: testerMonthlyCredits }
      : null;
  return { period, previous };
}

/**
 * The months follow the SMS months (ADR 029). Before the first payment an ordinary trial has one
 * allowance for its whole length, and a tester's trial monthly credits; the step's credits and the
 * gift come with the first payment.
 */
export function creditPolicy(row: SmsSubscription | null, now: Date): CreditPolicy {
  if (!row || row.plan === 'enterprise') return { limited: false, period: calendarMonth(now) };
  const tester = row.tester_allowances;
  if (!isPaid(row)) {
    const trialEnd = dateOf(row.trial_ends_at);
    if (tester && row.status === 'trialing' && trialEnd !== null && trialEnd > now) {
      return {
        limited: true,
        kind: 'month',
        ...testerMonths(row, now),
        allowance: testerMonthlyCredits,
        blockCents: null,
      };
    }
    const start = new Date(row.created_at);
    // An ended trial keeps its one allowance; the period runs on so that it holds the present.
    const end = trialEnd && trialEnd > now ? trialEnd : new Date(now.getTime() + day);
    return {
      limited: true,
      kind: 'trial',
      period: { start, end: end > start ? end : new Date(start.getTime() + day) },
      allowance: trialCredits,
      previous: null,
      blockCents: null,
    };
  }

  const anchor = billingAnchor(row);
  const period = monthAround(anchor, now);
  const allowance = stepOf(row).monthlyCredits;
  const paidAt = dateOf(row.first_paid_at);
  const firstMonth = paidAt ? monthAround(anchor, paidAt) : null;
  let previous: CreditMonth | null;
  if (firstMonth && period.start <= firstMonth.start) {
    // The month before the first payment's was the trial.
    const trialStart = new Date(row.created_at);
    previous =
      trialStart >= period.start
        ? null
        : tester
          ? { period: monthAround(trialStart, before(period)), allowance: testerMonthlyCredits }
          : { period: { start: trialStart, end: period.start }, allowance: trialCredits };
  } else {
    previous = { period: monthAround(anchor, before(period)), allowance };
  }
  return {
    limited: true,
    kind: 'month',
    period,
    allowance,
    previous,
    blockCents: creditBlockCents(row),
  };
}
