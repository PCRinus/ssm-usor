import type { MailService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { EntitlementRow } from '../billing/entitlements';
import { createUsageNotices, type SmsNoticeStore } from './notices';

const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const now = new Date('2026-12-01T10:00:00.000Z');

const paid: EntitlementRow = {
  plan: 'start',
  status: 'active',
  created_at: '2026-10-14T08:00:00.000Z',
  trial_ends_at: '2026-11-13T08:00:00.000Z',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_1',
  tester_allowances: false,
  first_paid_at: '2026-11-13T08:00:00.000Z',
  billing_anchor_at: '2026-11-13T08:00:00.000Z',
  current_period_end: null,
  employee_step: 250,
};

const chosenInTrial: EntitlementRow = {
  ...paid,
  status: 'trialing',
  created_at: '2026-11-20T08:00:00.000Z',
  trial_ends_at: '2026-12-20T08:00:00.000Z',
  first_paid_at: null,
  billing_anchor_at: null,
};

const tester: EntitlementRow = {
  ...chosenInTrial,
  plan: 'profesional',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  tester_allowances: true,
};

function setUp(options: { granted?: number; owner?: boolean; ceilingCents?: number } = {}) {
  const usage = { used: 0, overage: 0, granted: options.granted ?? 0 };
  const recorded = new Set<string>();
  const key = (organization: string, periodStart: string, kind: string) =>
    `${organization}|${periodStart}|${kind}`;
  const store = {
    periodUsage: vi.fn(async () => ({ ...usage })),
    smsCeiling: vi.fn(async () => options.ceilingCents ?? null),
    recordNotice: vi.fn(async (organization: string, periodStart: string, kind: string) => {
      const entry = key(organization, periodStart, kind);
      if (recorded.has(entry)) return false;
      recorded.add(entry);
      return true;
    }),
    forgetNotice: vi.fn(async (organization: string, periodStart: string, kind: string) => {
      recorded.delete(key(organization, periodStart, kind));
    }),
  } satisfies SmsNoticeStore;
  const sendSmsUsageNotice = vi.fn<MailService['sendSmsUsageNotice']>(async () => ({
    id: 'msg_1',
  }));
  const notices = createUsageNotices({
    store,
    recipient: async () =>
      options.owner === false
        ? null
        : { to: 'olga@prevenireplus.example', organizationName: 'Prevenire Plus SRL' },
    mail: { sendSmsUsageNotice } as unknown as MailService,
    subscriptionUrl: () => 'https://app.example.ro/organizatie/abonament',
  });
  const at = (used: number, row: EntitlementRow | null = paid) => {
    usage.used = used;
    usage.overage = Math.max(0, used - 50 - usage.granted);
    return notices(organizationId, row, now);
  };
  return { store, sendSmsUsageNotice, at, recorded };
}

describe('the usage notices', () => {
  it('tells the owner at the allowance that the codes go on as extras, when extras are on', async () => {
    const { at, sendSmsUsageNotice } = setUp({ ceilingCents: 1000 });

    expect(await at(40)).toBe('sms_80');
    expect(sendSmsUsageNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'sms_80', billed: true, cap: 150 })
    );
    expect(await at(50)).toBe('sms_100');
    expect(sendSmsUsageNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'sms_100', billed: true, used: 50, included: 50, cap: 150 })
    );
  });

  it('emails the owner of a paid plan once at 80 % and once at 100 %, where the codes stop', async () => {
    const { at, sendSmsUsageNotice } = setUp();

    expect(await at(39)).toBeNull();
    expect(await at(40)).toBe('sms_80');
    expect(await at(41)).toBeNull();
    expect(await at(49)).toBeNull();
    expect(await at(50)).toBe('sms_100');
    expect(await at(51)).toBeNull();
    expect(await at(150)).toBeNull();

    expect(sendSmsUsageNotice.mock.calls.map(([email]) => [email.kind, email.used])).toEqual([
      ['sms_80', 40],
      ['sms_100', 50],
    ]);
    expect(sendSmsUsageNotice).toHaveBeenLastCalledWith({
      to: 'olga@prevenireplus.example',
      kind: 'sms_100',
      organizationName: 'Prevenire Plus SRL',
      planName: 'Start',
      billed: false,
      used: 50,
      included: 50,
      cap: null,
      overageCents: 10,
      periodStart: '2026-11-13T08:00:00.000Z',
      periodEnd: '2026-12-13T08:00:00.000Z',
      subscriptionUrl: 'https://app.example.ro/organizatie/abonament',
    });
  });

  it('sends one email when two codes reach the threshold at once', async () => {
    const { at, sendSmsUsageNotice } = setUp();

    await Promise.all([at(40), at(40)]);

    expect(sendSmsUsageNotice).toHaveBeenCalledOnce();
  });

  it('records the notice before it is sent', async () => {
    const { at, store, sendSmsUsageNotice } = setUp();

    await at(40);

    expect(store.recordNotice.mock.invocationCallOrder[0]).toBeLessThan(
      sendSmsUsageNotice.mock.invocationCallOrder[0]!
    );
    expect(store.recordNotice).toHaveBeenCalledWith(
      organizationId,
      '2026-11-13T08:00:00.000Z',
      'sms_80'
    );
  });

  it('sends only the highest threshold reached, and never the lower one after it', async () => {
    const { at, sendSmsUsageNotice } = setUp();

    expect(await at(50)).toBe('sms_100');
    expect(await at(50)).toBeNull();

    expect(sendSmsUsageNotice).toHaveBeenCalledOnce();
  });

  it('counts the codes granted by hand into what is included', async () => {
    const { at, sendSmsUsageNotice } = setUp({ granted: 50 });

    expect(await at(79)).toBeNull();
    expect(await at(80)).toBe('sms_80');

    expect(sendSmsUsageNotice).toHaveBeenCalledWith(
      expect.objectContaining({ included: 100, cap: null })
    );
  });

  it("counts against the step's codes: 300 at Profesional's 1,500", async () => {
    const { at } = setUp();
    const profesional = { ...paid, plan: 'profesional', employee_step: 1500 };

    expect(await at(239, profesional)).toBeNull();
    expect(await at(240, profesional)).toBe('sms_80');
  });

  it("names no plan for a tester's trial, which stops hard at 300", async () => {
    const { at, sendSmsUsageNotice } = setUp();

    expect(await at(300, tester)).toBe('sms_100');

    expect(sendSmsUsageNotice).toHaveBeenCalledWith(
      expect.objectContaining({ planName: null, billed: false, included: 300, cap: null })
    );
  });

  it.each([
    ['no subscription', null],
    ['Enterprise', { ...paid, plan: 'enterprise' }],
    ['a trial that sends no SMS', { ...tester, tester_allowances: false }],
    ['a plan chosen during the trial before 2026-11-14, until its first payment', chosenInTrial],
  ])('sends nothing for %s', async (_, row) => {
    const { at, store, sendSmsUsageNotice } = setUp();

    expect(await at(10_000, row)).toBeNull();

    expect(store.recordNotice).not.toHaveBeenCalled();
    expect(sendSmsUsageNotice).not.toHaveBeenCalled();
  });

  it('takes the record back when the email fails, so the next code tries again', async () => {
    const { at, store, sendSmsUsageNotice } = setUp();
    sendSmsUsageNotice.mockRejectedValueOnce(new Error('Resend refused'));

    await expect(at(40)).rejects.toThrow('Resend refused');
    expect(store.forgetNotice).toHaveBeenCalledWith(
      organizationId,
      '2026-11-13T08:00:00.000Z',
      'sms_80'
    );
    expect(await at(41)).toBe('sms_80');
    expect(sendSmsUsageNotice).toHaveBeenCalledTimes(2);
  });

  it('keeps the record when the organization has no owner to tell', async () => {
    const { at, sendSmsUsageNotice, recorded } = setUp({ owner: false });

    expect(await at(40)).toBe('sms_80');

    expect(sendSmsUsageNotice).not.toHaveBeenCalled();
    expect(recorded.size).toBe(1);
  });
});
