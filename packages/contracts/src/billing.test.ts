import { describe, expect, it } from 'vitest';

import {
  amountsWithVat,
  annualCents,
  billingChoiceSchema,
  type BillingInterval,
  billingPlans,
  cataloguePrices,
  catalogueProducts,
  changeSubscriptionRequestSchema,
  type PaidPlan,
  planStep,
  priceVersion,
  selfServeLimits,
  stepFor,
  vatOf,
} from './billing';

const euros = (plan: PaidPlan, interval: BillingInterval) =>
  billingPlans[plan].steps.map((step) => [step.employees, step.prices[interval].unitAmount / 100]);

describe('plan catalogue', () => {
  it('prices each step of Start and Profesional as the pricing page does', () => {
    expect(euros('start', 'month')).toEqual([
      [250, 39],
      [500, 59],
      [750, 79],
    ]);
    expect(euros('profesional', 'month')).toEqual([
      [500, 89],
      [1000, 119],
      [1500, 149],
      [2000, 179],
      [3000, 239],
      [4000, 299],
      [5000, 359],
    ]);
  });

  it('charges a year as twelve months of ten twelfths of the price, each rounded down', () => {
    expect(euros('start', 'year')).toEqual([
      [250, 384],
      [500, 588],
      [750, 780],
    ]);
    expect(euros('profesional', 'year').map(([, price]) => price)).toEqual([
      888, 1188, 1488, 1788, 2388, 2988, 3588,
    ]);
    expect(annualCents(3900)).toBe(38400);
  });

  it('gives three users on Start and ten on Profesional', () => {
    expect(billingPlans.start.members).toBe(3);
    expect(billingPlans.profesional.members).toBe(10);
    expect(selfServeLimits).toEqual({ employees: 5000, members: 10 });
  });

  it('includes a signing code for every five employees and two AI credits each plus 250', () => {
    const allowances = (plan: PaidPlan) =>
      billingPlans[plan].steps.map((step) => [step.monthlySms, step.monthlyCredits]);
    expect(allowances('start')).toEqual([
      [50, 750],
      [100, 1250],
      [150, 1750],
    ]);
    expect(planStep('profesional', 1500)).toMatchObject({ monthlySms: 300, monthlyCredits: 3250 });
    expect(planStep('profesional', 5000)).toMatchObject({
      monthlySms: 1000,
      monthlyCredits: 10250,
    });
  });

  it('gives ten welcome AI credits for every employee of the step, at most 10,000', () => {
    expect(billingPlans.start.steps.map((step) => step.welcomeCredits)).toEqual([2500, 5000, 7500]);
    expect(billingPlans.profesional.steps.map((step) => step.welcomeCredits)).toEqual([
      5000, 10000, 10000, 10000, 10000, 10000, 10000,
    ]);
  });

  it('finds the smallest step that covers the employees, and none past the last', () => {
    expect(stepFor('start', 0)?.employees).toBe(250);
    expect(stepFor('start', 251)?.employees).toBe(500);
    expect(stepFor('start', 751)).toBeUndefined();
    expect(stepFor('profesional', 2001)?.employees).toBe(3000);
    expect(stepFor('profesional', 5001)).toBeUndefined();
    expect(planStep('start', 1000)).toBeUndefined();
  });

  it('gives every price its own versioned lookup key, one per plan, step and period', () => {
    const keys = cataloguePrices.map((price) => price.lookupKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(22);
    expect(keys).toContain('start_250_monthly_v2');
    expect(keys).toContain('profesional_5000_annual_v2');
    for (const key of keys) {
      expect(key).toMatch(new RegExp(`^[a-z0-9_]+_(monthly|annual)_${priceVersion}$`));
    }
  });

  it('prices every product it lists, and lists every product it prices', () => {
    expect(new Set(cataloguePrices.map((price) => price.product))).toEqual(
      new Set(catalogueProducts.map((product) => product.key))
    );
    expect(catalogueProducts.map((product) => product.key)).toEqual([
      'start',
      'profesional',
      'sms_overage',
      'credits_extra',
    ]);
  });

  it('keeps two metered prices, both monthly, for the extras the owner may turn on', () => {
    expect(cataloguePrices.filter((price) => price.usage === 'metered')).toEqual([
      expect.objectContaining({ lookupKey: 'sms_overage_monthly_v2', interval: 'month' }),
      expect.objectContaining({ lookupKey: 'credits_extra_monthly_v2', interval: 'month' }),
    ]);
  });
});

describe('billing choice', () => {
  it('takes a plan, one of its steps and a period', () => {
    expect(
      billingChoiceSchema.safeParse({ plan: 'start', step: 500, interval: 'year' }).success
    ).toBe(true);
    expect(
      billingChoiceSchema.safeParse({ plan: 'start', step: 1000, interval: 'month' }).success
    ).toBe(false);
    expect(
      changeSubscriptionRequestSchema.safeParse({
        plan: 'profesional',
        step: 750,
        interval: 'month',
      }).success
    ).toBe(false);
  });
});

describe('VAT on a subtotal', () => {
  it('adds 21 % rounded to the cent', () => {
    expect(vatOf(3900)).toBe(819);
    expect(vatOf(1)).toBe(0);
    expect(vatOf(3)).toBe(1);
    expect(amountsWithVat(8349)).toEqual({
      subtotalCents: 8349,
      vatCents: 1753,
      totalCents: 10102,
    });
    expect(amountsWithVat(0)).toEqual({ subtotalCents: 0, vatCents: 0, totalCents: 0 });
  });
});
