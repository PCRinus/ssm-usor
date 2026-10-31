import { describe, expect, it } from 'vitest';

import {
  addMonths,
  isRomanianNumber,
  monthAround,
  smsPolicy,
  smsState,
  type SmsSubscription,
} from './policy';

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
  sms_cap_factor: 3,
};

const chosen: SmsSubscription = {
  ...trial,
  plan: 'start',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
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
    expect(policy).toMatchObject({ sends: true, allowance: 300, cap: null, bills: false });
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

  it("stops a plan chosen during the trial at the chosen plan's allowance, on a month that ends with the trial", () => {
    const policy = smsPolicy({ ...chosen, trial_ends_at: '2026-11-02T08:00:00.000Z' }, now);
    expect(policy).toMatchObject({ sends: true, allowance: 50, cap: null, bills: false });
    expect(policy.sends && iso(policy.period)).toEqual([
      '2026-10-14T08:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
    ]);
  });

  it('keeps the hard stop while the first charge has not gone through', () => {
    const policy = smsPolicy(
      { ...chosen, status: 'past_due', trial_ends_at: '2026-10-18T08:00:00.000Z' },
      now
    );
    expect(policy).toMatchObject({ sends: true, cap: null, bills: false });
  });

  it('bills codes past the allowance up to three times it, from the first payment', () => {
    expect(smsPolicy(paid, at('2026-12-01T00:00:00.000Z'))).toMatchObject({
      sends: true,
      allowance: 50,
      cap: 150,
      capFactor: 3,
      bills: true,
    });
    expect(smsPolicy({ ...paid, plan: 'profesional', sms_cap_factor: 5 }, now)).toMatchObject({
      allowance: 300,
      cap: 1500,
    });
  });

  it('counts an active subscription as paid even before the payment is recorded', () => {
    expect(smsPolicy({ ...paid, first_paid_at: null }, now)).toMatchObject({ bills: true });
  });

  it('sets no limit without a subscription or on Enterprise, on the calendar month', () => {
    const none = smsPolicy(null, now);
    expect(none).toMatchObject({ sends: true, allowance: null, cap: null, bills: false });
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
  const hardStop = smsPolicy(chosen, at('2026-10-20T00:00:00.000Z'));

  it.each([
    [39, 'ok'],
    [40, 'near'],
    [50, 'over'],
    [149, 'over'],
    [150, 'capped'],
  ] as const)('says %s of 50 with a cap of 150 is %s', (used, state) => {
    expect(smsState(policy, { used, included: 50, cap: 150 })).toBe(state);
  });

  it('says stopped at a hard stop, and none where nothing is texted', () => {
    expect(smsState(hardStop, { used: 50, included: 50, cap: null })).toBe('stopped');
    expect(smsState({ sends: false }, { used: 0, included: 0, cap: null })).toBe('none');
    expect(smsState(smsPolicy(null, new Date()), { used: 900, included: null, cap: null })).toBe(
      'ok'
    );
  });
});
