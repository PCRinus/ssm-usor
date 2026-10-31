import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import { grantCredits } from './grant-credits';

const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const ownerId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
const now = new Date('2026-10-20T12:00:00.000Z');

const paidStart = {
  organization_id: organizationId,
  plan: 'start',
  status: 'active',
  created_at: '2026-08-01T08:00:00.000Z',
  trial_ends_at: '2026-08-31T08:00:00.000Z',
  stripe_subscription_id: 'sub_1Test',
  stripe_customer_id: 'cus_1Test',
  tester_allowances: false,
  first_paid_at: '2026-08-31T08:05:00.000Z',
  billing_anchor_at: '2026-08-31T08:00:00.000Z',
  current_period_end: '2026-10-31T08:00:00.000Z',
  sms_cap_factor: 3,
};

function clientWith(
  subscription: Record<string, unknown> | null,
  granted: () => Response = () => Response.json(380)
) {
  const calls: { path: string; body: unknown }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path: url.pathname, body });
    switch (url.pathname) {
      case '/rest/v1/rpc/auth_user_id_by_address':
        return Response.json(ownerId);
      case '/rest/v1/organization_members':
        return Response.json({ organization_id: organizationId, organizations: { name: 'Firma' } });
      case '/rest/v1/subscriptions':
        return Response.json(subscription);
      case '/rest/v1/rpc/grant_credits':
        return granted();
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = createClient<Database>('https://example.supabase.co', 'sb_secret_test_key_value', {
    auth: { persistSession: false },
    global: { fetch: fetchFn },
  });
  return { client, calls };
}

const input = {
  email: 'owner@firma.ro',
  credits: 500,
  reason: 'A rămas fără credite',
  actor: 'mircea',
};

describe('adding credits by hand', () => {
  it("adds them to the subscription's current month, with the reason and who ran it", async () => {
    const { client, calls } = clientWith(paidStart);

    const result = await grantCredits(client, input, now);

    expect(result).toEqual({
      organizationId,
      organizationName: 'Firma',
      periodStart: new Date('2026-09-30T08:00:00.000Z'),
      periodEnd: new Date('2026-10-31T08:00:00.000Z'),
      balance: 380,
    });
    expect(calls.find((call) => call.path === '/rest/v1/rpc/grant_credits')?.body).toEqual({
      p_organization_id: organizationId,
      p_period_start: '2026-09-30T08:00:00.000Z',
      p_period_end: '2026-10-31T08:00:00.000Z',
      p_allowance: 300,
      p_previous_start: '2026-08-31T08:00:00.000Z',
      p_previous_end: '2026-09-30T08:00:00.000Z',
      p_previous_allowance: 300,
      p_credits: 500,
      p_reason: 'A rămas fără credite',
      p_actor: 'mircea',
    });
  });

  it("adds a tester's to the tester's month, and an ordinary trial's to the whole trial", async () => {
    const tester = {
      ...paidStart,
      plan: 'profesional',
      status: 'trialing',
      created_at: '2026-10-14T08:00:00.000Z',
      trial_ends_at: '2026-12-31T22:00:00.000Z',
      stripe_subscription_id: null,
      first_paid_at: null,
      billing_anchor_at: null,
      current_period_end: null,
      tester_allowances: true,
    };
    const first = clientWith(tester);
    await grantCredits(first.client, input, now);
    expect(
      first.calls.find((call) => call.path === '/rest/v1/rpc/grant_credits')?.body
    ).toMatchObject({
      p_period_start: '2026-10-14T08:00:00.000Z',
      p_period_end: '2026-11-14T08:00:00.000Z',
      p_allowance: 1500,
      p_previous_start: null,
    });

    const second = clientWith({ ...tester, tester_allowances: false });
    await grantCredits(second.client, input, now);
    expect(
      second.calls.find((call) => call.path === '/rest/v1/rpc/grant_credits')?.body
    ).toMatchObject({
      p_period_start: '2026-10-14T08:00:00.000Z',
      p_period_end: '2026-12-31T22:00:00.000Z',
      p_allowance: 300,
    });
  });

  it('refuses an organization without a limit', async () => {
    const { client, calls } = clientWith(null);

    await expect(grantCredits(client, input, now)).rejects.toThrow(/no limit/);
    expect(calls.some((call) => call.path === '/rest/v1/rpc/grant_credits')).toBe(false);
  });

  it("words the database's refusal of a missing reason", async () => {
    const { client } = clientWith(paidStart, () =>
      Response.json({ code: '22023', message: 'reason_required' }, { status: 400 })
    );

    await expect(grantCredits(client, input, now)).rejects.toThrow(/reason of at least three/);
  });

  it.each([0, 1.5, 100_001])('refuses %s credits', async (credits) => {
    await expect(
      grantCredits(clientWith(paidStart).client, { ...input, credits }, now)
    ).rejects.toThrow(/whole number/);
  });
});
