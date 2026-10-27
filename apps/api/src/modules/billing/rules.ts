import {
  type BillingAmounts,
  type BillingChoice,
  type BillingChoiceProblem,
  type BillingInterval,
  billingPlans,
  type BillingProductKey,
  employeePacks,
  extraMember,
  type PaidPlan,
  vatPercent,
} from '@ssm-usor/contracts';

export type Usage = { employees: number; members: number };

const planRank: Record<PaidPlan, number> = { start: 0, profesional: 1 };

export function minimumsFor(plan: PaidPlan, usage: Usage) {
  const terms = billingPlans[plan];
  const packSize = employeePacks[terms.employeePack].employees;
  return {
    employeePacks: Math.max(0, Math.ceil((usage.employees - terms.includedEmployees) / packSize)),
    extraMembers: Math.max(0, usage.members - terms.includedMembers),
  };
}

export function problemsWith(choice: BillingChoice, usage: Usage): BillingChoiceProblem[] {
  const terms = billingPlans[choice.plan];
  const ceilingEmployees =
    terms.maxEmployeePacks === null
      ? null
      : terms.includedEmployees +
        terms.maxEmployeePacks * employeePacks[terms.employeePack].employees;
  const problems: BillingChoiceProblem[] = [];
  const minimums = minimumsFor(choice.plan, usage);

  const overEmployees = ceilingEmployees !== null && usage.employees > ceilingEmployees;
  const overMembers = terms.maxMembers !== null && usage.members > terms.maxMembers;
  if (overEmployees) problems.push({ reason: 'start_employee_ceiling' });
  if (overMembers) problems.push({ reason: 'start_member_ceiling' });

  if (!overEmployees && choice.employeePacks < minimums.employeePacks) {
    problems.push({ reason: 'employee_packs_below_need', minimum: minimums.employeePacks });
  }
  if (!overMembers && choice.extraMembers < minimums.extraMembers) {
    problems.push({ reason: 'extra_members_below_need', minimum: minimums.extraMembers });
  }
  if (terms.maxEmployeePacks !== null && choice.employeePacks > terms.maxEmployeePacks) {
    problems.push({ reason: 'employee_packs_above_plan', maximum: terms.maxEmployeePacks });
  }
  if (terms.maxMembers !== null) {
    const maximum = terms.maxMembers - terms.includedMembers;
    if (choice.extraMembers > maximum) {
      problems.push({ reason: 'extra_members_above_plan', maximum });
    }
  }
  return problems;
}

export function vatOf(subtotalCents: number) {
  return Math.round((subtotalCents * vatPercent) / 100);
}

export function amounts(subtotalCents: number): BillingAmounts {
  const vatCents = vatOf(subtotalCents);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

export type ChoiceLine = { product: BillingProductKey; lookupKey: string; quantity: number };

export function choiceLines(choice: BillingChoice): ChoiceLine[] {
  const terms = billingPlans[choice.plan];
  const pack = employeePacks[terms.employeePack];
  const lines: ChoiceLine[] = [
    { product: choice.plan, lookupKey: terms.prices[choice.interval].lookupKey, quantity: 1 },
  ];
  if (choice.employeePacks > 0) {
    lines.push({
      product: pack.key,
      lookupKey: pack.prices[choice.interval].lookupKey,
      quantity: choice.employeePacks,
    });
  }
  if (choice.extraMembers > 0) {
    lines.push({
      product: extraMember.key,
      lookupKey: extraMember.prices[choice.interval].lookupKey,
      quantity: choice.extraMembers,
    });
  }
  return lines;
}

const unitAmounts = new Map<string, number>(
  [
    ...Object.values(billingPlans).flatMap((plan) => Object.values(plan.prices)),
    ...Object.values(employeePacks).flatMap((pack) => Object.values(pack.prices)),
    ...Object.values(extraMember.prices),
  ].map((price) => [price.lookupKey, price.unitAmount])
);

export function recurringPrice(choice: BillingChoice) {
  const lines = choiceLines(choice).map((line) => ({
    product: line.product,
    quantity: line.quantity,
    amountCents: unitAmounts.get(line.lookupKey)! * line.quantity,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.amountCents, 0);
  return { interval: choice.interval, lines, ...amounts(subtotal) };
}

export const sameChoice = (a: BillingChoice, b: BillingChoice) =>
  a.plan === b.plan &&
  a.interval === b.interval &&
  a.employeePacks === b.employeePacks &&
  a.extraMembers === b.extraMembers;

export type ChangeSplit = {
  // What changes at once, prorated; null when nothing does.
  now: BillingChoice | null;
  // What the renewal then moves to; null when nothing waits.
  atRenewal: BillingChoice | null;
  // Charged at once rather than added to the next renewal.
  chargeNow: boolean;
};

// ADR 029: an upgrade and an addition apply at once, monthly to annual too; a downgrade, a
// removal and annual to monthly wait for the renewal. A downgrade takes the rest of the choice
// with it, since moving to annual at once would push the cheaper plan a year away.
export function splitChange(current: BillingChoice, target: BillingChoice): ChangeSplit {
  if (sameChoice(current, target)) return { now: null, atRenewal: null, chargeNow: false };

  const downgrade = planRank[target.plan] < planRank[current.plan];
  let now: BillingChoice;
  if (downgrade) {
    now = { ...current, extraMembers: Math.max(current.extraMembers, target.extraMembers) };
  } else if (current.interval === 'month' && target.interval === 'year') {
    now = target;
  } else {
    const planChanges = target.plan !== current.plan;
    now = {
      plan: target.plan,
      interval: current.interval,
      employeePacks: planChanges
        ? target.employeePacks
        : Math.max(current.employeePacks, target.employeePacks),
      extraMembers: Math.max(current.extraMembers, target.extraMembers),
    };
  }

  return {
    now: sameChoice(now, current) ? null : now,
    atRenewal: sameChoice(now, target) ? null : target,
    chargeNow: now.interval === 'year',
  };
}

export function addInterval(date: Date, interval: BillingInterval) {
  const next = new Date(date);
  if (interval === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

const lookupKeyPattern =
  /^(start|profesional|employees50|employees500|member|sms_overage)_(monthly|annual)_(v[0-9]+)$/;

export function parseLookupKey(lookupKey: string | null | undefined) {
  const match = lookupKey ? lookupKeyPattern.exec(lookupKey) : null;
  if (!match) return null;
  return {
    product: match[1] as BillingProductKey,
    interval: (match[2] === 'monthly' ? 'month' : 'year') as BillingInterval,
    version: match[3]!,
  };
}

export type PricedItem = { lookupKey: string | null; quantity: number };

export function choiceFromItems(items: PricedItem[]) {
  let plan: { plan: PaidPlan; interval: BillingInterval; version: string } | null = null;
  let packs = 0;
  let members = 0;
  for (const item of items) {
    const parsed = parseLookupKey(item.lookupKey);
    if (!parsed) continue;
    if (parsed.product === 'start' || parsed.product === 'profesional') {
      plan = { plan: parsed.product, interval: parsed.interval, version: parsed.version };
    } else if (parsed.product === 'employees50' || parsed.product === 'employees500') {
      packs += item.quantity;
    } else if (parsed.product === 'member') {
      members += item.quantity;
    }
  }
  if (!plan) return null;
  return {
    choice: {
      plan: plan.plan,
      interval: plan.interval,
      employeePacks: packs,
      extraMembers: members,
    } satisfies BillingChoice,
    version: plan.version,
  };
}

export function usageLimits(
  row: {
    plan: string;
    status: string;
    stripe_subscription_id: string | null;
    trial_ends_at: string | null;
    trial_sms: boolean;
    employee_packs: number;
    extra_members: number;
  } | null,
  now: Date
) {
  if (!row || row.plan === 'enterprise') return { employees: null, members: null, sms: null };
  const inTrial =
    row.status === 'trialing' && row.trial_ends_at !== null && new Date(row.trial_ends_at) > now;
  if (inTrial) {
    const trial = billingPlans.profesional;
    // A trial sends no SMS; a plan chosen during it, or a tester's trial given SMS, does.
    const sms = row.stripe_subscription_id || row.trial_sms ? trial.monthlySms : 0;
    return { employees: trial.includedEmployees, members: trial.includedMembers, sms };
  }
  const terms = billingPlans[row.plan as PaidPlan];
  return {
    employees:
      terms.includedEmployees + row.employee_packs * employeePacks[terms.employeePack].employees,
    members: terms.includedMembers + row.extra_members,
    sms: terms.monthlySms,
  };
}
