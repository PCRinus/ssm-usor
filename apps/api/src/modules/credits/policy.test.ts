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
  employee_step: null,
};

const paid = (overrides: Partial<SmsSubscription> = {}): SmsSubscription => ({
  ...trial,
  plan: 'start',
  status: 'active',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  first_paid_at: '2026-09-13T08:02:00.000Z',
  billing_anchor_at: '2026-09-13T08:00:00.000Z',
  employee_step: 250,
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
    });
  });

  it("keeps a plan chosen during the trial before 2026-11-14 at the trial's 300 until its first payment", () => {
    const chosen = { ...trial, plan: 'start', stripe_subscription_id: 'sub_1', employee_step: 500 };

    expect(creditPolicy(chosen, now)).toEqual(creditPolicy(trial, now));
  });

  it("counts a higher step's monthly credits for the month under way", () => {
    expect(creditPolicy(paid({ employee_step: 750 }), now)).toMatchObject({
      period: { start: at('2026-10-13T08:00:00.000Z') },
      allowance: 1750,
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
    });
  });

  it("counts a paid plan on Stripe's months, the month before at the step's allowance", () => {
    expect(creditPolicy(paid({ first_paid_at: '2026-08-13T08:00:00.000Z' }), now)).toEqual({
      limited: true,
      kind: 'month',
      period: { start: at('2026-10-13T08:00:00.000Z'), end: at('2026-11-13T08:00:00.000Z') },
      allowance: 750,
      previous: {
        period: { start: at('2026-09-13T08:00:00.000Z'), end: at('2026-10-13T08:00:00.000Z') },
        allowance: 750,
      },
    });
  });

  it('takes the trial as the month before the first paid one', () => {
    const first = paid({
      plan: 'profesional',
      employee_step: 1500,
      created_at: '2026-09-20T08:00:00.000Z',
      first_paid_at: '2026-10-14T08:01:00.000Z',
      billing_anchor_at: '2026-10-14T08:00:00.000Z',
    });

    expect(creditPolicy(first, now)).toMatchObject({
      period: { start: at('2026-10-14T08:00:00.000Z') },
      allowance: 3250,
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

  it('renews a paid month at its end, never a trial', () => {
    expect(renewsAt(creditPolicy(paid(), now))).toBe('2026-11-13T08:00:00.000Z');
    expect(renewsAt(creditPolicy({ ...trial, stripe_subscription_id: 'sub_1' }, now))).toBeNull();
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
    expect(view).toMatchObject({ used: 0, left: 325, included: 750 });
  });
});

describe("an import's credits", () => {
  it('adds up the start, the pages settled and the scans, net of what was given back', () => {
    expect(
      importCreditsOf([
        { import_id: 'i', kind: 'import_start', credits: -14, import_part: null },
        { import_id: 'i', kind: 'import_pages', credits: 3, import_part: null },
      ])
    ).toEqual({
      used: 11,
      atStart: 11,
      scannedPages: 0,
      ownInstructions: 0,
      riskEvaluations: 0,
      refunded: false,
    });
  });

  it('counts the readings of its own instructions apart, net of a reading given back', () => {
    expect(
      importCreditsOf([
        { import_id: 'i', kind: 'import_start', credits: -25, import_part: null },
        { import_id: 'i', kind: 'scanned_page', credits: -1, import_part: null },
        { import_id: 'i', kind: 'library_part', credits: -25, import_part: 'instructions_ssm' },
        { import_id: 'i', kind: 'library_part', credits: -10, import_part: 'instructions_su' },
        {
          import_id: 'i',
          kind: 'library_part_refund',
          credits: 10,
          import_part: 'instructions_su',
        },
        { import_id: 'i', kind: 'library_part', credits: -10, import_part: 'instructions_su' },
      ])
    ).toEqual({
      used: 61,
      atStart: 25,
      scannedPages: 1,
      ownInstructions: 35,
      riskEvaluations: 0,
      refunded: false,
    });
  });

  it('counts the readings of the risk evaluations apart from the instructions', () => {
    expect(
      importCreditsOf([
        { import_id: 'i', kind: 'import_start', credits: -25, import_part: null },
        { import_id: 'i', kind: 'library_part', credits: -25, import_part: 'instructions_ssm' },
        { import_id: 'i', kind: 'library_part', credits: -15, import_part: 'risk_evaluations' },
        {
          import_id: 'i',
          kind: 'library_part_refund',
          credits: 15,
          import_part: 'risk_evaluations',
        },
        { import_id: 'i', kind: 'library_part', credits: -15, import_part: 'risk_evaluations' },
      ])
    ).toEqual({
      used: 65,
      atStart: 25,
      scannedPages: 0,
      ownInstructions: 25,
      riskEvaluations: 15,
      refunded: false,
    });
  });
});
