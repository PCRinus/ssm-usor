import { describe, expect, it } from 'vitest';

import {
  choiceFromItems,
  minimumsFor,
  problemsWith,
  recurringPrice,
  splitChange,
  usageLimits,
} from './rules';

const start = { plan: 'start', interval: 'month', employeePacks: 0, extraMembers: 0 } as const;
const pro = { plan: 'profesional', interval: 'month', employeePacks: 0, extraMembers: 0 } as const;

describe('the packs and members a plan needs', () => {
  it('asks Start for the 50-packs that cover the employees above 250', () => {
    expect(minimumsFor('start', { employees: 312, members: 2 })).toEqual({
      employeePacks: 2,
      extraMembers: 1,
    });
    expect(minimumsFor('profesional', { employees: 312, members: 2 })).toEqual({
      employeePacks: 0,
      extraMembers: 0,
    });
  });

  it('refuses packs below what today needs, with the minimum', () => {
    expect(problemsWith(start, { employees: 312, members: 1 })).toEqual([
      { reason: 'employee_packs_below_need', minimum: 2 },
    ]);
  });

  it('keeps Start out past 600 employees or 2 members, and says which', () => {
    expect(problemsWith({ ...start, employeePacks: 7 }, { employees: 601, members: 1 })).toEqual([
      { reason: 'start_employee_ceiling' },
    ]);
    expect(problemsWith({ ...start, extraMembers: 1 }, { employees: 10, members: 3 })).toEqual([
      { reason: 'start_member_ceiling' },
    ]);
  });

  it('allows Start right at its ceilings', () => {
    expect(
      problemsWith({ ...start, employeePacks: 7, extraMembers: 1 }, { employees: 600, members: 2 })
    ).toEqual([]);
  });

  it('refuses more than Start sells', () => {
    expect(
      problemsWith({ ...start, employeePacks: 8, extraMembers: 2 }, { employees: 0, members: 1 })
    ).toEqual([
      { reason: 'employee_packs_above_plan', maximum: 7 },
      { reason: 'extra_members_above_plan', maximum: 1 },
    ]);
  });
});

describe('a price from the catalogue', () => {
  it('adds the packs and members and 21 % VAT', () => {
    expect(recurringPrice({ ...start, employeePacks: 4, extraMembers: 1 })).toMatchObject({
      subtotalCents: 3900 + 4 * 1500 + 1500,
      vatCents: 2394,
      totalCents: 13794,
    });
    expect(recurringPrice({ ...pro, interval: 'year' }).subtotalCents).toBe(149000);
  });
});

describe('when a change applies', () => {
  it('upgrades at once, monthly onto the next invoice', () => {
    expect(splitChange({ ...start, employeePacks: 2 }, pro)).toEqual({
      now: pro,
      atRenewal: null,
      chargeNow: false,
    });
  });

  it('charges an annual upgrade at once', () => {
    const annual = { ...start, interval: 'year' } as const;
    expect(splitChange(annual, { ...pro, interval: 'year' })).toMatchObject({
      now: { ...pro, interval: 'year' },
      chargeNow: true,
    });
  });

  it('drops what the higher plan includes in the same upgrade, rather than at the renewal', () => {
    const annualStart = { ...start, interval: 'year', employeePacks: 2, extraMembers: 1 } as const;
    const annualPro = { ...pro, interval: 'year', employeePacks: 0, extraMembers: 0 } as const;
    expect(splitChange(annualStart, annualPro)).toEqual({
      now: annualPro,
      atRenewal: null,
      chargeNow: true,
    });
    expect(splitChange({ ...start, extraMembers: 1 }, pro)).toEqual({
      now: pro,
      atRenewal: null,
      chargeNow: false,
    });
  });

  it('moves monthly to annual at once, with everything chosen', () => {
    const target = { ...pro, interval: 'year', employeePacks: 0, extraMembers: 0 } as const;
    expect(splitChange({ ...pro, extraMembers: 1 }, target)).toEqual({
      now: target,
      atRenewal: null,
      chargeNow: true,
    });
  });

  it('leaves a downgrade, a removal and annual to monthly for the renewal', () => {
    expect(splitChange(pro, { ...start, employeePacks: 1 })).toEqual({
      now: null,
      atRenewal: { ...start, employeePacks: 1 },
      chargeNow: false,
    });
    expect(splitChange({ ...pro, extraMembers: 2 }, { ...pro, extraMembers: 1 })).toEqual({
      now: null,
      atRenewal: { ...pro, extraMembers: 1 },
      chargeNow: false,
    });
    const annual = { ...pro, interval: 'year' } as const;
    expect(splitChange(annual, pro)).toMatchObject({ now: null, atRenewal: pro });
  });

  it('charges nothing today for what a downgrade needs', () => {
    const annualPro = { ...pro, interval: 'year' } as const;
    const annualStart = { ...start, interval: 'year', employeePacks: 1, extraMembers: 1 } as const;
    expect(splitChange(annualPro, annualStart)).toEqual({
      now: null,
      atRenewal: annualStart,
      chargeNow: false,
    });
    expect(splitChange({ ...pro, employeePacks: 1 }, { ...start, extraMembers: 1 })).toEqual({
      now: null,
      atRenewal: { ...start, extraMembers: 1 },
      chargeNow: false,
    });
  });

  it('leaves what annual to monthly adds for the renewal too', () => {
    const annual = { ...pro, interval: 'year', extraMembers: 1 } as const;
    const target = { ...pro, employeePacks: 1, extraMembers: 2 } as const;
    expect(splitChange(annual, target)).toEqual({
      now: null,
      atRenewal: target,
      chargeNow: false,
    });
  });

  it('splits an addition from a removal', () => {
    expect(
      splitChange(
        { ...pro, employeePacks: 1, extraMembers: 2 },
        { ...pro, employeePacks: 2, extraMembers: 0 }
      )
    ).toEqual({
      now: { ...pro, employeePacks: 2, extraMembers: 2 },
      atRenewal: { ...pro, employeePacks: 2, extraMembers: 0 },
      chargeNow: false,
    });
  });
});

describe('a subscription read back from its items', () => {
  it('takes the plan, interval and version from the lookup keys and the add-ons from quantities', () => {
    expect(
      choiceFromItems([
        { lookupKey: 'profesional_annual_v1', quantity: 1 },
        { lookupKey: 'employees500_annual_v1', quantity: 2 },
        { lookupKey: 'member_annual_v1', quantity: 1 },
        { lookupKey: 'sms_overage_monthly_v1', quantity: 1 },
      ])
    ).toEqual({
      choice: { plan: 'profesional', interval: 'year', employeePacks: 2, extraMembers: 1 },
      version: 'v1',
    });
  });

  it('finds no plan in something else', () => {
    expect(choiceFromItems([{ lookupKey: 'sms_overage_monthly_v1', quantity: 1 }])).toBeNull();
  });
});

describe('usage limits', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  const row = {
    plan: 'start',
    status: 'trialing',
    stripe_subscription_id: null as string | null,
    trial_ends_at: '2026-11-08T10:00:00Z',
    trial_sms: false,
    employee_packs: 2,
    extra_members: 1,
  };

  it("keeps the trial's limits until it ends, without SMS until a plan is chosen", () => {
    expect(usageLimits(row, now)).toEqual({ employees: 1500, members: 3, sms: 0 });
    expect(usageLimits({ ...row, stripe_subscription_id: 'sub_1' }, now).sms).toBe(300);
  });

  it("counts the plan's packs and extra members once paid", () => {
    expect(usageLimits({ ...row, status: 'active' }, now)).toEqual({
      employees: 350,
      members: 2,
      sms: 50,
    });
  });

  it('sets no limit without a subscription', () => {
    expect(usageLimits(null, now)).toEqual({ employees: null, members: null, sms: null });
  });
});
