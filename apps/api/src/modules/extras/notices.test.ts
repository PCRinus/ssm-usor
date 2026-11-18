import type { MailService } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { EntitlementRow } from '../billing/entitlements';
import { createExtrasNotices } from './notices';

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

function setUp(options: { row?: EntitlementRow; ceiling?: number | null } = {}) {
  const month = {
    periodStart: '2026-11-13T08:00:00.000Z',
    periodEnd: '2026-12-13T08:00:00.000Z',
    used: 0,
  };
  const recorded = new Set<string>();
  const sendExtrasNotice = vi.fn<MailService['sendExtrasNotice']>(async () => ({ id: 'm' }));
  const notices = createExtrasNotices({
    subscription: async () => options.row ?? paid,
    ceiling: async () => (options.ceiling === undefined ? 1000 : options.ceiling),
    month: async () => ({ ...month }),
    recordNotice: async (_, start, kind) => {
      if (recorded.has(start + kind)) return false;
      recorded.add(start + kind);
      return true;
    },
    forgetNotice: async (_, start, kind) => void recorded.delete(start + kind),
    recipient: async () => ({ to: 'ana@example.ro', organizationName: 'Prevenire Plus SRL' }),
    mail: { sendExtrasNotice } as unknown as MailService,
    subscriptionUrl: () => 'https://app.example.ro/organizatie/abonament',
  });
  const at = (kind: 'sms' | 'credits', used: number) => {
    month.used = used;
    return notices(organizationId, kind, now);
  };
  return { at, sendExtrasNotice };
}

describe('the extras notices', () => {
  it('emails at 80 % of the SMS ceiling and once it is reached, each once a month', async () => {
    const { at, sendExtrasNotice } = setUp();

    expect(await at('sms', 79)).toBeNull();
    expect(await at('sms', 80)).toBe('sms_extra80');
    expect(await at('sms', 90)).toBeNull();
    expect(await at('sms', 100)).toBe('sms_extra100');
    expect(await at('sms', 100)).toBeNull();
    expect(sendExtrasNotice).toHaveBeenLastCalledWith({
      to: 'ana@example.ro',
      kind: 'sms',
      level: 'reached',
      organizationName: 'Prevenire Plus SRL',
      ceilingCents: 1000,
      spentCents: 1000,
      used: 100,
      limit: 100,
      periodEnd: '2026-12-13T08:00:00.000Z',
      subscriptionUrl: 'https://app.example.ro/organizatie/abonament',
    });
  });

  it('counts the credits in the whole blocks the ceiling buys: 10 € is 600 credits', async () => {
    const { at, sendExtrasNotice } = setUp();

    expect(await at('credits', 400)).toBeNull();
    expect(await at('credits', 500)).toBe('credits_extra80');
    expect(await at('credits', 600)).toBe('credits_extra100');
    expect(sendExtrasNotice).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'credits', spentCents: 900, used: 600, limit: 600 })
    );
  });

  it('sends nothing while extras are off, or cannot apply', async () => {
    expect(await setUp({ ceiling: null }).at('sms', 100)).toBeNull();
    expect(await setUp({ row: { ...paid, status: 'past_due' } }).at('sms', 100)).toBeNull();
  });
});
