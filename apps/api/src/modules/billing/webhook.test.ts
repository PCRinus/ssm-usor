import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import {
  accountId,
  createFake,
  env,
  type Fake,
  fetchMock,
  oblioWrites,
  organizationId,
  owner,
  paidRow,
  priceIdOf,
  signedEvent,
  stripeList,
  stripeSubscription,
  stripeWrites,
  subscriptionRow,
} from './upstream.fixture';

const day = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const pro = { plan: 'profesional', interval: 'month', employeePacks: 0, extraMembers: 0 } as const;
const start = { plan: 'start', interval: 'month', employeePacks: 1, extraMembers: 0 } as const;

async function deliver(event: Record<string, unknown>, bindings = env, signature?: string) {
  const signed = await signedEvent(event);
  return createApp().request(
    '/billing/stripe-webhook',
    {
      method: 'POST',
      headers: { 'stripe-signature': signature ?? signed.signature },
      body: signed.payload,
    },
    bindings
  );
}

const subscriptionEvent = (type: string, id = 'evt_1') => ({
  id,
  type,
  data: { object: { id: 'sub_1Test', object: 'subscription' } },
});

const row = (fake: Fake) => fake.tables.subscriptions![0]!;
const changes = (fake: Fake) => fake.tables.subscription_changes!;

function paidInvoice(overrides: Record<string, unknown> = {}) {
  const paidAt = now();
  return {
    id: 'in_1Paid',
    object: 'invoice',
    customer: 'cus_1Test',
    customer_email: 'stripe@example.ro',
    currency: 'eur',
    subtotal: 14900,
    total: 18029,
    created: paidAt,
    status: 'paid',
    billing_reason: 'subscription_cycle',
    status_transitions: { paid_at: paidAt },
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1Test' } },
    payments: stripeList([
      { status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_1Paid' } },
    ]),
    lines: stripeList([
      {
        id: 'il_1',
        object: 'line_item',
        amount: 14900,
        quantity: 1,
        description: '1 × SSM Ușor Profesional (at €149.00 / month)',
        period: { start: paidAt, end: paidAt + 30 * day },
        pricing: {
          type: 'price_details',
          price_details: {
            price: priceIdOf('profesional_monthly_v1'),
            product: 'ssm_usor_profesional',
          },
        },
        parent: {
          type: 'subscription_item_details',
          subscription_item_details: { proration: false, subscription_item: 'si_0' },
        },
      },
    ]),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /billing/stripe-webhook', () => {
  it('refuses a request whose signature does not match, before touching anything', async () => {
    const fake = createFake();

    const response = await deliver(
      subscriptionEvent('customer.subscription.updated'),
      env,
      't=1,v1=bad'
    );

    expect(response.status).toBe(400);
    expect(fake.calls).toEqual([]);
  });

  it('refuses a live event on a test key', async () => {
    const fake = createFake();

    const response = await deliver({
      ...subscriptionEvent('customer.subscription.updated'),
      livemode: true,
    });

    expect(response.status).toBe(400);
    expect(fake.tables.stripe_events).toEqual([]);
  });

  it('answers 503 while the signing secret is not set', async () => {
    createFake();

    const response = await deliver(subscriptionEvent('customer.subscription.updated'), {
      ...env,
      STRIPE_WEBHOOK_SECRET: undefined,
    });

    expect(response.status).toBe(503);
  });

  it('does nothing for an event it has already handled', async () => {
    const fake = createFake();
    fake.tables.stripe_events!.push({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      processed_at: '2026-10-27T10:00:00Z',
    });

    const response = await deliver(subscriptionEvent('customer.subscription.updated'));

    expect(response.status).toBe(200);
    expect(fake.calls.filter((call) => call.url.host === 'api.stripe.com')).toEqual([]);
  });

  it('records a failure and answers 500, so Stripe delivers it again', async () => {
    const fake = createFake();
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      new Response(JSON.stringify({ error: { type: 'api_error', message: 'down' } }), {
        status: 500,
      });

    const response = await deliver(subscriptionEvent('customer.subscription.updated'));

    expect(response.status).toBe(500);
    expect(fake.tables.stripe_events).toEqual([
      expect.objectContaining({ id: 'evt_1', processed_at: null, error: expect.any(String) }),
    ]);
  });

  describe('a subscription event', () => {
    it('records a plan chosen during the trial, which keeps the trial until its end', async () => {
      const fake = createFake();
      const trialEnd = now() + 12 * day;
      fake.tables.subscriptions!.push(subscriptionRow());
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({ status: 'trialing', choice: start, trialEnd, periodEnd: trialEnd });

      const response = await deliver(subscriptionEvent('customer.subscription.created'));

      expect(response.status).toBe(200);
      expect(row(fake)).toMatchObject({
        plan: 'start',
        status: 'trialing',
        stripe_account: accountId,
        stripe_customer_id: 'cus_1Test',
        stripe_subscription_id: 'sub_1Test',
        billing_interval: 'month',
        price_version: 'v1',
        employee_packs: 1,
        extra_members: 0,
        trial_ends_at: new Date(trialEnd * 1000).toISOString(),
        access_until: new Date((trialEnd + 14 * day) * 1000).toISOString(),
      });
      expect(changes(fake)).toEqual([
        expect.objectContaining({ source: 'stripe', change: 'customer.subscription.created' }),
      ]);
      expect(fake.tables.stripe_events).toEqual([
        expect.objectContaining({ id: 'evt_1', processed_at: expect.any(String), error: null }),
      ]);
    });

    it('ignores a subscription of an organization this database does not have', async () => {
      const fake = createFake();
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({
          choice: start,
          metadata: { organization_id: '99999999-0000-4000-8000-000000000009' },
        });

      const response = await deliver(subscriptionEvent('customer.subscription.created'));

      expect(response.status).toBe(200);
      expect(fake.tables.subscriptions).toEqual([]);
      expect(fake.tables.stripe_events).toEqual([
        expect.objectContaining({ id: 'evt_1', processed_at: expect.any(String) }),
      ]);
    });

    it('logs nothing when the state is what the row already holds', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(paidRow(pro, { current_period_end: null }));
      const subscription = stripeSubscription({ choice: pro });
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => subscription;
      row(fake).current_period_end = new Date(
        subscription.items.data[0]!.current_period_end * 1000
      ).toISOString();

      await deliver(subscriptionEvent('customer.subscription.updated'));

      expect(changes(fake)).toEqual([]);
    });

    it('ends full access at the period paid once a cancellation is set', async () => {
      const fake = createFake();
      const cancelAt = now() + 20 * day;
      fake.tables.subscriptions!.push(paidRow(pro));
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({ choice: pro, cancelAt });

      await deliver(subscriptionEvent('customer.subscription.updated'));

      expect(row(fake)).toMatchObject({
        status: 'active',
        access_until: new Date(cancelAt * 1000).toISOString(),
      });
    });

    it('marks an ended subscription canceled, read-only from its end', async () => {
      const fake = createFake();
      const endedAt = now() - day;
      fake.tables.subscriptions!.push(paidRow(pro));
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({ status: 'canceled', choice: pro, endedAt });

      await deliver(subscriptionEvent('customer.subscription.deleted'));

      expect(row(fake)).toMatchObject({
        status: 'canceled',
        access_until: new Date(endedAt * 1000).toISOString(),
      });
    });

    it("leaves the organization alone for another subscription's late event", async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(paidRow(pro, { stripe_subscription_id: 'sub_2Newer' }));
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({ status: 'canceled', choice: start, endedAt: now() });

      await deliver(subscriptionEvent('customer.subscription.deleted'));

      expect(row(fake)).toMatchObject({ status: 'active', stripe_subscription_id: 'sub_2Newer' });
    });

    it('adopts a paid subscription for an organization that was read-only', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(
        paidRow(pro, {
          status: 'canceled',
          access_until: new Date(Date.now() - 1e9).toISOString(),
          stripe_subscription_id: 'sub_0Old',
        })
      );
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: start });

      await deliver(subscriptionEvent('customer.subscription.updated'));

      expect(row(fake)).toMatchObject({
        status: 'active',
        plan: 'start',
        access_until: null,
        stripe_subscription_id: 'sub_1Test',
      });
    });
  });

  describe('invoice.payment_failed', () => {
    const failed = (id: string) => ({
      id,
      type: 'invoice.payment_failed',
      data: { object: { ...paidInvoice({ status: 'open' }), id: 'in_1Open' } },
    });

    it('keeps full access 14 days from the first failure, not from each retry', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(paidRow(pro));
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({ status: 'past_due', choice: pro });
      const first = await deliver(failed('evt_fail1'));
      expect(first.status).toBe(200);
      const until = row(fake).access_until as string;
      expect(Date.parse(until) - Date.now()).toBeGreaterThan(13.9 * day * 1000);

      await deliver(failed('evt_fail2'));

      expect(row(fake)).toMatchObject({ status: 'past_due', access_until: until });
    });

    it('leaves a first charge that failed in the browser alone', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(subscriptionRow());
      const event = failed('evt_fail3');
      (event.data.object as Record<string, unknown>).billing_reason = 'subscription_create';

      await deliver(event);

      expect(row(fake)).toMatchObject({ status: 'trialing' });
      expect(fake.calls.some((call) => call.url.pathname.startsWith('/v1/subscriptions'))).toBe(
        false
      );
    });
  });

  describe('invoice.paid', () => {
    const paidEvent = {
      id: 'evt_paid',
      type: 'invoice.paid',
      data: { object: { id: 'in_1Paid', object: 'invoice' } },
    };

    function paying(fake: Fake, invoice = paidInvoice()) {
      fake.tables.subscriptions!.push(paidRow(pro));
      fake.stripe['GET /v1/invoices/in_1Paid'] = () => invoice;
    }

    it('issues the Oblio invoice to the owner and keeps a copy of its PDF', async () => {
      const fake = createFake();
      paying(fake);

      const response = await deliver(paidEvent);

      expect(response.status).toBe(200);
      const [issued] = oblioWrites(fake, '/api/docs/invoice');
      expect(issued).toMatchObject({
        cif: 'RO99999999',
        seriesName: 'SSMUSOR',
        idempotencyKey: 'in_1Paid',
        sendEmail: 1,
        client: { name: 'Prevenție Activă SRL', cif: '12345678', email: owner.email, vatPayer: 1 },
        products: [{ name: 'SSM Ușor Profesional', price: 149, quantity: 1, vatPercentage: 21 }],
        collect: { type: 'Card', documentNumber: 'pi_1Paid', value: 180.29 },
      });
      expect(fake.tables.billing_invoices).toEqual([
        expect.objectContaining({
          stripe_invoice_id: 'in_1Paid',
          organization_id: organizationId,
          stripe_account: accountId,
          kind: 'invoice',
          amount_cents: 18029,
          oblio_series: 'SSMUSOR',
          oblio_number: '0001',
          pdf_path: `${organizationId}/SSMUSOR-0001.pdf`,
        }),
      ]);
      expect(fake.uploads.map((upload) => upload.path)).toEqual([
        `${organizationId}/SSMUSOR-0001.pdf`,
      ]);
    });

    it('issues the first invoice paid before the checkout saved the customer', async () => {
      const fake = createFake();
      fake.stripe['GET /v1/invoices/in_1Paid'] = () =>
        paidInvoice({
          billing_reason: 'subscription_create',
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_1Test',
              metadata: { organization_id: organizationId },
            },
          },
        });

      const response = await deliver(paidEvent);

      expect(response.status).toBe(200);
      expect(oblioWrites(fake, '/api/docs/invoice')).toHaveLength(1);
      expect(fake.tables.billing_invoices![0]).toMatchObject({
        organization_id: organizationId,
        stripe_account: accountId,
      });
    });

    it('ignores a paid invoice of an organization this database does not have', async () => {
      const fake = createFake();
      fake.stripe['GET /v1/invoices/in_1Paid'] = () =>
        paidInvoice({
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_1Test',
              metadata: { organization_id: '99999999-0000-4000-8000-000000000009' },
            },
          },
        });

      const response = await deliver(paidEvent);

      expect(response.status).toBe(200);
      expect(fake.tables.billing_invoices).toEqual([]);
      expect(fake.calls.some((call) => call.url.host === 'www.oblio.eu')).toBe(false);
    });

    it("sends it to the organization's email for invoices when one is set", async () => {
      const fake = createFake();
      paying(fake);
      row(fake).invoice_email = 'contabil@example.ro';

      await deliver(paidEvent);

      expect(oblioWrites(fake, '/api/docs/invoice')[0]).toMatchObject({
        client: { email: 'contabil@example.ro' },
      });
    });

    it('issues a TEST proforma to the fixed test client outside production', async () => {
      const fake = createFake();
      paying(fake);

      await deliver(paidEvent, { ...env, OBLIO_DOCUMENTS: 'proforma' });

      expect(oblioWrites(fake, '/api/docs/invoice')).toEqual([]);
      expect(oblioWrites(fake, '/api/docs/proforma')[0]).toMatchObject({
        seriesName: 'TEST',
        sendEmail: 0,
        client: { name: 'Client test SSM Ușor (non-prod)' },
      });
      expect(fake.tables.billing_invoices).toEqual([
        expect.objectContaining({
          kind: 'proforma',
          oblio_series: 'TEST',
          pdf_path: `${organizationId}/TEST-0007.pdf`,
        }),
      ]);
    });

    it('records nothing for an invoice of zero', async () => {
      const fake = createFake();
      paying(fake, paidInvoice({ total: 0, subtotal: 0 }));

      const response = await deliver(paidEvent);

      expect(response.status).toBe(200);
      expect(fake.tables.billing_invoices).toEqual([]);
      expect(fake.calls.some((call) => call.url.host === 'www.oblio.eu')).toBe(false);
    });

    it('finishes a retried event without issuing the invoice twice', async () => {
      const fake = createFake();
      paying(fake);
      fake.tables.billing_invoices!.push({
        stripe_invoice_id: 'in_1Paid',
        organization_id: organizationId,
        stripe_account: accountId,
        kind: 'invoice',
        amount_cents: 18029,
        currency: 'eur',
        issued_at: '2026-10-27T10:00:00Z',
        oblio_series: 'SSMUSOR',
        oblio_number: '0001',
        oblio_link: 'https://www.oblio.eu/utils/show_file/?ic=1&id=1',
        storno_of: null,
        pdf_path: null,
      });

      await deliver(paidEvent);

      expect(oblioWrites(fake, '/api/docs/invoice')).toEqual([]);
      expect(fake.tables.billing_invoices![0]).toMatchObject({
        pdf_path: `${organizationId}/SSMUSOR-0001.pdf`,
      });
    });

    it('names a prorated credit as such, as a negative quantity', async () => {
      const fake = createFake();
      const at = now();
      const invoice = paidInvoice();
      invoice.lines.data.push({
        id: 'il_2',
        object: 'line_item',
        amount: -1950,
        quantity: 1,
        description: 'Unused time on SSM Ușor Start',
        period: { start: at, end: at + 15 * day },
        pricing: {
          type: 'price_details',
          price_details: { price: priceIdOf('start_monthly_v1'), product: 'ssm_usor_start' },
        },
        parent: {
          type: 'subscription_item_details',
          subscription_item_details: { proration: true, subscription_item: 'si_0' },
        },
      });
      paying(fake, invoice);

      await deliver(paidEvent);

      expect(oblioWrites(fake, '/api/docs/invoice')[0]!.products).toContainEqual(
        expect.objectContaining({
          name: 'SSM Ușor Start: credit pentru perioada nefolosită',
          price: 19.5,
          quantity: -1,
        })
      );
    });
  });

  describe('charge.refunded', () => {
    const refundEvent = {
      id: 'evt_refund',
      type: 'charge.refunded',
      data: {
        object: { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_1Paid' },
      },
    };

    function refunding(fake: Fake, kind: 'invoice' | 'proforma') {
      fake.tables.billing_invoices!.push({
        stripe_invoice_id: 'in_1Paid',
        organization_id: organizationId,
        stripe_account: accountId,
        kind,
        amount_cents: 18029,
        currency: 'eur',
        issued_at: '2026-10-27T10:00:00Z',
        oblio_series: kind === 'invoice' ? 'SSMUSOR' : 'TEST',
        oblio_number: '0001',
        oblio_link: 'https://www.oblio.eu/utils/show_file/?ic=1&id=1',
        storno_of: null,
        pdf_path: `${organizationId}/SSMUSOR-0001.pdf`,
      });
      fake.stripe['GET /v1/invoice_payments'] = () => stripeList([{ invoice: 'in_1Paid' }]);
      fake.stripe['GET /v1/refunds'] = () =>
        stripeList([{ id: 're_1Refund', object: 'refund', created: now() }]);
    }

    it('issues a storno of the original invoice, stored as a negative row', async () => {
      const fake = createFake();
      refunding(fake, 'invoice');
      fake.oblio['POST /api/docs/invoice'] = () => ({
        status: 200,
        data: {
          seriesName: 'SSMUSOR',
          number: '0002',
          link: 'https://www.oblio.eu/utils/show_file/?ic=1&id=2',
        },
      });

      const response = await deliver(refundEvent);

      expect(response.status).toBe(200);
      expect(oblioWrites(fake, '/api/docs/invoice')[0]).toMatchObject({
        referenceDocument: { type: 'Factura', seriesName: 'SSMUSOR', number: '0001', refund: 1 },
        idempotencyKey: 're_1Refund',
      });
      expect(fake.tables.billing_invoices![1]).toMatchObject({
        stripe_invoice_id: 're_1Refund',
        storno_of: 'in_1Paid',
        amount_cents: -18029,
        oblio_number: '0002',
        pdf_path: `${organizationId}/SSMUSOR-0002.pdf`,
      });
    });

    it('cancels the proforma outside production', async () => {
      const fake = createFake();
      refunding(fake, 'proforma');

      await deliver(refundEvent);

      expect(
        fake.calls.filter((call) => call.url.pathname === '/api/docs/proforma/cancel')
      ).toHaveLength(1);
      expect(fake.tables.billing_invoices).toHaveLength(1);
    });

    it('fails, to be delivered again, when the invoice is not issued yet', async () => {
      const fake = createFake();
      refunding(fake, 'invoice');
      Object.assign(fake.tables.billing_invoices![0]!, {
        issued_at: null,
        oblio_series: null,
        oblio_number: null,
      });

      const response = await deliver(refundEvent);

      expect(response.status).toBe(500);
      expect(fake.calls.some((call) => call.url.host === 'www.oblio.eu')).toBe(false);
      expect(fake.tables.stripe_events![0]).toMatchObject({ processed_at: null });
    });

    it('fails too when the paid invoice is not recorded yet', async () => {
      const fake = createFake();
      refunding(fake, 'invoice');
      fake.tables.subscriptions!.push(paidRow(pro));
      fake.tables.billing_invoices = [];
      fake.stripe['GET /v1/invoices/in_1Paid'] = () => paidInvoice();

      const response = await deliver(refundEvent);

      expect(response.status).toBe(500);
      expect(fake.calls.some((call) => call.url.host === 'www.oblio.eu')).toBe(false);
    });

    it('ignores a refund of an organization this database does not have', async () => {
      const fake = createFake();
      refunding(fake, 'invoice');
      fake.tables.billing_invoices = [];
      fake.stripe['GET /v1/invoices/in_1Paid'] = () => paidInvoice();

      const response = await deliver(refundEvent);

      expect(response.status).toBe(200);
      expect(fake.calls.some((call) => call.url.host === 'www.oblio.eu')).toBe(false);
    });

    it('leaves a partial refund alone', async () => {
      const fake = createFake();
      refunding(fake, 'invoice');

      await deliver({
        ...refundEvent,
        data: { object: { ...refundEvent.data.object, refunded: false } },
      });

      expect(fake.calls.some((call) => call.url.host === 'www.oblio.eu')).toBe(false);
    });
  });

  describe('customer.updated', () => {
    const cardEvent = (previous: Record<string, unknown>) => ({
      id: 'evt_card',
      type: 'customer.updated',
      data: {
        object: {
          id: 'cus_1Test',
          object: 'customer',
          invoice_settings: { default_payment_method: 'pm_new' },
        },
        previous_attributes: previous,
      },
    });

    const currentCustomer = (paymentMethod: string) => ({
      id: 'cus_1Test',
      object: 'customer',
      invoice_settings: { default_payment_method: paymentMethod },
    });

    it('moves the subscription to the new card and pays the invoice a renewal left open', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(
        paidRow(pro, { status: 'past_due', access_until: new Date().toISOString() })
      );
      fake.stripe['GET /v1/customers/cus_1Test'] = () => currentCustomer('pm_new');
      fake.stripe['POST /v1/subscriptions/sub_1Test'] = () =>
        stripeSubscription({ status: 'past_due', choice: pro });
      fake.stripe['GET /v1/invoices'] = () =>
        stripeList([
          {
            id: 'in_1Open',
            object: 'invoice',
            status: 'open',
            billing_reason: 'subscription_cycle',
            attempt_count: 2,
          },
        ]);
      fake.stripe['POST /v1/invoices/in_1Open/pay'] = () => ({
        id: 'in_1Open',
        object: 'invoice',
        status: 'paid',
      });

      const response = await deliver(
        cardEvent({ invoice_settings: { default_payment_method: 'pm_old' } })
      );

      expect(response.status).toBe(200);
      expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')).toEqual([
        { default_payment_method: 'pm_new' },
      ]);
      expect(stripeWrites(fake, '/v1/invoices/in_1Open/pay')).toEqual([
        { payment_method: 'pm_new' },
      ]);
    });

    it('uses the card the customer has now, not the one a late event names', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(paidRow(pro));
      fake.stripe['GET /v1/customers/cus_1Test'] = () => currentCustomer('pm_newest');
      fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });

      await deliver(cardEvent({ invoice_settings: { default_payment_method: 'pm_old' } }));

      expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')).toEqual([
        { default_payment_method: 'pm_newest' },
      ]);
    });

    it('ignores a customer change that is not the card', async () => {
      const fake = createFake();
      fake.tables.subscriptions!.push(
        paidRow(pro, { status: 'past_due', access_until: new Date().toISOString() })
      );

      await deliver(cardEvent({ name: 'Old name' }));

      expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')).toEqual([]);
    });
  });
});
