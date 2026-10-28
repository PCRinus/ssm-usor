import { billingOverviewSchema, billingPreviewSchema } from '@ssm-usor/contracts';
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
} from './upstream.fixture';

const day = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const start = { plan: 'start', interval: 'month', employeePacks: 0, extraMembers: 0 } as const;
const pro = { plan: 'profesional', interval: 'month', employeePacks: 0, extraMembers: 0 } as const;

const request = (method: string, path: string, body?: unknown, bindings = env) =>
  createApp().request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings
  );

const reasonOf = async (response: Response) =>
  ((await response.json()) as { reason?: string }).reason;
const previewOf = async (response: Response) => billingPreviewSchema.parse(await response.json());

const row = (fake: Fake) => fake.tables.subscriptions![0]!;
const stripeCalls = (fake: Fake) => fake.calls.filter((call) => call.url.host === 'api.stripe.com');

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /billing', () => {
  it('shows a specialist the plan, the usage and the list prices, and nothing of the money', async () => {
    const fake = createFake({
      membership: { user_id: owner.id, role: 'specialist', access: 'full' },
    });
    fake.tables.subscriptions!.push(subscriptionRow());

    const response = await request('GET', '/billing');

    expect(response.status).toBe(200);
    const body = billingOverviewSchema.parse(await response.json());
    expect(body.owner).toBeNull();
    expect(body.subscription).toMatchObject({
      plan: 'profesional',
      planChosen: false,
      status: 'trialing',
    });
    expect(body.usage).toEqual({
      employees: { used: 120, limit: 1500 },
      members: { used: 1, limit: 3 },
      smsThisMonth: { used: null, limit: 0 },
    });
    expect(body.catalogue.plans.map((plan) => [plan.key, plan.prices.month])).toEqual([
      ['start', 3900],
      ['profesional', 14900],
    ]);
  });

  it('gives an impersonating admin the members’ view', async () => {
    const fake = createFake({
      membership: {
        user_id: '1e8b36cc-d87a-4318-9af2-acb1f6156112',
        role: 'owner',
        access: 'full',
      },
    });
    fake.tables.subscriptions!.push(subscriptionRow());

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.owner).toBeNull();
  });

  it('shows the owner of a trial the invoices and what each plan needs, without asking Stripe', async () => {
    const fake = createFake({ employees: 312 });
    fake.tables.subscriptions!.push(subscriptionRow());

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.owner).toMatchObject({
      nextPayment: null,
      card: null,
      invoiceEmail: null,
      ownerEmail: owner.email,
      invoices: [],
      choices: {
        start: { minimums: { employeePacks: 2, extraMembers: 0 }, problems: [] },
        profesional: { minimums: { employeePacks: 0, extraMembers: 0 }, problems: [] },
      },
    });
    expect(stripeCalls(fake)).toEqual([]);
  });

  it('shows the owner of a paid plan the card, the next payment and a change set for the renewal', async () => {
    const fake = createFake();
    const renewal = now() + 10 * day;
    fake.tables.subscriptions!.push(paidRow({ ...pro, extraMembers: 1 }));
    fake.tables.billing_invoices!.push({
      stripe_invoice_id: 'in_1Paid',
      organization_id: organizationId,
      kind: 'invoice',
      amount_cents: 18029,
      currency: 'eur',
      issued_at: '2026-10-01T10:00:00Z',
      oblio_series: 'SSMUSOR',
      oblio_number: '0001',
      storno_of: null,
      pdf_path: `${organizationId}/SSMUSOR-0001.pdf`,
    });
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => ({
      ...stripeSubscription({
        choice: { ...pro, extraMembers: 1 },
        periodEnd: renewal,
        schedule: {
          id: 'sub_sched_1',
          object: 'subscription_schedule',
          phases: [
            { start_date: renewal - 30 * day, end_date: renewal, items: [] },
            {
              start_date: renewal,
              end_date: renewal + 30 * day,
              items: [{ price: priceIdOf('profesional_monthly_v1'), quantity: 1 }],
            },
          ],
        },
      }),
      default_payment_method: {
        id: 'pm_1',
        object: 'payment_method',
        card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2029 },
      },
    });
    fake.stripe['POST /v1/invoices/create_preview'] = () => ({
      object: 'invoice',
      subtotal: 16400,
      total: 19844,
      next_payment_attempt: renewal,
      period_end: renewal,
      lines: stripeList([
        {
          amount: 1500,
          pricing: { price_details: { price: priceIdOf('sms_overage_monthly_v1') } },
        },
        {
          amount: 14900,
          pricing: { price_details: { price: priceIdOf('profesional_monthly_v1') } },
        },
      ]),
    });

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.subscription).toMatchObject({
      planChosen: true,
      status: 'active',
      extraMembers: 1,
      cancelsAt: null,
    });
    expect(body.usage.members.limit).toBe(4);
    expect(body.owner).toMatchObject({
      card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029 },
      nextPayment: {
        totalCents: 19844,
        vatCents: 3444,
        at: new Date(renewal * 1000).toISOString(),
      },
      smsOverageCents: 1500,
      scheduledChange: { ...pro, at: new Date(renewal * 1000).toISOString() },
      invoices: [
        { stripeInvoiceId: 'in_1Paid', number: 'SSMUSOR-0001', amountCents: 18029, hasPdf: true },
      ],
    });
  });
});

describe('POST /billing/preview', () => {
  it('prices a plan chosen in the trial: nothing today, the first charge at its end', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());
    const trialEnd = new Date(row(fake).trial_ends_at as string).toISOString();

    const response = await request('POST', '/billing/preview', { ...start, employeePacks: 1 });

    expect(response.status).toBe(200);
    expect(billingPreviewSchema.parse(await response.json())).toMatchObject({
      problems: [],
      recurring: { subtotalCents: 5400, vatCents: 1134, totalCents: 6534 },
      dueToday: { totalCents: 0 },
      nextRenewal: { at: trialEnd, totalCents: 6534 },
      firstChargeAt: trialEnd,
    });
  });

  it('says which of Start’s ceilings the organization passes, and the packs it needs', async () => {
    const fake = createFake({ employees: 700 });
    fake.tables.subscriptions!.push(subscriptionRow());
    fake.tables.organization_members!.push(
      { organization_id: organizationId, user_id: 'a', role: 'specialist' },
      { organization_id: organizationId, user_id: 'b', role: 'specialist' }
    );

    const startPreview = await previewOf(await request('POST', '/billing/preview', start));
    const proPreview = await previewOf(await request('POST', '/billing/preview', pro));

    expect(startPreview.problems).toEqual([
      { reason: 'start_employee_ceiling' },
      { reason: 'start_member_ceiling' },
    ]);
    expect(proPreview.problems).toEqual([]);
    expect(proPreview.minimums).toEqual({ employeePacks: 0, extraMembers: 0 });
  });

  it('charges a read-only organization now', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(
      subscriptionRow({
        trial_ends_at: new Date(Date.now() - 1e9).toISOString(),
        access_until: new Date(Date.now() - 1e9).toISOString(),
      })
    );
    fake.membership.access = 'read_only';

    const body = await previewOf(await request('POST', '/billing/preview', pro));

    expect(body.dueToday.totalCents).toBe(18029);
    expect(Date.parse(body.firstChargeAt)).toBeLessThanOrEqual(Date.now());
  });

  it('prorates a monthly upgrade onto the next renewal', async () => {
    const fake = createFake();
    const renewal = now() + 15 * day;
    fake.tables.subscriptions!.push(paidRow(start));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: start, periodEnd: renewal });
    fake.stripe['POST /v1/invoices/create_preview'] = () => ({
      object: 'invoice',
      subtotal: 21900,
      total: 26499,
      lines: stripeList([
        { amount: -1950, parent: { subscription_item_details: { proration: true } } },
        { amount: 7450, parent: { subscription_item_details: { proration: true } } },
        { amount: 14900, parent: { subscription_item_details: { proration: false } } },
      ]),
    });

    const body = billingPreviewSchema.parse(
      await (await request('POST', '/billing/preview', pro)).json()
    );

    expect(stripeWrites(fake, '/v1/invoices/create_preview')[0]).toMatchObject({
      'subscription_details[proration_behavior]': 'create_prorations',
      'subscription_details[items][0][id]': 'si_0',
      'subscription_details[items][0][price]': priceIdOf('profesional_monthly_v1'),
    });
    expect(body).toMatchObject({
      dueToday: { totalCents: 0 },
      proration: { subtotalCents: 5500, chargedNow: false },
      nextRenewal: { at: new Date(renewal * 1000).toISOString(), subtotalCents: 14900 + 5500 },
      appliesAt: expect.any(String),
    });
  });

  it('charges an annual upgrade today', async () => {
    const fake = createFake();
    const annual = { ...start, interval: 'year' } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: annual, periodEnd: now() + 127 * day });
    fake.stripe['POST /v1/invoices/create_preview'] = () => ({
      object: 'invoice',
      subtotal: 38250,
      total: 46283,
      lines: stripeList([]),
    });

    const body = await previewOf(
      await request('POST', '/billing/preview', { ...pro, interval: 'year' })
    );

    expect(stripeWrites(fake, '/v1/invoices/create_preview')[0]).toMatchObject({
      'subscription_details[proration_behavior]': 'always_invoice',
    });
    expect(body.dueToday).toEqual({ subtotalCents: 38250, vatCents: 8033, totalCents: 46283 });
  });

  it("charges now within the trial's last hour, as the checkout will", async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(
      subscriptionRow({ trial_ends_at: new Date(Date.now() + 30 * 60_000).toISOString() })
    );

    const body = await previewOf(await request('POST', '/billing/preview', pro));

    expect(body.dueToday.totalCents).toBe(18029);
    expect(Date.parse(body.firstChargeAt)).toBeLessThanOrEqual(Date.now());
  });

  it("charges now in the trial's last hour for a plan whose card never confirmed", async () => {
    const fake = createFake();
    const trialEnd = new Date(Date.now() + 30 * 60_000).toISOString();
    fake.tables.subscriptions!.push(
      paidRow(start, { status: 'trialing', trial_ends_at: trialEnd, access_until: trialEnd })
    );
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'trialing', choice: start });

    const body = await previewOf(await request('POST', '/billing/preview', pro));

    expect(body.dueToday.totalCents).toBe(18029);
  });

  it('returns the moment it prorated from', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(start));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: start });
    fake.stripe['POST /v1/invoices/create_preview'] = () => ({
      object: 'invoice',
      subtotal: 14900,
      total: 18029,
      lines: stripeList([]),
    });

    const body = await previewOf(await request('POST', '/billing/preview', pro));

    const sent = stripeWrites(fake, '/v1/invoices/create_preview')[0]!;
    expect(body.prorationDate).toBe(
      new Date(Number(sent['subscription_details[proration_date]']) * 1000).toISOString()
    );
  });

  it('says an annual addition and a removal go one after the other', async () => {
    const fake = createFake();
    const annual = { ...pro, interval: 'year', extraMembers: 2 } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: annual });
    fake.stripe['POST /v1/invoices/create_preview'] = () => ({
      object: 'invoice',
      subtotal: 10000,
      total: 12100,
      lines: stripeList([]),
    });

    const body = await previewOf(
      await request('POST', '/billing/preview', { ...annual, employeePacks: 1, extraMembers: 0 })
    );

    expect(body.problems).toEqual([{ reason: 'split_change' }]);
  });

  it('refuses a specialist', async () => {
    createFake({ membership: { user_id: owner.id, role: 'specialist', access: 'full' } });

    expect((await request('POST', '/billing/preview', pro)).status).toBe(403);
  });

  it('refuses an admin impersonating the owner', async () => {
    createFake({ membership: { user_id: 'someone-else', role: 'owner', access: 'full' } });

    expect((await request('POST', '/billing/preview', pro)).status).toBe(403);
  });
});

describe('POST /billing/subscription', () => {
  function creating(fake: Fake, subscription: Record<string, unknown>) {
    fake.stripe['GET /v1/customers'] ??= () => stripeList([]);
    fake.stripe['POST /v1/customers'] = () => ({ id: 'cus_1Test', object: 'customer' });
    fake.stripe['GET /v1/subscriptions'] = () => stripeList([]);
    fake.stripe['POST /v1/subscriptions'] = () => subscription;
  }

  it('saves the card during the trial and charges at its end', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());
    const trialEnd = Math.floor(Date.parse(row(fake).trial_ends_at as string) / 1000);
    creating(fake, {
      ...stripeSubscription({
        status: 'trialing',
        choice: { ...start, employeePacks: 1 },
        trialEnd,
        periodEnd: trialEnd,
      }),
      pending_setup_intent: {
        id: 'seti_1',
        object: 'setup_intent',
        client_secret: 'seti_1_secret',
      },
    });

    const response = await request('POST', '/billing/subscription', { ...start, employeePacks: 1 });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ clientSecret: 'seti_1_secret', intent: 'setup' });
    expect(stripeWrites(fake, '/v1/customers')[0]).toMatchObject({
      name: 'Prevenție Activă SRL',
      email: owner.email,
      'metadata[organization_id]': organizationId,
      'preferred_locales[0]': 'ro',
    });
    expect(stripeWrites(fake, '/v1/subscriptions')[0]).toMatchObject({
      customer: 'cus_1Test',
      'items[0][price]': priceIdOf('start_monthly_v1'),
      'items[1][price]': priceIdOf('employees50_monthly_v1'),
      'items[1][quantity]': '1',
      'items[2][price]': priceIdOf('sms_overage_monthly_v1'),
      'default_tax_rates[0]': 'txr_vat',
      payment_behavior: 'default_incomplete',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'payment_settings[payment_method_types][0]': 'card',
      'billing_mode[type]': 'flexible',
      trial_end: String(trialEnd),
      'metadata[organization_id]': organizationId,
    });
    expect(row(fake)).toMatchObject({
      plan: 'start',
      status: 'trialing',
      stripe_subscription_id: 'sub_1Test',
      employee_packs: 1,
    });
  });

  it('charges a read-only organization now, and waits for the payment to adopt it', async () => {
    const fake = createFake({
      membership: { user_id: owner.id, role: 'owner', access: 'read_only' },
    });
    fake.tables.subscriptions!.push(
      subscriptionRow({
        trial_ends_at: new Date(Date.now() - 1e9).toISOString(),
        access_until: new Date(Date.now() - 1e9).toISOString(),
      })
    );
    creating(fake, {
      ...stripeSubscription({ status: 'incomplete', choice: pro }),
      latest_invoice: {
        id: 'in_1First',
        object: 'invoice',
        status: 'open',
        amount_remaining: 18029,
        confirmation_secret: { client_secret: 'pi_1_secret', type: 'payment_intent' },
      },
    });

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ clientSecret: 'pi_1_secret', intent: 'payment' });
    expect(stripeWrites(fake, '/v1/subscriptions')[0]!.trial_end).toBeUndefined();
    expect(row(fake)).toMatchObject({
      status: 'trialing',
      stripe_customer_id: 'cus_1Test',
      stripe_subscription_id: null,
    });
  });

  it('asks for the company details the invoice needs first', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());
    fake.tables.organizations![0]!.cui = null;

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('company_details_missing');
    expect(stripeWrites(fake, '/v1/subscriptions')).toEqual([]);
  });

  it('refuses packs below what the employees need', async () => {
    const fake = createFake({ employees: 312 });
    fake.tables.subscriptions!.push(subscriptionRow());

    const response = await request('POST', '/billing/subscription', start);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('employee_packs_below_need');
  });

  it('replaces a plan chosen in the trial whose card never confirmed', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(
      subscriptionRow({
        plan: 'start',
        stripe_customer_id: 'cus_1Test',
        stripe_account: 'acct_1Test',
        stripe_subscription_id: 'sub_1Old',
        billing_interval: 'month',
        price_version: 'v1',
      })
    );
    const trialEnd = Math.floor(Date.parse(row(fake).trial_ends_at as string) / 1000);
    fake.stripe['GET /v1/subscriptions/sub_1Old'] = () => ({
      ...stripeSubscription({ status: 'trialing', choice: start, trialEnd }),
      id: 'sub_1Old',
    });
    fake.stripe['DELETE /v1/subscriptions/sub_1Old'] = () => ({
      ...stripeSubscription({ status: 'canceled', choice: start, trialEnd }),
      id: 'sub_1Old',
    });
    fake.stripe['POST /v1/customers/cus_1Test'] = () => ({ id: 'cus_1Test', object: 'customer' });
    creating(fake, {
      ...stripeSubscription({ status: 'trialing', choice: pro, trialEnd, periodEnd: trialEnd }),
      pending_setup_intent: {
        id: 'seti_2',
        object: 'setup_intent',
        client_secret: 'seti_2_secret',
      },
    });

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ clientSecret: 'seti_2_secret', intent: 'setup' });
    expect(
      fake.calls.some(
        (call) => call.method === 'DELETE' && call.url.pathname === '/v1/subscriptions/sub_1Old'
      )
    ).toBe(true);
    expect(row(fake)).toMatchObject({ plan: 'profesional', stripe_subscription_id: 'sub_1Test' });
  });

  it('takes up a subscription an earlier checkout paid for, instead of making a second', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow({ stripe_customer_id: 'cus_1Test' }));
    fake.stripe['POST /v1/customers/cus_1Test'] = () => ({ id: 'cus_1Test', object: 'customer' });
    creating(fake, stripeSubscription({ choice: pro }));
    fake.stripe['GET /v1/subscriptions'] = () =>
      stripeList([stripeSubscription({ id: 'sub_1Paid', status: 'active', choice: pro })]);

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('already_subscribed');
    expect(stripeWrites(fake, '/v1/subscriptions')).toEqual([]);
    expect(row(fake)).toMatchObject({
      plan: 'profesional',
      status: 'active',
      stripe_subscription_id: 'sub_1Paid',
    });
  });

  it('replaces an earlier checkout that was left before paying or confirming the card', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow({ stripe_customer_id: 'cus_1Test' }));
    fake.stripe['POST /v1/customers/cus_1Test'] = () => ({ id: 'cus_1Test', object: 'customer' });
    creating(fake, stripeSubscription({ status: 'trialing', choice: pro }));
    fake.stripe['GET /v1/subscriptions'] = () =>
      stripeList([
        stripeSubscription({ id: 'sub_1Left', status: 'incomplete', choice: pro }),
        stripeSubscription({ id: 'sub_1Unconfirmed', status: 'trialing', choice: start }),
      ]);
    fake.stripe['DELETE /v1/subscriptions/sub_1(Left|Unconfirmed)'] = () =>
      stripeSubscription({ status: 'canceled', choice: pro });

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(201);
    expect(
      fake.calls.filter((call) => call.method === 'DELETE').map((call) => call.url.pathname)
    ).toEqual(['/v1/subscriptions/sub_1Left', '/v1/subscriptions/sub_1Unconfirmed']);
    expect(stripeWrites(fake, '/v1/subscriptions')).toHaveLength(1);
  });

  it('finds the customer a retried checkout already made, though the company details changed', async () => {
    const fake = createFake();
    fake.stripe['GET /v1/customers'] = () =>
      stripeList([
        { id: 'cus_1Other', object: 'customer', metadata: { organization_id: 'someone-else' } },
        { id: 'cus_1Made', object: 'customer', metadata: { organization_id: organizationId } },
      ]);
    fake.stripe['POST /v1/customers/cus_1Made'] = () => ({ id: 'cus_1Made', object: 'customer' });
    creating(fake, {
      ...stripeSubscription({ status: 'incomplete', choice: pro }),
      latest_invoice: {
        id: 'in_1First',
        object: 'invoice',
        status: 'open',
        amount_remaining: 18029,
        confirmation_secret: { client_secret: 'pi_1_secret', type: 'payment_intent' },
      },
    });

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(201);
    expect(stripeWrites(fake, '/v1/customers')).toEqual([]);
    expect(stripeWrites(fake, '/v1/customers/cus_1Made')[0]).toMatchObject({
      name: 'Prevenție Activă SRL',
    });
    expect(stripeWrites(fake, '/v1/subscriptions')[0]).toMatchObject({ customer: 'cus_1Made' });
  });

  it('refuses a second subscription', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(pro));

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('subscription_exists');
  });

  it('answers 503 without the Stripe key', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());

    const response = await request('POST', '/billing/subscription', pro, {
      ...env,
      STRIPE_SECRET_KEY: undefined,
    });

    expect(response.status).toBe(503);
  });
});

describe('PATCH /billing/subscription', () => {
  it('adds a monthly upgrade to the next invoice', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow({ ...start, employeePacks: 2 }));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: { ...start, employeePacks: 2 } });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });

    const response = await request('PATCH', '/billing/subscription', pro);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clientSecret: null, intent: null });
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]).toMatchObject({
      'items[0][id]': 'si_0',
      'items[0][price]': priceIdOf('profesional_monthly_v1'),
      'items[1][id]': 'si_1',
      'items[1][deleted]': 'true',
      proration_behavior: 'create_prorations',
      payment_behavior: 'allow_incomplete',
    });
    expect(row(fake)).toMatchObject({ plan: 'profesional', employee_packs: 0 });
  });

  it('charges an annual upgrade at once and hands back the payment to confirm', async () => {
    const fake = createFake();
    const annual = { ...start, interval: 'year' } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: annual });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({
        choice: annual,
        latestInvoice: {
          id: 'in_1Upgrade',
          object: 'invoice',
          status: 'open',
          billing_reason: 'subscription_update',
          amount_remaining: 46283,
          confirmation_secret: { client_secret: 'pi_2_secret', type: 'payment_intent' },
        },
      });

    const response = await request('PATCH', '/billing/subscription', { ...pro, interval: 'year' });

    expect(await response.json()).toEqual({ clientSecret: 'pi_2_secret', intent: 'payment' });
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]).toMatchObject({
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    });
  });

  it("sets an annual Start's packs to none rather than deleting them, which a pending update cannot", async () => {
    const fake = createFake();
    const annual = { ...start, interval: 'year', employeePacks: 2 } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: annual });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: annual });

    await request('PATCH', '/billing/subscription', { ...pro, interval: 'year' });

    const sent = stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]!;
    expect(sent).toMatchObject({
      'items[0][id]': 'si_0',
      'items[0][price]': priceIdOf('profesional_annual_v1'),
      'items[1][id]': 'si_1',
      'items[1][quantity]': '0',
    });
    expect(Object.keys(sent).some((key) => key.endsWith('[deleted]'))).toBe(false);
  });

  it('refuses an annual change that adds now and removes at the renewal, before touching Stripe', async () => {
    const fake = createFake();
    const annual = { ...pro, interval: 'year', extraMembers: 2 } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: annual });

    const response = await request('PATCH', '/billing/subscription', {
      ...annual,
      employeePacks: 1,
      extraMembers: 0,
    });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('split_change');
    expect(stripeCalls(fake).filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('prorates from the moment the preview showed, if it is recent', async () => {
    const changing = async (prorationDate: number) => {
      const fake = createFake();
      fake.tables.subscriptions!.push(paidRow(start));
      fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: start });
      fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });
      await request('PATCH', '/billing/subscription', {
        ...pro,
        prorationDate: new Date(prorationDate * 1000).toISOString(),
      });
      return Number(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]!.proration_date);
    };
    const shown = now() - 120;

    expect(await changing(shown)).toBe(shown);
    expect(await changing(now() - 2 * 3600)).toBeGreaterThanOrEqual(now() - 5);
    expect(await changing(now() + 600)).toBeLessThanOrEqual(now());
  });

  it('leaves a downgrade for the renewal through a subscription schedule', async () => {
    const fake = createFake();
    const renewal = now() + 12 * day;
    fake.tables.subscriptions!.push(paidRow(pro));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: pro, periodEnd: renewal });
    fake.stripe['POST /v1/subscription_schedules'] = () => ({
      id: 'sub_sched_1',
      object: 'subscription_schedule',
      phases: [{ start_date: renewal - 30 * day, end_date: renewal, items: [] }],
    });
    fake.stripe['POST /v1/subscription_schedules/sub_sched_1'] = () => ({
      id: 'sub_sched_1',
      object: 'subscription_schedule',
      phases: [],
    });

    const response = await request('PATCH', '/billing/subscription', {
      ...start,
      employeePacks: 1,
    });

    expect(response.status).toBe(200);
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')).toEqual([]);
    expect(stripeWrites(fake, '/v1/subscription_schedules')).toEqual([
      { from_subscription: 'sub_1Test' },
    ]);
    expect(stripeWrites(fake, '/v1/subscription_schedules/sub_sched_1')[0]).toMatchObject({
      end_behavior: 'release',
      'phases[0][end_date]': String(renewal),
      'phases[0][items][0][price]': priceIdOf('profesional_monthly_v1'),
      'phases[1][items][0][price]': priceIdOf('start_monthly_v1'),
      'phases[1][items][1][price]': priceIdOf('employees50_monthly_v1'),
      'phases[1][items][1][quantity]': '1',
      'phases[1][items][2][price]': priceIdOf('sms_overage_monthly_v1'),
      'phases[1][proration_behavior]': 'none',
      'phases[1][duration][interval]': 'month',
    });
    expect(row(fake)).toMatchObject({ plan: 'profesional' });
    expect(fake.tables.subscription_changes).toContainEqual(
      expect.objectContaining({ change: 'change_scheduled', source: 'owner' })
    );
  });

  it('changes a plan chosen in the trial at once, with nothing prorated', async () => {
    const fake = createFake();
    const trialEnd = now() + 10 * day;
    fake.tables.subscriptions!.push(
      paidRow(start, {
        status: 'trialing',
        trial_ends_at: new Date(trialEnd * 1000).toISOString(),
        access_until: new Date((trialEnd + 14 * day) * 1000).toISOString(),
      })
    );
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'trialing', choice: start, trialEnd });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'trialing', choice: pro, trialEnd });

    await request('PATCH', '/billing/subscription', pro);

    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]).toMatchObject({
      proration_behavior: 'none',
    });
    expect(row(fake)).toMatchObject({ plan: 'profesional', status: 'trialing' });
  });

  it('refuses a change that changes nothing', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(pro));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });

    const response = await request('PATCH', '/billing/subscription', pro);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('unchanged');
  });
});

describe('cancelling and resuming', () => {
  it('cancels at the end of the longest period paid and keeps the reason', async () => {
    const fake = createFake();
    const periodEnd = now() + 200 * day;
    fake.tables.subscriptions!.push(paidRow({ ...pro, interval: 'year' }));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: { ...pro, interval: 'year' }, periodEnd });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: { ...pro, interval: 'year' }, periodEnd, cancelAt: periodEnd });

    const response = await request('POST', '/billing/subscription/cancel', {
      reason: 'too_expensive',
      note: 'Prea scump acum',
    });

    expect(response.status).toBe(204);
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]).toEqual({
      cancel_at: 'max_period_end',
      'cancellation_details[feedback]': 'too_expensive',
      'cancellation_details[comment]': 'Prea scump acum',
    });
    expect(row(fake).access_until).toBe(new Date(periodEnd * 1000).toISOString());
    expect(fake.tables.subscription_changes).toContainEqual(
      expect.objectContaining({
        change: 'cancel_requested',
        reason: 'too_expensive',
        source: 'owner',
      })
    );
  });

  it('drops a plan chosen in the trial at once and returns to the plain trial', async () => {
    const fake = createFake();
    const trialEnd = new Date(Date.now() + 10 * day * 1000).toISOString();
    fake.tables.subscriptions!.push(
      paidRow(start, {
        status: 'trialing',
        trial_ends_at: trialEnd,
        access_until: new Date(Date.now() + 24 * day * 1000).toISOString(),
      })
    );
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'trialing', choice: start });
    fake.stripe['DELETE /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'canceled', choice: start, endedAt: now() });

    const response = await request('POST', '/billing/subscription/cancel', {});

    expect(response.status).toBe(204);
    expect(row(fake)).toMatchObject({
      plan: 'profesional',
      status: 'trialing',
      stripe_subscription_id: null,
      employee_packs: 0,
      access_until: trialEnd,
    });
  });

  it('withdraws a pending cancellation', async () => {
    const fake = createFake();
    const periodEnd = now() + 20 * day;
    fake.tables.subscriptions!.push(
      paidRow(pro, { access_until: new Date(periodEnd * 1000).toISOString() })
    );
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: pro, periodEnd, cancelAt: periodEnd });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: pro, periodEnd });

    const response = await request('POST', '/billing/subscription/resume');

    expect(response.status).toBe(204);
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')).toEqual([{ cancel_at: '' }]);
    expect(row(fake).access_until).toBeNull();
  });

  it('has nothing to resume on a subscription that renews', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(pro));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });

    const response = await request('POST', '/billing/subscription/resume');

    expect(await reasonOf(response)).toBe('not_canceling');
  });
});

describe('the card, the invoice email and the PDFs', () => {
  it("opens Stripe's portal on the card alone, back to the subscription tab", async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow(pro));
    fake.stripe['POST /v1/billing_portal/sessions'] = () => ({
      url: 'https://billing.stripe.com/p/session/1',
    });

    const response = await request('POST', '/billing/portal-session');

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: 'https://billing.stripe.com/p/session/1' });
    expect(stripeWrites(fake, '/v1/billing_portal/sessions')[0]).toMatchObject({
      customer: 'cus_1Test',
      configuration: 'bpc_card',
      'flow_data[type]': 'payment_method_update',
      return_url: 'https://app.example.ro/organization/subscription',
    });
  });

  it('saves the email for invoices, also while read-only', async () => {
    const fake = createFake({
      membership: { user_id: owner.id, role: 'owner', access: 'read_only' },
    });
    fake.tables.subscriptions!.push(paidRow(pro));

    const response = await request('PUT', '/billing/invoice-email', {
      email: 'Contabil@Example.ro',
    });

    expect(await response.json()).toEqual({ email: 'contabil@example.ro' });
    expect(row(fake).invoice_email).toBe('contabil@example.ro');
  });

  it('hands out a short-lived link to our copy of the PDF', async () => {
    const fake = createFake();
    fake.tables.billing_invoices!.push({
      stripe_invoice_id: 'in_1Paid',
      organization_id: organizationId,
      pdf_path: `${organizationId}/SSMUSOR-0001.pdf`,
    });

    const response = await request('GET', '/billing/invoices/in_1Paid/pdf');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      url: expect.stringContaining('/storage/v1/object/sign/billing-invoices/'),
      fileName: 'SSMUSOR-0001.pdf',
    });
  });

  it("never another organization's invoice", async () => {
    const fake = createFake();
    fake.tables.billing_invoices!.push({
      stripe_invoice_id: 'in_1Other',
      organization_id: '00000000-0000-4000-8000-000000000000',
      pdf_path: '00000000-0000-4000-8000-000000000000/SSMUSOR-0009.pdf',
    });

    expect((await request('GET', '/billing/invoices/in_1Other/pdf')).status).toBe(404);
  });
});
