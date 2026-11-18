import { billingPlans, type PaidPlan, type PlanStep, planStep } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';

export type EntitlementRow = {
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

export const entitlementColumns =
  'organization_id, plan, status, created_at, trial_ends_at, stripe_subscription_id, stripe_customer_id, tester_allowances, first_paid_at, billing_anchor_at, current_period_end, employee_step';

export async function loadEntitlementRow(
  db: AdminClient,
  organizationId: string
): Promise<EntitlementRow | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select(entitlementColumns)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'subscription entitlements');
  return data;
}

export async function loadEntitlementRows(db: AdminClient, organizationIds: string[]) {
  const found = new Map<string, EntitlementRow>();
  if (organizationIds.length === 0) return found;
  const { data, error } = await db
    .from('subscriptions')
    .select(entitlementColumns)
    .in('organization_id', organizationIds);
  if (error) throw fromDatabaseError(error, 'subscription entitlements');
  for (const row of data) found.set(row.organization_id, row);
  return found;
}

/** The step a chosen plan's allowances come from; a row without one has its plan's first. */
export function stepOf(row: Pick<EntitlementRow, 'plan' | 'employee_step'>): PlanStep {
  const plan = row.plan as PaidPlan;
  return (
    (row.employee_step === null ? undefined : planStep(plan, row.employee_step)) ??
    billingPlans[plan].steps[0]!
  );
}

export type Period = { start: Date; end: Date };

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
export function trialMonth(row: EntitlementRow, now: Date): Period {
  return monthAround(new Date(row.created_at), now);
}

// Stripe calls a subscription active only once an invoice is paid; the status also covers a
// first payment whose webhook came before the organization's row existed.
export const isPaid = (row: EntitlementRow) =>
  row.stripe_subscription_id !== null && (row.first_paid_at !== null || row.status === 'active');

export const billingAnchor = (row: EntitlementRow) =>
  dateOf(row.billing_anchor_at) ??
  dateOf(row.current_period_end) ??
  dateOf(row.first_paid_at) ??
  new Date(row.created_at);
