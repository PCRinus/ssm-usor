import {
  amountsWithVat,
  type BillingChoice,
  type BillingInterval,
  type CancellationReason,
  type PaidPlan,
  planStep,
} from '@ssm-usor/contracts';

import { nounFor } from '@/features/dashboard/dashboard-format';

// Grouped by hand: Romanian Intl leaves four digits ungrouped, and the price list writes 1.490 €.
function grouped(value: number) {
  const sign = value < 0 ? '-' : '';
  return sign + String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "39 €", "83,49 €", "2.468,40 €". */
export function formatEuro(cents: number) {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const text = grouped(whole) + (rest ? `,${String(rest).padStart(2, '0')}` : '');
  return `${cents < 0 ? '-' : ''}${text} €`;
}

export function formatCount(value: number) {
  return grouped(value);
}

export const employeesLabel = (count: number) =>
  `${formatCount(count)} ${nounFor(count, 'lucrător', 'lucrători')}`;

export const shortPlanNames: Record<PaidPlan, string> = {
  start: 'Start',
  profesional: 'Profesional',
};

export const intervalAdjectives: Record<BillingInterval, string> = {
  month: 'lunar',
  year: 'anual',
};

export const perInterval: Record<BillingInterval, string> = {
  month: 'pe lună',
  year: 'pe an',
};

export interface PriceLine {
  label: string;
  amountCents: number;
}

/** "până la 500 de lucrători". */
export const stepLabel = (step: number) => `până la ${employeesLabel(step)}`;

export const priceOf = (choice: BillingChoice) =>
  planStep(choice.plan, choice.step)?.prices[choice.interval].unitAmount ?? 0;

// The list price of a choice for one interval, as the API's preview prices it, so the tab can
// show a plan's lines without asking for a preview.
export function choiceLines(choice: BillingChoice): PriceLine[] {
  return [
    {
      label: `${shortPlanNames[choice.plan]}, ${stepLabel(choice.step)}, ${intervalAdjectives[choice.interval]}`,
      amountCents: priceOf(choice),
    },
  ];
}

export function choiceAmounts(choice: BillingChoice) {
  const lines = choiceLines(choice);
  return { lines, ...amountsWithVat(lines.reduce((sum, line) => sum + line.amountCents, 0)) };
}

/** "Start, până la 500 de lucrători, lunar". */
export function choiceSummary(choice: BillingChoice) {
  return `${shortPlanNames[choice.plan]}, ${stepLabel(choice.step)}, ${intervalAdjectives[choice.interval]}`;
}

const cardBrands: Record<string, { name: string; short: string }> = {
  visa: { name: 'Visa', short: 'VISA' },
  mastercard: { name: 'Mastercard', short: 'MC' },
  amex: { name: 'American Express', short: 'AMEX' },
  maestro: { name: 'Maestro', short: 'MAE' },
  discover: { name: 'Discover', short: 'DISC' },
  diners: { name: 'Diners Club', short: 'DC' },
  jcb: { name: 'JCB', short: 'JCB' },
  unionpay: { name: 'UnionPay', short: 'UP' },
};

export function cardBrand(brand: string) {
  return cardBrands[brand] ?? { name: 'Card', short: brand.slice(0, 4).toUpperCase() || 'CARD' };
}

export const cancellationReasons: Record<CancellationReason, string> = {
  too_expensive: 'E prea scump',
  missing_features: 'Îmi lipsește ceva de care am nevoie',
  switched_service: 'Trec la alt serviciu',
  unused: 'Nu îl folosesc destul',
  too_complex: 'E greu de folosit',
  low_quality: 'Nu merge cum mă așteptam',
  customer_service: 'Nu am primit ajutorul de care aveam nevoie',
  other: 'Alt motiv',
};

export function addDays(timestamp: string, days: number) {
  return new Date(new Date(timestamp).getTime() + days * 86_400_000).toISOString();
}
