import { billingExtrasSchema, billingOverviewSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import {
  createFake,
  env,
  type Fake,
  fetchMock,
  organizationId,
  owner,
  paidRow,
  priceIdOf,
  stripeList,
  stripeSubscription,
  stripeWrites,
  subscriptionRow,
} from '../billing/upstream.fixture';

const day = 86_400;
const start = { plan: 'start', step: 250, interval: 'month' } as const;

const request = (method: string, path: string, body?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env
  );

const reasonOf = async (response: Response) =>
  ((await response.json()) as { reason?: string }).reason;

const ceilings = (fake: Fake) =>
  (fake.tables.usage_extras ?? []).map((row) => [row.kind, row.ceiling_cents]);

function stripeForOwner(fake: Fake, lines?: { lookupKey: string; quantity: undefined }[]) {
  fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
    stripeSubscription({
      choice: start,
      ...(lines ? { lines: [{ lookupKey: 'start_250_monthly_v2', quantity: 1 }, ...lines] } : {}),
    });
  fake.stripe['POST /v1/invoices/create_preview'] = () => ({
    object: 'invoice',
    subtotal: 3900,
    total: 4719,
    period_end: Math.floor(Date.now() / 1000) + 20 * day,
    lines: stripeList([]),
  });
  fake.stripe['GET /v1/customers/cus_1Test'] = () => ({
    id: 'cus_1Test',
    object: 'customer',
    invoice_settings: { default_payment_method: null },
  });
  fake.stripe['POST /v1/subscription_items'] = (call) => ({
    id: 'si_credits',
    object: 'subscription_item',
    price: { id: call.form.get('price') },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PUT /billing/extras/{kind}', () => {
  it('turns SMS extras on with a ceiling in whole euro and logs who did it', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    stripeForOwner(fake);

    const response = await request('PUT', '/billing/extras/sms', { ceilingEuros: 10 });

    expect(response.status).toBe(200);
    expect(billingExtrasSchema.parse(await response.json())).toMatchObject({
      unavailable: null,
      sms: { enabled: true, ceilingCents: 1000, limit: 100, used: 0, spentCents: 0 },
      credits: { enabled: false },
    });
    expect(ceilings(fake)).toEqual([['sms', 1000]]);
    expect(fake.tables.subscription_changes).toContainEqual(
      expect.objectContaining({
        source: 'owner',
        change: 'extras_sms',
        details: { actor: owner.id, from: null, to: 1000 },
      })
    );
  });

  it('adds the AI credits item to a subscription made without it before turning them on', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    stripeForOwner(fake, [{ lookupKey: 'sms_overage_monthly_v2', quantity: undefined }]);

    const response = await request('PUT', '/billing/extras/credits', { ceilingEuros: 10 });

    expect(response.status).toBe(200);
    expect(stripeWrites(fake, '/v1/subscription_items')).toEqual([
      {
        subscription: 'sub_1Test',
        price: priceIdOf('credits_extra_monthly_v2'),
        proration_behavior: 'none',
      },
    ]);
    expect(
      fake.calls.find((call) => call.url.pathname === '/v1/subscription_items')!.idempotencyKey
    ).toBe('credits_extra-item-sub_1Test');
    expect(billingExtrasSchema.parse(await response.json()).credits).toMatchObject({
      enabled: true,
      ceilingCents: 1000,
      limit: 600,
    });
  });

  it('adds no second credits item to a subscription that has one', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    stripeForOwner(fake);

    expect((await request('PUT', '/billing/extras/credits', { ceilingEuros: 3 })).status).toBe(200);
    expect(stripeWrites(fake, '/v1/subscription_items')).toEqual([]);
  });

  it('lowers a ceiling or turns it off at once, without asking Stripe', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.usage_extras = [
      { organization_id: organizationId, kind: 'sms', ceiling_cents: 2000 },
    ];

    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros: 5 })).status).toBe(200);
    expect(ceilings(fake)).toEqual([['sms', 500]]);
    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros: null })).status).toBe(200);
    expect(ceilings(fake)).toEqual([]);
    expect(fake.calls.some((call) => call.url.host === 'api.stripe.com')).toBe(false);
  });

  it.each([
    ['during a trial', subscriptionRow(), 'trial'],
    ['while a payment is overdue', paidRow(start, { status: 'past_due' }), 'past_due'],
    ['after the subscription ended', paidRow(start, { status: 'canceled' }), 'canceled'],
    ['on Enterprise', paidRow(start, { plan: 'enterprise' }), 'enterprise'],
  ])('refuses to turn extras on %s, and lets them be turned off', async (_, subscription) => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscription);

    const refused = await request('PUT', '/billing/extras/sms', { ceilingEuros: 10 });
    expect(refused.status).toBe(409);
    expect(await reasonOf(refused)).toBe('extras_unavailable');
    expect(ceilings(fake)).toEqual([]);

    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros: null })).status).toBe(200);
  });

  it('adds the SMS item to a subscription that has none, as a v1 one may', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({
        choice: start,
        lines: [{ lookupKey: 'start_250_monthly_v2', quantity: 1 }],
      });
    fake.stripe['POST /v1/subscription_items'] = () => ({
      id: 'si_sms',
      object: 'subscription_item',
    });

    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros: 10 })).status).toBe(200);
    expect(stripeWrites(fake, '/v1/subscription_items')).toEqual([
      {
        subscription: 'sub_1Test',
        price: priceIdOf('sms_overage_monthly_v2'),
        proration_behavior: 'none',
      },
    ]);
  });

  it('keeps a change set for the renewal, with the new item in both phases', async () => {
    const fake = createFake();
    const renewal = Math.floor(Date.now() / 1000) + 12 * day;
    const lines = [{ lookupKey: 'start_500_monthly_v2', quantity: 1 }];
    let added = false;
    fake.tables.subscriptions!.push(paidRow({ ...start, step: 500 }));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({
        choice: { ...start, step: 500 },
        periodEnd: renewal,
        lines: added
          ? [...lines, { lookupKey: 'credits_extra_monthly_v2', quantity: undefined }]
          : lines,
        schedule: added
          ? null
          : {
              id: 'sub_sched_1',
              object: 'subscription_schedule',
              phases: [
                { start_date: renewal - 30 * day, end_date: renewal, items: [] },
                {
                  start_date: renewal,
                  end_date: renewal + 30 * day,
                  items: [{ price: priceIdOf('start_250_monthly_v2'), quantity: 1 }],
                },
              ],
            },
      });
    fake.stripe['POST /v1/subscription_schedules/sub_sched_1/release'] = () => ({
      id: 'sub_sched_1',
      object: 'subscription_schedule',
    });
    fake.stripe['POST /v1/subscription_items'] = () => {
      added = true;
      return { id: 'si_credits', object: 'subscription_item' };
    };
    fake.stripe['POST /v1/subscription_schedules'] = () => ({
      id: 'sub_sched_2',
      object: 'subscription_schedule',
      phases: [{ start_date: renewal - 30 * day, end_date: renewal, items: [] }],
    });
    fake.stripe['POST /v1/subscription_schedules/sub_sched_2'] = () => ({
      id: 'sub_sched_2',
      object: 'subscription_schedule',
      phases: [],
    });

    expect((await request('PUT', '/billing/extras/credits', { ceilingEuros: 10 })).status).toBe(
      200
    );
    const order = fake.calls
      .filter((call) => call.url.host === 'api.stripe.com' && call.method === 'POST')
      .map((call) => call.url.pathname);
    expect(order).toEqual([
      '/v1/subscription_schedules/sub_sched_1/release',
      '/v1/subscription_items',
      '/v1/subscription_schedules',
      '/v1/subscription_schedules/sub_sched_2',
    ]);
    const phases = stripeWrites(fake, '/v1/subscription_schedules/sub_sched_2')[0]!;
    expect(phases).toMatchObject({
      'phases[0][items][1][price]': priceIdOf('credits_extra_monthly_v2'),
      'phases[1][items][0][price]': priceIdOf('start_250_monthly_v2'),
      'phases[1][items][2][price]': priceIdOf('credits_extra_monthly_v2'),
    });
  });

  it('waits for a change whose payment is pending, and says so', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => ({
      ...stripeSubscription({
        choice: start,
        lines: [{ lookupKey: 'start_250_monthly_v2', quantity: 1 }],
      }),
      pending_update: { expires_at: Math.floor(Date.now() / 1000) + day },
    });

    const response = await request('PUT', '/billing/extras/credits', { ceilingEuros: 10 });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('extras_pending_payment');
    expect(ceilings(fake)).toEqual([]);
  });

  it('lets an owner whose payment is overdue lower a ceiling, never raise it', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start, { status: 'past_due' }));
    fake.tables.usage_extras = [
      { organization_id: organizationId, kind: 'sms', ceiling_cents: 50000 },
    ];

    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros: 20 })).status).toBe(200);
    expect(ceilings(fake)).toEqual([['sms', 2000]]);
    const raised = await request('PUT', '/billing/extras/sms', { ceilingEuros: 30 });
    expect(raised.status).toBe(409);
    expect(ceilings(fake)).toEqual([['sms', 2000]]);
  });

  it.each([0, 501, 9.5])('refuses a ceiling of %s €', async (ceilingEuros) => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));

    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros })).status).toBe(400);
    expect(ceilings(fake)).toEqual([]);
  });

  it('is the owner’s alone', async () => {
    const fake = createFake({
      membership: { user_id: owner.id, role: 'specialist', access: 'full' },
    });
    fake.tables.subscriptions!.push(paidRow(start));

    expect((await request('PUT', '/billing/extras/sms', { ceilingEuros: 10 })).status).toBe(403);
    expect(ceilings(fake)).toEqual([]);
  });
});

describe('the extras on GET /billing', () => {
  it('shows the owner what each extra has cost this month against its ceiling', async () => {
    const fake = createFake({
      smsUsage: { used: 87, overage: 37, granted: 0 },
      credits: { granted: 0, used: 820, shortfall: 0, gift_left: 0, extra: 100 },
    });
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.usage_extras = [
      { organization_id: organizationId, kind: 'sms', ceiling_cents: 1000 },
      { organization_id: organizationId, kind: 'credits', ceiling_cents: 1500 },
    ];
    stripeForOwner(fake);

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.extras).toEqual({
      unavailable: null,
      sms: { enabled: true, ceilingCents: 1000, limit: 100, used: 37, spentCents: 370 },
      credits: { enabled: true, ceilingCents: 1500, limit: 1000, used: 100, spentCents: 150 },
    });
    expect(body.usage.smsThisMonth.state).toBe('extra');
    expect(body.usage.smsThisMonth.extrasOn).toBe(true);
    expect(body.usage.creditsThisMonth).toMatchObject({
      extra: 100,
      extraLeft: 900,
      extrasOn: true,
    });
  });

  it('shows the other members whether each extra is on, and no amount', async () => {
    const fake = createFake({
      membership: { user_id: owner.id, role: 'specialist', access: 'full' },
      smsUsage: { used: 137, overage: 37, granted: 0 },
      credits: { granted: 0, used: 900, shortfall: 0, gift_left: 0, extra: 200, extra_left: 50 },
    });
    fake.tables.subscriptions!.push(paidRow(start));
    fake.tables.usage_extras = [
      { organization_id: organizationId, kind: 'sms', ceiling_cents: 1000 },
    ];

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.extras).toEqual({
      unavailable: null,
      sms: { enabled: true, ceilingCents: null, limit: null, used: null, spentCents: null },
      credits: { enabled: false, ceilingCents: null, limit: null, used: null, spentCents: null },
    });
    expect(body.usage.smsThisMonth).toMatchObject({ used: 50, overage: 0, extrasOn: true });
    expect(body.usage.creditsThisMonth).toMatchObject({ extra: 0, extraLeft: 0 });
  });

  it('says why extras cannot be turned on during a trial', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.extras.unavailable).toBe('trial');
  });
});
