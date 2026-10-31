import type { SmsService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { SmsSubscription } from './policy';
import { createSmsSender } from './sender';
import type { Claim, SmsUsageStore } from './store';

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

function setUp(
  subscription: SmsSubscription | null,
  claim: Claim = { id: 'row-1', overage: false }
) {
  const store = {
    subscription: vi.fn(async () => subscription),
    subscriptions: vi.fn(),
    claim: vi.fn(async () => claim),
    markSent: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    periodUsage: vi.fn(),
    recordNotice: vi.fn(),
    forgetNotice: vi.fn(),
  } satisfies SmsUsageStore;
  const sendSigningCode = vi.fn(async () => ({ id: 'SM1' }));
  const onOverage = vi.fn();
  const onCounted = vi.fn();
  const sender = createSmsSender({
    sms: { sendSigningCode } as unknown as SmsService,
    store,
    onOverage,
    onCounted,
    now: () => now,
  });
  const send = (
    kind: 'signing_code' | 'participant_invitation' = 'signing_code',
    to = '+40722123456'
  ) =>
    sender.send({
      organizationId,
      kind,
      to,
      deliver: (sms) => sms.sendSigningCode({ to, code: '123456', expiresInMinutes: 10 }),
    });
  return { store, sendSigningCode, onOverage, onCounted, sender, send };
}

describe('the SMS sender', () => {
  it("counts a signing code against the month's allowance and cap, then marks it sent", async () => {
    const { store, send, sendSigningCode, onOverage } = setUp(paid);

    expect(await send()).toEqual({
      sent: true,
      id: 'row-1',
      overage: false,
      receipt: { id: 'SM1' },
    });
    expect(store.claim).toHaveBeenCalledWith({
      organizationId,
      kind: 'signing_code',
      period: {
        start: new Date('2026-11-13T08:00:00.000Z'),
        end: new Date('2026-12-13T08:00:00.000Z'),
      },
      allowance: 50,
      cap: 150,
    });
    expect(sendSigningCode).toHaveBeenCalledOnce();
    expect(store.markSent).toHaveBeenCalledWith('row-1', 'SM1', now);
    expect(onOverage).not.toHaveBeenCalled();
  });

  it('logs the other kinds uncounted, and looks for no usage notice', async () => {
    const { store, send, onCounted } = setUp(paid);

    await send('participant_invitation');

    expect(store.claim).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'participant_invitation', allowance: null, cap: null })
    );
    expect(onCounted).not.toHaveBeenCalled();
  });

  it('looks for a usage notice once a signing code is counted', async () => {
    const { send, onCounted } = setUp(paid);

    await send();

    expect(onCounted).toHaveBeenCalledWith(organizationId, paid);
  });

  it('reports a code past the allowance to Stripe, for the subscription’s customer', async () => {
    const { send, onOverage } = setUp(paid, { id: 'row-9', overage: true });

    await send();

    expect(onOverage).toHaveBeenCalledWith({ id: 'row-9', sentAt: now, customerId: 'cus_1' });
  });

  it('passes no cap for a hard stop, and never reports one', async () => {
    const hardStop = { ...paid, status: 'trialing', first_paid_at: null };
    const { store, send, onOverage } = setUp(hardStop, { id: 'row-2', overage: true });

    await send();

    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({ allowance: 50, cap: null }));
    expect(onOverage).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a trial without a plan',
      { ...paid, stripe_subscription_id: null, status: 'trialing' },
      '+40722123456',
      'sms_trial',
    ],
    ['a number outside Romania', paid, '+33612345678', 'sms_foreign_number'],
  ] as const)('refuses %s before counting anything', async (_, subscription, to, reason) => {
    const { store, send, sendSigningCode } = setUp({
      ...subscription,
      trial_ends_at: '2027-01-01T00:00:00.000Z',
    });

    expect(await send('signing_code', to)).toEqual({ sent: false, reason });
    expect(store.claim).not.toHaveBeenCalled();
    expect(sendSigningCode).not.toHaveBeenCalled();
  });

  it.each(['sms_allowance_reached', 'sms_cap_reached'] as const)(
    'answers the refusal the count gives (%s) and sends nothing',
    async (refusal) => {
      const { send, sendSigningCode, onCounted } = setUp(paid, { refusal });

      expect(await send()).toEqual({
        sent: false,
        reason: refusal,
        resumesAt: new Date('2026-12-13T08:00:00.000Z'),
      });
      expect(sendSigningCode).not.toHaveBeenCalled();
      expect(onCounted).toHaveBeenCalledWith(organizationId, paid);
    }
  );

  it('takes back the count of a message the provider refused', async () => {
    const { store, send, sendSigningCode, onCounted } = setUp(paid);
    sendSigningCode.mockRejectedValueOnce(new Error('Twilio refused'));

    await expect(send()).rejects.toThrow('Twilio refused');
    expect(store.release).toHaveBeenCalledWith('row-1');
    expect(store.markSent).not.toHaveBeenCalled();
    expect(onCounted).not.toHaveBeenCalled();
  });

  it('answers the gate without counting, for a caller that saves before it sends', async () => {
    const { store, sender } = setUp(null);

    expect(await sender.gate(organizationId, '+40722123456')).toBeNull();
    expect(await sender.gate(organizationId, '+33612345678')).toBe('sms_foreign_number');
    expect(
      await sender.gate(organizationId, '+40722123456', {
        ...paid,
        stripe_subscription_id: null,
        status: 'trialing',
      })
    ).toBe('sms_trial');
    expect(store.claim).not.toHaveBeenCalled();
  });
});
