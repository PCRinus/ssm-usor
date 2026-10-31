import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import { grantSigningCodes } from './grant-signing-codes';

const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const ownerId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';
const now = new Date('2026-10-20T12:00:00.000Z');

const testerTrial = {
  organization_id: organizationId,
  plan: 'profesional',
  status: 'trialing',
  created_at: '2026-10-14T08:00:00.000Z',
  trial_ends_at: '2026-12-31T22:00:00.000Z',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  tester_allowances: true,
  first_paid_at: null,
  billing_anchor_at: null,
  current_period_end: null,
  sms_cap_factor: 3,
};

function clientWith(subscription: Record<string, unknown> | null, owner: string | null = ownerId) {
  const calls: { path: string; body: unknown }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path: url.pathname, body });
    switch (url.pathname) {
      case '/rest/v1/rpc/auth_user_id_by_address':
        return Response.json(owner);
      case '/rest/v1/organization_members':
        return Response.json(
          owner
            ? { organization_id: organizationId, organizations: { name: 'Tester SSM SRL' } }
            : null
        );
      case '/rest/v1/subscriptions':
        return Response.json(subscription);
      case '/rest/v1/rpc/grant_signing_codes':
        return Response.json(150);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = createClient<Database>('https://example.supabase.co', 'sb_secret_test_key_value', {
    auth: { persistSession: false },
    global: { fetch: fetchFn },
  });
  return { client, calls };
}

const input = { email: 'tester@firma.ro', codes: 100, reason: 'Tester, runda 1', actor: 'mircea' };

describe('adding signing codes by hand', () => {
  it("adds them to the tester's current month, with the reason and who ran it", async () => {
    const { client, calls } = clientWith(testerTrial);

    const result = await grantSigningCodes(client, input, now);

    expect(result).toEqual({
      organizationId,
      organizationName: 'Tester SSM SRL',
      periodStart: new Date('2026-10-14T08:00:00.000Z'),
      periodEnd: new Date('2026-11-14T08:00:00.000Z'),
      granted: 150,
    });
    expect(calls.find((call) => call.path === '/rest/v1/rpc/grant_signing_codes')?.body).toEqual({
      p_organization_id: organizationId,
      p_period_start: '2026-10-14T08:00:00.000Z',
      p_period_end: '2026-11-14T08:00:00.000Z',
      p_codes: 100,
      p_reason: 'Tester, runda 1',
      p_actor: 'mircea',
    });
  });

  it('refuses a trial that sends no SMS, pointing at the tester switch', async () => {
    const { client, calls } = clientWith({ ...testerTrial, tester_allowances: false });

    await expect(grantSigningCodes(client, input, now)).rejects.toThrow(/tester switch/);
    expect(calls.some((call) => call.path === '/rest/v1/rpc/grant_signing_codes')).toBe(false);
  });

  it('refuses an organization without a limit, and an email no owner has', async () => {
    await expect(grantSigningCodes(clientWith(null).client, input, now)).rejects.toThrow(
      /no limit/
    );
    await expect(
      grantSigningCodes(clientWith(testerTrial, null).client, input, now)
    ).rejects.toThrow(/No organization has an owner/);
  });

  it.each([0, 1.5, 10_001])('refuses %s codes', async (codes) => {
    await expect(
      grantSigningCodes(clientWith(testerTrial).client, { ...input, codes }, now)
    ).rejects.toThrow(/whole number/);
  });
});
