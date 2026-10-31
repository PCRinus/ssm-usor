import { describe, expect, it } from 'vitest';

import type { SmsSubscription } from '../sms-usage/policy';
import { creditPolicy } from './policy';
import { creditsState, importCreditsOf, renewsAt, usageView } from './usage';

const now = new Date('2026-10-20T12:00:00.000Z');

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

const paid = (overrides: Partial<SmsSubscription> = {}): SmsSubscription => ({
  ...trial,
  plan: 'start',
  status: 'active',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  first_paid_at: '2026-09-13T08:02:00.000Z',
  billing_anchor_at: '2026-09-13T08:00:00.000Z',
  ...overrides,
});

const at = (iso: string) => new Date(iso);

describe('creditPolicy', () => {
  it('gives an ordinary trial 300 for its whole length, with no month before', () => {
    expect(creditPolicy(trial, now)).toEqual({
      limited: true,
      kind: 'trial',
      period: { start: at(trial.created_at), end: at(trial.trial_ends_at!) },
      allowance: 300,
      previous: null,
      giftPending: 0,
    });
  });

  it("keeps a plan chosen during the trial at the trial's 300, naming the gift its first payment brings", () => {
    const chosen = { ...trial, plan: 'start', stripe_subscription_id: 'sub_1' };

    expect(creditPolicy(chosen, now)).toMatchObject({
      kind: 'trial',
      allowance: 300,
      period: { end: at(trial.trial_ends_at!) },
      giftPending: 2500,
    });
  });

  it("gives a tester's trial 1,500 a month from the trial's start, with the month before", () => {
    const tester = { ...trial, created_at: '2026-09-01T08:00:00.000Z', tester_allowances: true };

    expect(creditPolicy(tester, now)).toEqual({
      limited: true,
      kind: 'month',
      period: { start: at('2026-10-01T08:00:00.000Z'), end: at('2026-11-01T08:00:00.000Z') },
      allowance: 1500,
      previous: {
        period: { start: at('2026-09-01T08:00:00.000Z'), end: at('2026-10-01T08:00:00.000Z') },
        allowance: 1500,
      },
      giftPending: 0,
    });
  });

  it("counts a paid plan on Stripe's months, the month before at the plan's allowance", () => {
    expect(creditPolicy(paid({ first_paid_at: '2026-08-13T08:00:00.000Z' }), now)).toEqual({
      limited: true,
      kind: 'month',
      period: { start: at('2026-10-13T08:00:00.000Z'), end: at('2026-11-13T08:00:00.000Z') },
      allowance: 300,
      previous: {
        period: { start: at('2026-09-13T08:00:00.000Z'), end: at('2026-10-13T08:00:00.000Z') },
        allowance: 300,
      },
      giftPending: 0,
    });
  });

  it('takes the trial as the month before the first paid one', () => {
    const first = paid({
      plan: 'profesional',
      created_at: '2026-09-20T08:00:00.000Z',
      first_paid_at: '2026-10-14T08:01:00.000Z',
      billing_anchor_at: '2026-10-14T08:00:00.000Z',
    });

    expect(creditPolicy(first, now)).toMatchObject({
      period: { start: at('2026-10-14T08:00:00.000Z') },
      allowance: 1500,
      previous: {
        period: { start: at('2026-09-20T08:00:00.000Z'), end: at('2026-10-14T08:00:00.000Z') },
        allowance: 300,
      },
    });
  });

  it('sets no limit on Enterprise or without a subscription', () => {
    expect(creditPolicy(null, now)).toMatchObject({ limited: false });
    expect(creditPolicy(paid({ plan: 'enterprise' }), now)).toMatchObject({ limited: false });
  });

  it('renews a month and a chosen plan at the period end, never a trial without a plan', () => {
    expect(renewsAt(creditPolicy(paid(), now))).toBe('2026-11-13T08:00:00.000Z');
    expect(renewsAt(creditPolicy({ ...trial, stripe_subscription_id: 'sub_1' }, now))).toBe(
      trial.trial_ends_at
    );
    expect(renewsAt(creditPolicy(trial, now))).toBeNull();
  });
});

describe('the credits meter', () => {
  it('names each state from what is left, the gift included', () => {
    expect(creditsState(300, 200, 0)).toBe('ok');
    expect(creditsState(300, 59, 0)).toBe('near');
    expect(creditsState(300, 0, 0)).toBe('out');
    expect(creditsState(300, -4, 0)).toBe('negative');
    expect(creditsState(300, -4, 2500)).toBe('ok');
    expect(creditsState(null, null, 0)).toBe('unlimited');
  });

  it('never shows a month used below zero, which a late refund can make', () => {
    const view = usageView(creditPolicy(paid(), now), {
      granted: 0,
      used: -25,
      shortfall: 0,
      balance: 325,
      giftLeft: 0,
    });
    expect(view).toMatchObject({ used: 0, left: 325, included: 300 });
  });
});

describe("an import's credits", () => {
  it('adds up the start, the pages settled and the scans, net of what was given back', () => {
    expect(
      importCreditsOf([
        { import_id: 'i', kind: 'import_start', credits: -14 },
        { import_id: 'i', kind: 'import_pages', credits: 3 },
      ])
    ).toEqual({ used: 11, atStart: 11, scannedPages: 0, refunded: false });
  });
});
