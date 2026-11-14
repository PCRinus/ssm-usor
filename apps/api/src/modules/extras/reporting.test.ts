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
import { reportBlock, reportBlocks } from './reporting';

const start = { plan: 'start', step: 250, interval: 'month' } as const;
const boughtAt = new Date(Date.now() - 60 * 60_000);

const meterEvents = (fake: Fake) =>
  fake.calls
    .filter((call) => call.url.pathname === '/v1/billing/meter_events')
    .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? '')));

const deps = () => ({ db: adminClient(env), stripe: createStripe('sk_test_fake_key') });

const block = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organization_id: organizationId,
  number: 1,
  created_at: boughtAt.toISOString(),
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

describe('reporting a block of extra credits', () => {
  it('sends one meter event named by the block, for the customer, and marks the block', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [block('b1')];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    expect(await reportBlock(deps(), { id: 'b1', boughtAt, customerId: 'cus_1Test' })).toBe(true);
    expect(meterEvents(fake)).toEqual([
      {
        event_name: 'credits_extra_blocks',
        identifier: 'b1',
        timestamp: String(Math.floor(boughtAt.getTime() / 1000)),
        'payload[stripe_customer_id]': 'cus_1Test',
        'payload[value]': '1',
      },
    ]);
    expect(fake.tables.credit_extra_blocks![0]!.reported_at).toEqual(expect.any(String));
  });

  it('reports a block once', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [block('b2', { reported_at: new Date().toISOString() })];

    expect(await reportBlock(deps(), { id: 'b2', boughtAt, customerId: 'cus_1Test' })).toBe(false);
    expect(meterEvents(fake)).toEqual([]);
  });

  it('unmarks the block when Stripe refuses, for the daily retry', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [block('b3')];
    fake.stripe['POST /v1/billing/meter_events'] = () =>
      new Response(JSON.stringify({ error: { type: 'api_error', message: 'down' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });

    await expect(
      reportBlock(deps(), { id: 'b3', boughtAt, customerId: 'cus_1Test' })
    ).rejects.toThrow();
    expect(fake.tables.credit_extra_blocks![0]!.reported_at).toBeNull();
  });

  it("reports an organization's unreported blocks, inside Stripe's window", async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.credit_extra_blocks = [block('b4'), block('b5', { number: 2 })];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    expect(await reportBlocks(deps(), { organizationId })).toEqual({ reported: 2, failed: 0 });
    expect(meterEvents(fake).map((event) => event.identifier)).toEqual(['b4', 'b5']);
    const query = fake.calls.find(
      (call) => call.method === 'GET' && call.url.pathname === '/rest/v1/credit_extra_blocks'
    )!;
    expect(query.url.searchParams.get('reported_at')).toBe('is.null');
    expect(query.url.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(query.url.searchParams.getAll('created_at')).toEqual([expect.stringMatching(/^gt\./)]);
  });

  it('counts a block whose organization has no Stripe customer as failed', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [block('b6')];

    expect(await reportBlocks(deps())).toEqual({ reported: 0, failed: 1 });
    expect(meterEvents(fake)).toEqual([]);
  });
});
