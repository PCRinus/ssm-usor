import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import { stubFetch } from '../../test/upstream';
import { meterReporter } from './meter-reports';
import { createStripe } from './stripe';
import {
  createFake,
  env,
  type Fake,
  organizationId,
  paidRow,
  stripeDown,
} from './upstream.fixture';

const start = { plan: 'start', step: 250, interval: 'month' } as const;
const at = new Date(Date.now() - 60 * 60_000);

const meter = meterReporter({
  table: 'credit_extra_blocks',
  at: 'created_at',
  eventName: 'test_meter',
  context: 'test meter',
  labels: { row: 'Row', item: 'Item', retried: 'Retried', retryFailed: 'Retry failed' },
});

const meterEvents = (fake: Fake) =>
  fake.calls
    .filter((call) => call.url.pathname === '/v1/billing/meter_events')
    .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? '')));

const deps = () => ({ db: adminClient(env), stripe: createStripe('sk_test_fake_key') });

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organization_id: organizationId,
  number: 1,
  created_at: at.toISOString(),
  reported_at: null,
  ...overrides,
});

const listQuery = (fake: Fake) =>
  fake.calls.find(
    (call) => call.method === 'GET' && call.url.pathname === '/rest/v1/credit_extra_blocks'
  )!;

stubFetch();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reporting a row to a Stripe meter', () => {
  it('sends one event named by the row, for the customer, and marks the row', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [row('m1')];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    expect(await meter.report(deps(), { id: 'm1', at, customerId: 'cus_1Test' })).toBe(true);
    expect(meterEvents(fake)).toEqual([
      {
        event_name: 'test_meter',
        identifier: 'm1',
        timestamp: String(Math.floor(at.getTime() / 1000)),
        'payload[stripe_customer_id]': 'cus_1Test',
        'payload[value]': '1',
      },
    ]);
    expect(fake.tables.credit_extra_blocks![0]!.reported_at).toEqual(expect.any(String));
  });

  it('reports a row once', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [row('m2', { reported_at: new Date().toISOString() })];

    expect(await meter.report(deps(), { id: 'm2', at, customerId: 'cus_1Test' })).toBe(false);
    expect(meterEvents(fake)).toEqual([]);
  });

  it('unmarks the row when Stripe refuses, for the daily retry', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [row('m3')];
    fake.stripe['POST /v1/billing/meter_events'] = stripeDown;

    await expect(meter.report(deps(), { id: 'm3', at, customerId: 'cus_1Test' })).rejects.toThrow();
    expect(fake.tables.credit_extra_blocks![0]!.reported_at).toBeNull();
  });
});

describe('a sweep of unreported rows', () => {
  it("reports an organization's rows inside Stripe's window", async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.credit_extra_blocks = [row('m4'), row('m5', { number: 2 })];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    expect(await meter.sweep(deps(), { organizationId })).toEqual({ reported: 2, failed: 0 });
    expect(meterEvents(fake).map((event) => [event.identifier, event.timestamp])).toEqual([
      ['m4', String(Math.floor(at.getTime() / 1000))],
      ['m5', String(Math.floor(at.getTime() / 1000))],
    ]);
    const query = listQuery(fake);
    expect(query.url.searchParams.get('reported_at')).toBe('is.null');
    expect(query.url.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(query.url.searchParams.getAll('created_at')).toEqual([expect.stringMatching(/^gt\./)]);
  });

  it('leaves the retry the rows written in the last minutes', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.credit_extra_blocks = [row('m6')];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });
    const now = new Date();

    expect(await meter.retry(deps(), now)).toEqual({ reported: 1, failed: 0 });
    expect(listQuery(fake).url.searchParams.getAll('created_at')).toEqual([
      `gt.${new Date(now.getTime() - 35 * 86_400_000).toISOString()}`,
      `lt.${new Date(now.getTime() - 10 * 60_000).toISOString()}`,
    ]);
  });

  it('counts a row whose organization has no Stripe customer as failed', async () => {
    const fake = createFake();
    fake.tables.credit_extra_blocks = [row('m7')];

    expect(await meter.sweep(deps())).toEqual({ reported: 0, failed: 1 });
    expect(meterEvents(fake)).toEqual([]);
  });
});
