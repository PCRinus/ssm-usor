import { isRomanianNumber } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { addMonths, monthAround, smsPolicy, smsState, type SmsSubscription } from './policy';

const at = (iso: string) => new Date(iso);
const iso = (period: { start: Date; end: Date }) => [
  period.start.toISOString(),
  period.end.toISOString(),
];

const trial: SmsSubscription = {
  plan: 'profesional',
  status: 'trialing',
  created_at: '2026-10-14T08:00:00.000Z',
  trial_ends_at: '2026-11-13T08:00:00.000Z',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  tester_allowances: false,
  first_paid_at: null,
  billing_anchor_at: null,
  current_period_end: null,
  employee_step: null,
};

const chosen: SmsSubscription = {
  ...trial,
  plan: 'start',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  employee_step: 250,
};

const paid: SmsSubscription = {
  ...chosen,
  status: 'active',
  first_paid_at: '2026-11-13T08:00:00.000Z',
  billing_anchor_at: '2026-11-13T08:00:00.000Z',
};

describe("the subscription's month", () => {
  it("adds months on the anchor's day, or the month's last day where it is shorter, as Stripe does", () => {
    const anchor = at('2026-01-31T10:00:00.000Z');
    expect(addMonths(anchor, 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(anchor, 2).toISOString()).toBe('2026-03-31T10:00:00.000Z');
    expect(addMonths(anchor, -2).toISOString()).toBe('2025-11-30T10:00:00.000Z');
  });

  it('finds the month a moment falls in, from 14.10 to 13.11', () => {
    const anchor = at('2026-06-14T09:30:00.000Z');
    expect(iso(monthAround(anchor, at('2026-10-20T12:00:00.000Z')))).toEqual([
      '2026-10-14T09:30:00.000Z',
      '2026-11-14T09:30:00.000Z',
    ]);
    expect(iso(monthAround(anchor, at('2026-10-14T09:30:00.000Z')))[0]).toBe(
      '2026-10-14T09:30:00.000Z'
    );
    expect(iso(monthAround(anchor, at('2026-10-14T09:29:59.000Z')))[0]).toBe(
      '2026-09-14T09:30:00.000Z'
    );
  });

  it('runs an annual plan on monthly months from its anchor', () => {
    const policy = smsPolicy(
      { ...paid, current_period_end: '2027-11-13T08:00:00.000Z' },
      at('2027-02-01T00:00:00.000Z')
    );
    expect(policy.sends && iso(policy.period)).toEqual([
      '2027-01-13T08:00:00.000Z',
      '2027-02-13T08:00:00.000Z',
    ]);
  });

  it('falls back to the day of the period end for a row from before the anchor was kept', () => {
    const policy = smsPolicy(
      { ...paid, billing_anchor_at: null, current_period_end: '2026-12-13T08:00:00.000Z' },
      at('2026-11-20T00:00:00.000Z')
    );
    expect(policy.sends && iso(policy.period)[0]).toBe('2026-11-13T08:00:00.000Z');
  });
});

describe('what an organization may text', () => {
  const now = at('2026-10-20T12:00:00.000Z');

  it('sends no SMS during a trial without a plan', () => {
    expect(smsPolicy(trial, now)).toEqual({ sends: false });
  });

  it("gives a tester's trial 300 codes a month from the trial's start, with a hard stop", () => {
    const policy = smsPolicy({ ...trial, tester_allowances: true }, now);
    expect(policy).toMatchObject({ sends: true, allowance: 300, extraCents: null });
    expect(policy.sends && iso(policy.period)).toEqual([
      '2026-10-14T08:00:00.000Z',
      '2026-11-14T08:00:00.000Z',
    ]);
  });

  it("sends none once a tester's trial has ended", () => {
    expect(
      smsPolicy({ ...trial, tester_allowances: true }, at('2026-11-14T00:00:00.000Z'))
    ).toEqual({ sends: false });
  });

  it('sends no SMS for a plan chosen with a trial end until its first charge', () => {
    expect(smsPolicy(chosen, now)).toEqual({ sends: false });
  });

  it("sends at the step's allowance while a failed first charge at the trial's end is retried", () => {
    const retrying = {
      ...chosen,
      status: 'past_due',
      trial_ends_at: '2026-10-18T08:00:00.000Z',
      billing_anchor_at: '2026-10-18T08:00:00.000Z',
    };
    const policy = smsPolicy(retrying, now);
    expect(policy).toMatchObject({ sends: true, allowance: 50, extraCents: null });
    expect(policy.sends && iso(policy.period)).toEqual([
      '2026-10-18T08:00:00.000Z',
      '2026-11-18T08:00:00.000Z',
    ]);
  });

  it("gives a plan paid during the trial its step's codes on Stripe's months from that payment", () => {
    const policy = smsPolicy(
      {
        ...paid,
        trial_ends_at: '2026-10-18T09:30:00.000Z',
        first_paid_at: '2026-10-18T09:30:00.000Z',
        billing_anchor_at: '2026-10-18T09:30:00.000Z',
      },
      now
    );
    expect(policy).toMatchObject({ sends: true, allowance: 50, extraCents: 10 });
    expect(policy.sends && iso(policy.period)).toEqual([
      '2026-10-18T09:30:00.000Z',
      '2026-11-18T09:30:00.000Z',
    ]);
  });

  it("lets a paid plan in good standing send extra codes at 0,10 € past its step's allowance", () => {
    expect(smsPolicy(paid, at('2026-12-01T00:00:00.000Z'))).toMatchObject({
      sends: true,
      allowance: 50,
      extraCents: 10,
    });
    expect(smsPolicy({ ...paid, plan: 'profesional', employee_step: 5000 }, now)).toMatchObject({
      allowance: 1000,
      extraCents: 10,
    });
    expect(smsPolicy({ ...paid, employee_step: 750 }, now)).toMatchObject({ allowance: 150 });
  });

  it('sends no extra code from a subscription past due or ended', () => {
    const later = at('2026-12-01T00:00:00.000Z');
    expect(smsPolicy({ ...paid, status: 'past_due' }, later)).toMatchObject({ extraCents: null });
    expect(smsPolicy({ ...paid, status: 'canceled' }, later)).toMatchObject({ extraCents: null });
  });

  it("falls back to the plan's first step for a row without one", () => {
    expect(smsPolicy({ ...paid, employee_step: null }, now)).toMatchObject({ allowance: 50 });
  });

  it("counts an active subscription's month from its anchor even before the payment is recorded", () => {
    const policy = smsPolicy({ ...paid, first_paid_at: null }, at('2026-12-01T00:00:00.000Z'));
    expect(policy.sends && iso(policy.period)[0]).toBe('2026-11-13T08:00:00.000Z');
  });

  it('sets no limit without a subscription or on Enterprise, on the calendar month', () => {
    const none = smsPolicy(null, now);
    expect(none).toMatchObject({ sends: true, allowance: null, extraCents: null });
    expect(none.sends && iso(none.period)).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ]);
    expect(smsPolicy({ ...paid, plan: 'enterprise' }, now)).toMatchObject({ allowance: null });
  });

  it('texts Romanian numbers only', () => {
    expect(isRomanianNumber('+40722123456')).toBe(true);
    expect(isRomanianNumber('+40212345678')).toBe(true);
    expect(isRomanianNumber('+33612345678')).toBe(false);
    expect(isRomanianNumber('+4072212345')).toBe(false);
  });
});

describe('the state of the meter', () => {
  const policy = smsPolicy(paid, at('2026-12-01T00:00:00.000Z'));

  const off = { overage: 0, ceilingCents: null };

  it.each([
    [39, 'ok'],
    [40, 'near'],
    [50, 'stopped'],
    [150, 'stopped'],
  ] as const)('says %s of 50 on a paid plan with extras off is %s', (used, state) => {
    expect(smsState(policy, { used, included: 50, ...off })).toBe(state);
  });

  it.each([
    [50, 0, 'extra'],
    [87, 37, 'extra'],
    [149, 99, 'extra'],
    [150, 100, 'stopped'],
  ] as const)('says %s of 50 with %s extra under a 10 € ceiling is %s', (used, overage, state) => {
    expect(smsState(policy, { used, included: 50, overage, ceilingCents: 1000 })).toBe(state);
  });

  it('says stopped where extras cannot apply, and none where nothing is texted', () => {
    const pastDue = smsPolicy({ ...paid, status: 'past_due' }, at('2026-12-01T00:00:00.000Z'));
    expect(smsState(pastDue, { used: 50, included: 50, overage: 0, ceilingCents: 1000 })).toBe(
      'stopped'
    );
    expect(smsState({ sends: false }, { used: 0, included: 0, ...off })).toBe('none');
    expect(smsState(smsPolicy(null, new Date()), { used: 900, included: null, ...off })).toBe('ok');
  });
});
