import { describe, expect, it } from 'vitest';

import {
  choiceFromItems,
  minimumStepFor,
  parseLookupKey,
  problemsWith,
  recurringPrice,
  splitChange,
  usageLimits,
} from './rules';

const start = { plan: 'start', step: 250, interval: 'month' } as const;
const pro = { plan: 'profesional', step: 500, interval: 'month' } as const;

describe('the step a plan needs', () => {
  it("is the plan's smallest step that covers today's employees", () => {
    expect(minimumStepFor('start', 0)).toBe(250);
    expect(minimumStepFor('start', 312)).toBe(500);
    expect(minimumStepFor('profesional', 312)).toBe(500);
    expect(minimumStepFor('profesional', 1501)).toBe(2000);
  });

  it('is none past the last step', () => {
    expect(minimumStepFor('start', 751)).toBeNull();
    expect(minimumStepFor('profesional', 5001)).toBeNull();
  });

  it('refuses a step below what today needs, with the minimum', () => {
    expect(problemsWith(start, { employees: 312, members: 1 })).toEqual([
      { reason: 'step_below_need', minimum: 500 },
    ]);
    expect(problemsWith({ ...start, step: 500 }, { employees: 500, members: 1 })).toEqual([]);
  });

  it('keeps Start out past 750 employees or three members, and says which', () => {
    expect(problemsWith({ ...start, step: 750 }, { employees: 751, members: 1 })).toEqual([
      { reason: 'employees_over_plan', maximum: 750 },
    ]);
    expect(problemsWith(start, { employees: 10, members: 4 })).toEqual([
      { reason: 'members_over_plan', maximum: 3 },
    ]);
    expect(problemsWith({ ...start, step: 750 }, { employees: 750, members: 3 })).toEqual([]);
  });

  it('keeps Profesional out past 5,000 employees or ten members', () => {
    expect(problemsWith({ ...pro, step: 5000 }, { employees: 5001, members: 11 })).toEqual([
      { reason: 'employees_over_plan', maximum: 5000 },
      { reason: 'members_over_plan', maximum: 10 },
    ]);
    expect(problemsWith(pro, { employees: 40, members: 10 })).toEqual([]);
  });
});

describe('a price from the catalogue', () => {
  it("is the step's price plus 21 % VAT", () => {
    expect(recurringPrice({ ...start, step: 500 })).toMatchObject({
      lines: [{ product: 'start', quantity: 1, amountCents: 5900 }],
      subtotalCents: 5900,
      vatCents: 1239,
      totalCents: 7139,
    });
  });

  it('pays ten twelfths a month, rounded down, for a year', () => {
    expect(recurringPrice({ ...start, interval: 'year' }).subtotalCents).toBe(38400);
    expect(
      recurringPrice({ plan: 'profesional', step: 1500, interval: 'year' }).subtotalCents
    ).toBe(148800);
  });
});

describe('when a change applies', () => {
  it('moves up a step at once, monthly onto the next invoice', () => {
    expect(splitChange(start, { ...start, step: 500 })).toEqual({
      now: { ...start, step: 500 },
      atRenewal: null,
      chargeNow: false,
    });
  });

  it('upgrades Start to Profesional at once, even to a step with fewer employees', () => {
    expect(splitChange({ ...start, step: 750 }, pro)).toEqual({
      now: pro,
      atRenewal: null,
      chargeNow: false,
    });
  });

  it('charges an annual upgrade at once', () => {
    const annual = { ...start, interval: 'year' } as const;
    expect(splitChange(annual, { ...pro, interval: 'year' })).toEqual({
      now: { ...pro, interval: 'year' },
      atRenewal: null,
      chargeNow: true,
    });
  });

  it('moves monthly to annual at once, with the step chosen', () => {
    const target = { ...pro, step: 1000, interval: 'year' } as const;
    expect(splitChange(pro, target)).toEqual({ now: target, atRenewal: null, chargeNow: true });
  });

  it('leaves a lower step, a downgrade and annual to monthly for the renewal', () => {
    expect(splitChange({ ...pro, step: 1000 }, pro)).toEqual({
      now: null,
      atRenewal: pro,
      chargeNow: false,
    });
    expect(splitChange(pro, { ...start, step: 750 })).toEqual({
      now: null,
      atRenewal: { ...start, step: 750 },
      chargeNow: false,
    });
    const annual = { ...pro, interval: 'year' } as const;
    expect(splitChange(annual, { ...pro, step: 1000 })).toEqual({
      now: null,
      atRenewal: { ...pro, step: 1000 },
      chargeNow: false,
    });
  });

  it('changes nothing for the same choice', () => {
    expect(splitChange(pro, pro)).toEqual({ now: null, atRenewal: null, chargeNow: false });
  });
});

describe('a subscription read back from its items', () => {
  it('takes the plan, step, interval and version from the lookup key', () => {
    expect(
      choiceFromItems([
        { lookupKey: 'profesional_2000_annual_v2', quantity: 1 },
        { lookupKey: 'sms_overage_monthly_v2', quantity: 1 },
      ])
    ).toEqual({
      choice: { plan: 'profesional', step: 2000, interval: 'year' },
      version: 'v2',
    });
  });

  it('reads a v1 subscription as the smallest step that covers its plan and packs', () => {
    expect(
      choiceFromItems([
        { lookupKey: 'start_monthly_v1', quantity: 1 },
        { lookupKey: 'employees50_monthly_v1', quantity: 3 },
        { lookupKey: 'member_monthly_v1', quantity: 1 },
        { lookupKey: 'sms_overage_monthly_v1', quantity: 1 },
      ])
    ).toEqual({ choice: { plan: 'start', step: 500, interval: 'month' }, version: 'v1' });
    expect(
      choiceFromItems([
        { lookupKey: 'profesional_annual_v1', quantity: 1 },
        { lookupKey: 'employees500_annual_v1', quantity: 20 },
      ])
    ).toEqual({ choice: { plan: 'profesional', step: 5000, interval: 'year' }, version: 'v1' });
  });

  it('finds no plan in something else', () => {
    expect(choiceFromItems([{ lookupKey: 'sms_overage_monthly_v2', quantity: 1 }])).toBeNull();
    expect(choiceFromItems([{ lookupKey: 'start_600_monthly_v2', quantity: 1 }])).toBeNull();
  });

  it('parses the lookup keys of both versions', () => {
    expect(parseLookupKey('start_750_monthly_v2')).toEqual({
      product: 'start',
      step: 750,
      interval: 'month',
      version: 'v2',
    });
    expect(parseLookupKey('employees50_annual_v1')).toEqual({
      product: 'employees50',
      step: null,
      interval: 'year',
      version: 'v1',
    });
    expect(parseLookupKey('nonsense')).toBeNull();
  });
});

describe('usage limits', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  const row = {
    plan: 'start',
    status: 'trialing',
    stripe_subscription_id: null as string | null,
    trial_ends_at: '2026-11-08T10:00:00Z',
    employee_step: 500 as number | null,
  };

  it("keeps the trial's limits, Profesional's largest, until it ends", () => {
    expect(usageLimits(row, now)).toEqual({ employees: 5000, members: 10 });
  });

  it('holds a plan chosen during the trial to its own users at once', () => {
    expect(usageLimits({ ...row, stripe_subscription_id: 'sub_1' }, now)).toEqual({
      employees: 5000,
      members: 3,
    });
  });

  it("counts the step's employees and the plan's users once the trial is over", () => {
    expect(usageLimits({ ...row, status: 'active' }, now)).toEqual({
      employees: 500,
      members: 3,
    });
    expect(
      usageLimits({ ...row, plan: 'profesional', status: 'active', employee_step: 2000 }, now)
    ).toEqual({ employees: 2000, members: 10 });
  });

  it("falls back to the plan's first step for a row without one", () => {
    expect(usageLimits({ ...row, status: 'canceled', employee_step: null }, now)).toEqual({
      employees: 250,
      members: 3,
    });
  });

  it('sets no limit without a subscription', () => {
    expect(usageLimits(null, now)).toEqual({ employees: null, members: null });
  });
});
