import { z } from 'zod';

import { subscriptionPlanSchema } from './subscriptions';

export const billingIntervalSchema = z.enum(['month', 'year']);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

// Enterprise is a quote sold by email and never reaches the checkout (ADR 029).
export const paidPlanSchema = subscriptionPlanSchema.exclude(['enterprise']);
export type PaidPlan = z.infer<typeof paidPlanSchema>;

export const billingCurrency = 'eur';

// Added on top of every price, never included in it.
export const vatPercent = 21;

// A changed amount is a new Stripe price under a new version, never an edit of the old one: Stripe
// prices are immutable, and existing subscriptions move at their renewal (ADR 029).
export const priceVersion = 'v1';

export const billingProductKeySchema = z.enum([
  'start',
  'profesional',
  'employees50',
  'employees500',
  'member',
  'sms_overage',
]);
export type BillingProductKey = z.infer<typeof billingProductKeySchema>;

export type EmployeePackKey = Extract<BillingProductKey, 'employees50' | 'employees500'>;

export interface CataloguePrice {
  lookupKey: string;
  product: BillingProductKey;
  interval: BillingInterval;
  /** Euro cents, without VAT. */
  unitAmount: number;
  usage: 'licensed' | 'metered';
}

export interface CatalogueProduct {
  key: BillingProductKey;
  /** Romanian, as it reads on the invoice. */
  name: string;
}

const monthsPaidPerYear = 10;

function lookupKey(product: BillingProductKey, interval: BillingInterval) {
  return `${product}_${interval === 'month' ? 'monthly' : 'annual'}_${priceVersion}`;
}

function recurring(
  product: BillingProductKey,
  monthlyAmount: number
): Record<BillingInterval, CataloguePrice> {
  return {
    month: {
      lookupKey: lookupKey(product, 'month'),
      product,
      interval: 'month',
      unitAmount: monthlyAmount,
      usage: 'licensed',
    },
    year: {
      lookupKey: lookupKey(product, 'year'),
      product,
      interval: 'year',
      unitAmount: monthlyAmount * monthsPaidPerYear,
      usage: 'licensed',
    },
  };
}

export interface EmployeePack {
  key: EmployeePackKey;
  name: string;
  employees: number;
  prices: Record<BillingInterval, CataloguePrice>;
}

export const employeePacks: Record<EmployeePackKey, EmployeePack> = {
  employees50: {
    key: 'employees50',
    name: 'Pachet de 50 de angajați',
    employees: 50,
    prices: recurring('employees50', 1500),
  },
  employees500: {
    key: 'employees500',
    name: 'Pachet de 500 de angajați',
    employees: 500,
    prices: recurring('employees500', 4000),
  },
};

export const extraMember: {
  key: 'member';
  name: string;
  prices: Record<BillingInterval, CataloguePrice>;
} = {
  key: 'member',
  name: 'Utilizator în plus',
  prices: recurring('member', 1500),
};

// Monthly on every plan, annual ones too, which makes an annual subscription mixed-interval. The
// API reports only the codes past the plan's allowance, so one price serves both plans.
export const smsOverage: {
  key: 'sms_overage';
  name: string;
  meterEventName: string;
  price: CataloguePrice;
} = {
  key: 'sms_overage',
  name: 'SMS peste cele incluse în plan',
  meterEventName: 'sms_overage',
  price: {
    lookupKey: lookupKey('sms_overage', 'month'),
    product: 'sms_overage',
    interval: 'month',
    unitAmount: 10,
    usage: 'metered',
  },
};

export interface PlanTerms {
  key: PaidPlan;
  name: string;
  prices: Record<BillingInterval, CataloguePrice>;
  includedEmployees: number;
  includedMembers: number;
  /** Members in all, extra ones included; null where any number may be bought. */
  maxMembers: number | null;
  monthlySms: number;
  employeePack: EmployeePackKey;
  /** Null where any number may be bought. */
  maxEmployeePacks: number | null;
}

export const billingPlans: Record<PaidPlan, PlanTerms> = {
  start: {
    key: 'start',
    name: 'SSM Ușor Start',
    prices: recurring('start', 3900),
    includedEmployees: 250,
    includedMembers: 1,
    maxMembers: 2,
    monthlySms: 50,
    employeePack: 'employees50',
    // 600 employees: past that, Start with packs costs more than Profesional.
    maxEmployeePacks: 7,
  },
  profesional: {
    key: 'profesional',
    name: 'SSM Ușor Profesional',
    prices: recurring('profesional', 14900),
    includedEmployees: 1500,
    includedMembers: 3,
    maxMembers: null,
    monthlySms: 300,
    employeePack: 'employees500',
    maxEmployeePacks: null,
  },
};

export const catalogueProducts: CatalogueProduct[] = [
  ...Object.values(billingPlans),
  ...Object.values(employeePacks),
  extraMember,
  smsOverage,
].map(({ key, name }) => ({ key, name }));

export const cataloguePrices: CataloguePrice[] = [
  ...[...Object.values(billingPlans), ...Object.values(employeePacks), extraMember].flatMap(
    ({ prices }) => [prices.month, prices.year]
  ),
  smsOverage.price,
];
