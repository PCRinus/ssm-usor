import {
  type BillingChoice,
  billingPlans,
  type BillingPreview,
  type PaidPlan,
} from '@ssm-usor/contracts';

import { formatEuro, shortPlanNames } from '../billing-format';
import type { BillingOwner } from '../use-billing';

export interface ChoiceLimits {
  minPacks: number;
  maxPacks: number;
  minMembers: number;
  maxMembers: number;
}

export function limitsFor(plan: PaidPlan, owner: BillingOwner): ChoiceLimits {
  const terms = billingPlans[plan];
  const { minimums } = owner.choices[plan];
  return {
    minPacks: minimums.employeePacks,
    maxPacks: terms.maxEmployeePacks ?? 100,
    minMembers: minimums.extraMembers,
    maxMembers: terms.maxMembers === null ? 100 : terms.maxMembers - terms.includedMembers,
  };
}

export function clampChoice(choice: BillingChoice, owner: BillingOwner): BillingChoice {
  const limits = limitsFor(choice.plan, owner);
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(Math.max(min, max), value));
  return {
    ...choice,
    employeePacks: clamp(choice.employeePacks, limits.minPacks, limits.maxPacks),
    extraMembers: clamp(choice.extraMembers, limits.minMembers, limits.maxMembers),
  };
}

export function unavailableReason(plan: PaidPlan, owner: BillingOwner) {
  const reasons = owner.choices[plan].problems.map((problem) => problem.reason);
  if (reasons.includes('start_employee_ceiling')) return 'Start acoperă cel mult 600 de angajați.';
  if (reasons.includes('start_member_ceiling')) return 'Start are cel mult 2 utilizatori.';
  return null;
}

export type CheckoutMode = 'new' | 'change';

export function ctaLabel(
  mode: CheckoutMode,
  choice: BillingChoice,
  preview: BillingPreview | undefined
) {
  if (mode === 'change') return 'Continuă';
  if (!preview) return 'Continuă';
  return preview.dueToday.totalCents === 0
    ? `Salvează cardul și alege ${shortPlanNames[choice.plan]}`
    : `Plătește ${formatEuro(preview.dueToday.totalCents)}`;
}
