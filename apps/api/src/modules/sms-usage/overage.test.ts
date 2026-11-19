import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubFetch } from '../../test/upstream';
import { createFake, env, type Fake, organizationId, paidRow } from '../billing/upstream.fixture';
import { scheduledOverageReports } from './overage';

const start = { plan: 'start', step: 250, interval: 'month' } as const;
const sentAt = new Date(Date.now() - 60 * 60_000);

const meterEvents = (fake: Fake) =>
  fake.calls
    .filter((call) => call.url.pathname === '/v1/billing/meter_events')
    .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? '')));

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

stubFetch();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the daily retry of codes past the allowance', () => {
  it('reports every unreported billed code to the SMS overage meter', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.sms_sends = [overageRow('r3'), overageRow('r4')];
    fake.stripe['POST /v1/billing/meter_events'] = () => ({ object: 'billing.meter_event' });

    await scheduledOverageReports(env);

    expect(meterEvents(fake)).toEqual(
      ['r3', 'r4'].map((identifier) => ({
        event_name: 'sms_overage',
        identifier,
        timestamp: String(Math.floor(sentAt.getTime() / 1000)),
        'payload[stripe_customer_id]': 'cus_1Test',
        'payload[value]': '1',
      }))
    );
    const query = fake.calls.find(
      (call) => call.method === 'GET' && call.url.pathname === '/rest/v1/sms_sends'
    )!;
    expect(query.url.searchParams.get('overage')).toBe('eq.true');
    expect(query.url.searchParams.get('reported_at')).toBe('is.null');
    expect(query.url.searchParams.getAll('sent_at')).toEqual([
      expect.stringMatching(/^gt\./),
      expect.stringMatching(/^lt\./),
    ]);
  });
});
