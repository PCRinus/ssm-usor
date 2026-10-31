import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import { createStripe } from '../billing/stripe';
import {
  createFake,
  env,
  type Fake,
  fetchMock,
  organizationId,
  paidRow,
} from '../billing/upstream.fixture';
import { reportOverage, retryOverageReports } from './overage';

const start = { plan: 'start', interval: 'month', employeePacks: 0, extraMembers: 0 } as const;
const sentAt = new Date(Date.now() - 60 * 60_000);

const meterEvents = (fake: Fake) =>
  fake.calls
    .filter((call) => call.url.pathname === '/v1/billing/meter_events')
    .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? '')));

const deps = () => ({ db: adminClient(env), stripe: createStripe('sk_test_fake_key') });

const overageRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organization_id: organizationId,
  kind: 'signing_code',
  counted: true,
  overage: true,
  sent_at: sentAt.toISOString(),
  reported_at: null,
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reporting a code past the allowance', () => {
  it('sends one sms_overage meter event named by the row, for the customer, and marks the row', async () => {
    const fake = createFake();
    fake.tables.sms_sends = [overageRow('a1b2c3d4-0000-4000-8000-000000000001')];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    const reported = await reportOverage(deps(), {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      sentAt,
      customerId: 'cus_1Test',
    });

    expect(reported).toBe(true);
    expect(meterEvents(fake)).toEqual([
      {
        event_name: 'sms_overage',
        identifier: 'a1b2c3d4-0000-4000-8000-000000000001',
        timestamp: String(Math.floor(sentAt.getTime() / 1000)),
        'payload[stripe_customer_id]': 'cus_1Test',
        'payload[value]': '1',
      },
    ]);
    expect(fake.tables.sms_sends![0]!.reported_at).toEqual(expect.any(String));
  });

  it('reports nothing for a row already reported', async () => {
    const fake = createFake();
    fake.tables.sms_sends = [overageRow('r1', { reported_at: new Date().toISOString() })];

    expect(await reportOverage(deps(), { id: 'r1', sentAt, customerId: 'cus_1Test' })).toBe(false);
    expect(meterEvents(fake)).toEqual([]);
  });

  it('unmarks the row when Stripe refuses, for the daily retry', async () => {
    const fake = createFake();
    fake.tables.sms_sends = [overageRow('r2')];
    fake.stripe['POST /v1/billing/meter_events'] = () =>
      new Response(JSON.stringify({ error: { type: 'api_error', message: 'down' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });

    await expect(
      reportOverage(deps(), { id: 'r2', sentAt, customerId: 'cus_1Test' })
    ).rejects.toThrow();
    expect(fake.tables.sms_sends![0]!.reported_at).toBeNull();
  });
});

describe('the daily retry', () => {
  it('reports every unreported billed code, for its organization’s customer', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.sms_sends = [overageRow('r3'), overageRow('r4')];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    expect(await retryOverageReports(deps())).toEqual({ reported: 2, failed: 0 });
    expect(meterEvents(fake).map((event) => event.identifier)).toEqual(['r3', 'r4']);
    const query = fake.calls.find(
      (call) => call.method === 'GET' && call.url.pathname === '/rest/v1/sms_sends'
    )!;
    expect(query.url.searchParams.get('overage')).toBe('eq.true');
    expect(query.url.searchParams.get('reported_at')).toBe('is.null');
    expect(query.url.searchParams.getAll('sent_at')).toEqual([
      'not.is.null',
      expect.stringMatching(/^gt\./),
      expect.stringMatching(/^lt\./),
    ]);
  });

  it('counts a row whose organization has no Stripe customer as failed', async () => {
    const fake = createFake();
    fake.tables.sms_sends = [overageRow('r5')];

    expect(await retryOverageReports(deps())).toEqual({ reported: 0, failed: 1 });
    expect(meterEvents(fake)).toEqual([]);
  });
});
