import {
  type BillingChoice,
  type BillingInterval,
  billingPlans,
  type CancellationReason,
  employeePacks,
  extraMember,
  type PaidPlan,
  vatPercent,
} from '@ssm-usor/contracts';

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

export function packOf(plan: PaidPlan) {
  return employeePacks[billingPlans[plan].employeePack];
}

/** "1 pachet de 500 de angajați", "2 pachete de câte 50 de angajați". */
export function packsLabel(plan: PaidPlan, packs: number) {
  const size = packOf(plan).employees;
  return packs === 1
    ? `1 pachet de ${size} de angajați`
    : `${packs} pachete de câte ${size} de angajați`;
}

export function extraMembersLabel(members: number) {
  return members === 1 ? '1 utilizator în plus' : `${members} utilizatori în plus`;
}

export function vatOf(subtotalCents: number) {
  return Math.round((subtotalCents * vatPercent) / 100);
}

export interface PriceLine {
  label: string;
  amountCents: number;
}

// The list price of a choice for one interval, as the API's preview prices it, so the tab can
// show a plan's lines without asking for a preview.
export function choiceLines(choice: BillingChoice): PriceLine[] {
  const terms = billingPlans[choice.plan];
  const lines: PriceLine[] = [
    {
      label: `${shortPlanNames[choice.plan]}, ${intervalAdjectives[choice.interval]}`,
      amountCents: terms.prices[choice.interval].unitAmount,
    },
  ];
  if (choice.employeePacks > 0) {
    lines.push({
      label: packsLabel(choice.plan, choice.employeePacks),
      amountCents: packOf(choice.plan).prices[choice.interval].unitAmount * choice.employeePacks,
    });
  }
  if (choice.extraMembers > 0) {
    lines.push({
      label: extraMembersLabel(choice.extraMembers),
      amountCents: extraMember.prices[choice.interval].unitAmount * choice.extraMembers,
    });
  }
  return lines;
}

export function choiceAmounts(choice: BillingChoice) {
  const lines = choiceLines(choice);
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const vatCents = vatOf(subtotalCents);
  return { lines, subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

export function employeeLimitOf(choice: Pick<BillingChoice, 'plan' | 'employeePacks'>) {
  return (
    billingPlans[choice.plan].includedEmployees +
    choice.employeePacks * packOf(choice.plan).employees
  );
}

export function memberLimitOf(choice: Pick<BillingChoice, 'plan' | 'extraMembers'>) {
  return billingPlans[choice.plan].includedMembers + choice.extraMembers;
}

export function packsNeeded(plan: PaidPlan, employees: number) {
  const terms = billingPlans[plan];
  return Math.max(0, Math.ceil((employees - terms.includedEmployees) / packOf(plan).employees));
}

/** "Start, lunar, cu 2 pachete și 1 utilizator în plus". */
export function choiceSummary(choice: BillingChoice) {
  const extras = [
    choice.employeePacks > 0
      ? choice.employeePacks === 1
        ? '1 pachet'
        : `${choice.employeePacks} pachete`
      : null,
    choice.extraMembers > 0 ? extraMembersLabel(choice.extraMembers) : null,
  ].filter(Boolean);
  const base = `${shortPlanNames[choice.plan]}, ${intervalAdjectives[choice.interval]}`;
  return extras.length ? `${base}, cu ${extras.join(' și ')}` : base;
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
