import type { MailService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createUsageNotices, type UsageNoticeStore } from './notices';
import type { SmsSubscription } from './policy';

const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const now = new Date('2026-12-01T10:00:00.000Z');

const paid: SmsSubscription = {
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
  sms_cap_factor: 3,
};

const chosenInTrial: SmsSubscription = {
  ...paid,
  status: 'trialing',
  created_at: '2026-11-20T08:00:00.000Z',
  trial_ends_at: '2026-12-20T08:00:00.000Z',
  first_paid_at: null,
  billing_anchor_at: null,
};

const tester: SmsSubscription = {
  ...chosenInTrial,
  plan: 'profesional',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  tester_allowances: true,
};

function setUp(options: { granted?: number; owner?: boolean } = {}) {
  const usage = { used: 0, overage: 0, granted: options.granted ?? 0 };
  const recorded = new Set<string>();
  const key = (organization: string, periodStart: string, kind: string) =>
    `${organization}|${periodStart}|${kind}`;
  const store = {
    periodUsage: vi.fn(async () => ({ ...usage })),
    recordNotice: vi.fn(async (organization: string, periodStart: string, kind: string) => {
      const entry = key(organization, periodStart, kind);
      if (recorded.has(entry)) return false;
      recorded.add(entry);
      return true;
    }),
    forgetNotice: vi.fn(async (organization: string, periodStart: string, kind: string) => {
      recorded.delete(key(organization, periodStart, kind));
    }),
  } satisfies UsageNoticeStore;
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
    subscriptionUrl: () => 'https://app.example.ro/organization/subscription',
  });
  const at = (used: number, row: SmsSubscription | null = paid) => {
    usage.used = used;
    return notices(organizationId, row, now);
  };
  return { store, sendSmsUsageNotice, at, recorded };
}

describe('the usage notices', () => {
  it('emails the owner once at 80 %, at 100 % and at the cap of a paid plan', async () => {
    const { at, sendSmsUsageNotice } = setUp();

    expect(await at(39)).toBeNull();
    expect(await at(40)).toBe('sms_80');
    expect(await at(41)).toBeNull();
    expect(await at(49)).toBeNull();
    expect(await at(50)).toBe('sms_100');
    expect(await at(51)).toBeNull();
    expect(await at(150)).toBe('sms_cap');
    expect(await at(150)).toBeNull();

    expect(sendSmsUsageNotice.mock.calls.map(([email]) => [email.kind, email.used])).toEqual([
      ['sms_80', 40],
      ['sms_100', 50],
      ['sms_cap', 150],
    ]);
    expect(sendSmsUsageNotice).toHaveBeenLastCalledWith({
      to: 'olga@prevenireplus.example',
      kind: 'sms_cap',
      organizationName: 'Prevenire Plus SRL',
      planName: 'Start',
      billed: true,
      used: 150,
      included: 50,
      cap: 150,
      overageCents: 10,
      periodStart: '2026-11-13T08:00:00.000Z',
      periodEnd: '2026-12-13T08:00:00.000Z',
      subscriptionUrl: 'https://app.example.ro/organization/subscription',
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

  it('counts the codes granted by hand into what is included and the cap', async () => {
    const { at, sendSmsUsageNotice } = setUp({ granted: 50 });

    expect(await at(79)).toBeNull();
    expect(await at(80)).toBe('sms_80');

    expect(sendSmsUsageNotice).toHaveBeenCalledWith(
      expect.objectContaining({ included: 100, cap: 200 })
    );
  });

  it('words a hard stop before the first payment as stopped, with no cap', async () => {
    const { at, sendSmsUsageNotice } = setUp();

    expect(await at(40, chosenInTrial)).toBe('sms_80');
    expect(await at(50, chosenInTrial)).toBe('sms_100');
    expect(await at(50, chosenInTrial)).toBeNull();

    expect(sendSmsUsageNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'sms_100',
        planName: 'Start',
        billed: false,
        cap: null,
        periodStart: '2026-11-20T08:00:00.000Z',
        periodEnd: '2026-12-20T08:00:00.000Z',
      })
    );
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
