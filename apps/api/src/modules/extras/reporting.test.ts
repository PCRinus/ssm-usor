import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import { stubFetch } from '../../test/upstream';
import { createStripe } from '../billing/stripe';
import { createFake, env, type Fake, organizationId, paidRow } from '../billing/upstream.fixture';
import { reportBlocks } from './reporting';

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

stubFetch();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reporting blocks of extra credits', () => {
  it("reports an organization's unreported blocks to the credits meter", async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.credit_extra_blocks = [block('b4'), block('b5', { number: 2 })];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    expect(await reportBlocks(deps(), { organizationId })).toEqual({ reported: 2, failed: 0 });
    expect(meterEvents(fake)).toEqual(
      ['b4', 'b5'].map((identifier) => ({
        event_name: 'credits_extra_blocks',
        identifier,
        timestamp: String(Math.floor(boughtAt.getTime() / 1000)),
        'payload[stripe_customer_id]': 'cus_1Test',
        'payload[value]': '1',
      }))
    );
    const query = fake.calls.find(
      (call) => call.method === 'GET' && call.url.pathname === '/rest/v1/credit_extra_blocks'
    )!;
    expect(query.url.searchParams.get('reported_at')).toBe('is.null');
    expect(query.url.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(query.url.searchParams.getAll('created_at')).toEqual([expect.stringMatching(/^gt\./)]);
  });
});
