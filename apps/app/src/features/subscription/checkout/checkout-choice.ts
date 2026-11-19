import {
  type BillingChoice,
  type BillingInterval,
  billingPlans,
  type BillingPreview,
  capitalized,
  formatCount,
  lastStep,
  type PaidPlan,
  paidPlans,
  selfServeLimits,
  stepFor,
} from '@ssm-usor/contracts';

import { employeesLabel, formatEuro, perInterval, shortPlanNames } from '../billing-format';
import type { BillingOwner } from '../use-billing';

/** The picker's stops, the pricing page's: every step of either plan. */
export const employeeStops = [
  ...new Set(paidPlans.flatMap((plan) => billingPlans[plan].steps.map((step) => step.employees))),
].sort((a, b) => a - b);

/** The smallest stop that covers today's employees; null past the last. */
export function minimumStop(employees: number) {
  return employeeStops.find((stop) => stop >= employees) ?? null;
}

export interface Pick {
  plan: PaidPlan;
  stop: number;
  interval: BillingInterval;
}

export function choiceOf(pick: Pick): BillingChoice {
  const step = stepFor(pick.plan, pick.stop) ?? lastStep(pick.plan);
  return { plan: pick.plan, step: step.employees, interval: pick.interval };
}

export function unavailableReason(plan: PaidPlan, owner: BillingOwner, stop: number) {
  const name = shortPlanNames[plan];
  if (!stepFor(plan, stop)) {
    return `${name} acoperă cel mult ${formatCount(lastStep(plan).employees)} de lucrători.`;
  }
  const members = owner.choices[plan].problems.find(
    (problem) => problem.reason === 'members_over_plan'
  );
  if (members) return `${name} are cel mult ${billingPlans[plan].members} utilizatori.`;
  return null;
}

/** A pick the picker can show: never below today's employees, on a plan that fits the stop. */
export function fitPick(pick: Pick, owner: BillingOwner, employees: number): Pick {
  const floor = minimumStop(employees) ?? selfServeLimits.employees;
  const stop = Math.min(Math.max(pick.stop, floor), selfServeLimits.employees);
  const plan =
    unavailableReason(pick.plan, owner, stop) && !unavailableReason('profesional', owner, stop)
      ? 'profesional'
      : pick.plan;
  return { ...pick, plan, stop };
}

/**
 * Where an organization over its step goes: the plan's next step, Profesional's once Start's last
 * is passed, and none past Profesional's last, which is Enterprise's.
 */
export function nextStepOf(choice: BillingChoice, employees: number) {
  const own = stepFor(choice.plan, employees);
  if (own) return { plan: choice.plan, step: own };
  const profesional = choice.plan === 'start' ? stepFor('profesional', employees) : undefined;
  return profesional ? { plan: 'profesional' as const, step: profesional } : null;
}

export type NextStep = NonNullable<ReturnType<typeof nextStepOf>>;

/** "Treapta de 750 de lucrători costă 79 € + TVA pe lună." */
export function nextStepSentence(choice: BillingChoice, next: NextStep) {
  const price = `${formatEuro(next.step.prices[choice.interval].unitAmount)} + TVA ${perInterval[choice.interval]}`;
  const step = `treapta de ${employeesLabel(next.step.employees)}`;
  return next.plan === choice.plan
    ? `${capitalized(step)} costă ${price}.`
    : `${shortPlanNames[next.plan]}, cu ${step}, costă ${price}.`;
}

export const nextStepAction = (choice: BillingChoice, next: NextStep) => ({
  label: next.plan === choice.plan ? 'Treci pe treapta următoare' : 'Treci pe Profesional',
  search: { plan: next.plan, step: next.step.employees },
});

export type CheckoutMode = 'new' | 'change';

export function ctaLabel(
  mode: CheckoutMode,
  choice: BillingChoice,
  preview: BillingPreview | undefined
) {
  if (mode === 'change') return 'Continuă';
  if (!preview) return 'Continuă';
  return `Plătește ${formatEuro(preview.dueToday.totalCents)}`;
}
