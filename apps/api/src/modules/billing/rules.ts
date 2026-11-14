import {
  type BillingAmounts,
  type BillingChoice,
  type BillingChoiceProblem,
  type BillingInterval,
  billingPlans,
  type BillingProductKey,
  lastStep,
  type PaidPlan,
  planStep,
  selfServeLimits,
  stepFor,
  vatPercent,
} from '@ssm-usor/contracts';

export type Usage = { employees: number; members: number };

export function minimumStepFor(plan: PaidPlan, employees: number) {
  return stepFor(plan, employees)?.employees ?? null;
}

export function problemsWith(choice: BillingChoice, usage: Usage): BillingChoiceProblem[] {
  const problems: BillingChoiceProblem[] = [];
  const minimum = minimumStepFor(choice.plan, usage.employees);
  const members = billingPlans[choice.plan].members;
  if (minimum === null) {
    problems.push({ reason: 'employees_over_plan', maximum: lastStep(choice.plan).employees });
  } else if (choice.step < minimum) {
    problems.push({ reason: 'step_below_need', minimum });
  }
  if (usage.members > members) problems.push({ reason: 'members_over_plan', maximum: members });
  return problems;
}

export function vatOf(subtotalCents: number) {
  return Math.round((subtotalCents * vatPercent) / 100);
}

export function amounts(subtotalCents: number): BillingAmounts {
  const vatCents = vatOf(subtotalCents);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

const priceOf = (choice: BillingChoice) =>
  planStep(choice.plan, choice.step)!.prices[choice.interval];

export type ChoiceLine = { product: BillingProductKey; lookupKey: string; quantity: number };

export function choiceLines(choice: BillingChoice): ChoiceLine[] {
  return [{ product: choice.plan, lookupKey: priceOf(choice).lookupKey, quantity: 1 }];
}

export function recurringPrice(choice: BillingChoice) {
  const subtotal = priceOf(choice).unitAmount;
  return {
    interval: choice.interval,
    lines: [{ product: choice.plan, quantity: 1, amountCents: subtotal }],
    ...amounts(subtotal),
  };
}

export const sameChoice = (a: BillingChoice, b: BillingChoice) =>
  a.plan === b.plan && a.step === b.step && a.interval === b.interval;

// Every Profesional step costs more than every Start step, so the monthly price ranks the plans
// as well as the steps.
const rankOf = (choice: BillingChoice) =>
  planStep(choice.plan, choice.step)!.prices.month.unitAmount;

export type ChangeSplit = {
  // What changes at once, prorated; null when nothing does.
  now: BillingChoice | null;
  // What the renewal then moves to; null when nothing waits.
  atRenewal: BillingChoice | null;
  // Charged at once rather than added to the next renewal.
  chargeNow: boolean;
};

// ADR 029: an upgrade, a higher step included, and monthly to annual apply at once; a lower step,
// a downgrade and annual to monthly wait for the renewal, and take the rest of the choice with
// them, so the current plan is never charged for what belongs to the next period.
export function splitChange(current: BillingChoice, target: BillingChoice): ChangeSplit {
  if (sameChoice(current, target)) return { now: null, atRenewal: null, chargeNow: false };
  const down = rankOf(target) < rankOf(current);
  const toMonthly = current.interval === 'year' && target.interval === 'month';
  if (down || toMonthly) return { now: null, atRenewal: target, chargeNow: false };
  return { now: target, atRenewal: null, chargeNow: target.interval === 'year' };
}

export function addInterval(date: Date, interval: BillingInterval) {
  const next = new Date(date);
  if (interval === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

// v1 had one price per plan, with packs of employees and extra members as quantities beside it;
// a subscription on it still renews until the owner changes it (ADR 029, amendment of 2026-11-14).
const lookupKeyPattern =
  /^(start|profesional|employees50|employees500|member|sms_overage|credits_extra)(?:_([0-9]+))?_(monthly|annual)_(v[0-9]+)$/;

export type ParsedLookupKey = {
  product: BillingProductKey | 'employees50' | 'employees500' | 'member';
  step: number | null;
  interval: BillingInterval;
  version: string;
};

export function parseLookupKey(lookupKey: string | null | undefined): ParsedLookupKey | null {
  const match = lookupKey ? lookupKeyPattern.exec(lookupKey) : null;
  if (!match) return null;
  return {
    product: match[1] as ParsedLookupKey['product'],
    step: match[2] ? Number(match[2]) : null,
    interval: match[3] === 'monthly' ? 'month' : 'year',
    version: match[4]!,
  };
}

export const isPlanProduct = (product: string | undefined): product is PaidPlan =>
  product === 'start' || product === 'profesional';

const v1Covered = {
  start: { included: 250, pack: 50 },
  profesional: { included: 1500, pack: 500 },
};

export type PricedItem = { lookupKey: string | null; quantity: number };

export function choiceFromItems(items: PricedItem[]) {
  const parsed = items.map((item) => ({ ...item, key: parseLookupKey(item.lookupKey) }));
  const planItem = parsed.find((item) => isPlanProduct(item.key?.product));
  if (!planItem?.key) return null;
  const plan = planItem.key.product as PaidPlan;
  let step = planItem.key.step;
  if (step === null) {
    const packs = parsed
      .filter((item) => item.key?.product === 'employees50' || item.key?.product === 'employees500')
      .reduce((sum, item) => sum + item.quantity, 0);
    const covered = v1Covered[plan].included + packs * v1Covered[plan].pack;
    step = (stepFor(plan, covered) ?? lastStep(plan)).employees;
  }
  if (!planStep(plan, step)) return null;
  return {
    choice: { plan, step, interval: planItem.key.interval } satisfies BillingChoice,
    version: planItem.key.version,
  };
}

export function usageLimits(
  row: {
    plan: string;
    status: string;
    trial_ends_at: string | null;
    employee_step: number | null;
  } | null,
  now: Date
) {
  if (!row || row.plan === 'enterprise') return { employees: null, members: null };
  const inTrial =
    row.status === 'trialing' && row.trial_ends_at !== null && new Date(row.trial_ends_at) > now;
  const plan = row.plan as PaidPlan;
  if (inTrial) return { ...selfServeLimits };
  return {
    employees: row.employee_step ?? billingPlans[plan].steps[0]!.employees,
    members: billingPlans[plan].members,
  };
}
