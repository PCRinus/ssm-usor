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
const start = { plan: 'start', step: 250, interval: 'month' } as const;
const pro = { plan: 'profesional', step: 1500, interval: 'month' } as const;

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
    const trial = subscriptionRow();
    fake.tables.subscriptions!.push(trial);

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
      employees: { used: 120, limit: 5000 },
      employeesOverStep: null,
      members: { used: 1, limit: 10 },
      invitations: 0,
      smsThisMonth: {
        used: 0,
        included: 0,
        allowance: 0,
        granted: 0,
        overage: 0,
        periodStart: null,
        periodEnd: null,
        state: 'none',
      },
      creditsThisMonth: {
        used: 0,
        included: 300,
        allowance: 300,
        granted: 0,
        shortfall: 0,
        left: 300,
        giftLeft: 0,
        extra: 0,
        extraLeft: 0,
        period: 'trial',
        periodStart: trial.created_at,
        periodEnd: trial.trial_ends_at,
        state: 'ok',
      },
    });
    expect(
      body.catalogue.plans.map((plan) => [
        plan.key,
        plan.members,
        plan.steps.map((step) => [step.employees, step.prices.month, step.monthlyCredits]),
      ])
    ).toEqual([
      [
        'start',
        3,
        [
          [250, 3900, 750],
          [500, 5900, 1250],
          [750, 7900, 1750],
        ],
      ],
      [
        'profesional',
        10,
        [
          [500, 8900, 1250],
          [1000, 11900, 2250],
          [1500, 14900, 3250],
          [2000, 17900, 4250],
          [3000, 23900, 6250],
          [4000, 29900, 8250],
          [5000, 35900, 10250],
        ],
      ],
    ]);
  });

  it('counts the open invitations, which hold places among the users', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow({ plan: 'start', step: 250, interval: 'month' }));
    fake.tables.organization_invitations = [
      { organization_id: organizationId, accepted_at: null, revoked_at: null },
      { organization_id: organizationId, accepted_at: null, revoked_at: null },
    ];
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: { plan: 'start', step: 250, interval: 'month' } });
    fake.stripe['POST /v1/invoices/create_preview'] = () => ({
      object: 'invoice',
      subtotal: 3900,
      total: 4719,
      period_end: now() + 20 * day,
      lines: stripeList([]),
    });
    fake.stripe['GET /v1/customers/cus_1Test'] = () => ({
      id: 'cus_1Test',
      object: 'customer',
      invoice_settings: { default_payment_method: null },
    });

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.usage.invitations).toBe(2);
    expect(body.usage.members).toEqual({ used: 1, limit: 3 });
  });

  it('says to every member since when the employees are over the step and until when one is added', async () => {
    const fake = createFake({
      membership: { user_id: owner.id, role: 'specialist', access: 'full' },
      employeesOverStep: {
        employees: 262,
        employee_limit: 250,
        over_since: '2026-11-02T10:00:00+00:00',
        last_day: '2026-12-02',
        blocked: false,
      },
    });
    fake.tables.subscriptions!.push(paidRow({ plan: 'start', step: 250, interval: 'month' }));

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.usage.employeesOverStep).toEqual({
      since: '2026-11-02T10:00:00.000Z',
      lastDay: '2026-12-02',
      blocked: false,
    });
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
        start: { minimumStep: 500, problems: [] },
        profesional: { minimumStep: 500, problems: [] },
      },
    });
    expect(stripeCalls(fake)).toEqual([]);
  });

  it('shows the owner of a paid plan the card, the next payment and a change set for the renewal', async () => {
    const fake = createFake();
    const renewal = now() + 10 * day;
    fake.tables.subscriptions!.push(paidRow(pro));
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
        choice: pro,
        periodEnd: renewal,
        schedule: {
          id: 'sub_sched_1',
          object: 'subscription_schedule',
          phases: [
            { start_date: renewal - 30 * day, end_date: renewal, items: [] },
            {
              start_date: renewal,
              end_date: renewal + 30 * day,
              items: [{ price: priceIdOf('profesional_1500_monthly_v2'), quantity: 1 }],
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
          pricing: { price_details: { price: priceIdOf('sms_overage_monthly_v2') } },
        },
        {
          amount: 14900,
          pricing: { price_details: { price: priceIdOf('profesional_1500_monthly_v2') } },
        },
      ]),
    });

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.subscription).toMatchObject({
      planChosen: true,
      status: 'active',
      step: 1500,
      cancelsAt: null,
    });
    expect(body.usage.members.limit).toBe(10);
    expect(body.usage.employees.limit).toBe(1500);
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

  it('shows the owner a cancellation set while a payment is overdue, ending with the retries at the latest', async () => {
    const fake = createFake();
    const retriesEnd = new Date(Date.now() + 9 * day * 1000).toISOString();
    fake.tables.subscriptions!.push(paidRow(pro, { status: 'past_due', access_until: retriesEnd }));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'past_due', choice: pro, cancelAt: now() + 28 * day });
    fake.stripe['GET /v1/customers/cus_1Test'] = () => ({
      id: 'cus_1Test',
      object: 'customer',
      invoice_settings: { default_payment_method: null },
    });

    const body = billingOverviewSchema.parse(await (await request('GET', '/billing')).json());

    expect(body.subscription).toMatchObject({ status: 'past_due', cancelsAt: retriesEnd });
  });
});

describe('POST /billing/preview', () => {
  it('prices a plan chosen in the trial as paid today, its period starting now', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());

    const before = Date.now();
    const response = await request('POST', '/billing/preview', { ...start, step: 500 });

    expect(response.status).toBe(200);
    const body = billingPreviewSchema.parse(await response.json());
    expect(body).toMatchObject({
      problems: [],
      recurring: { subtotalCents: 5900, vatCents: 1239, totalCents: 7139 },
      dueToday: { subtotalCents: 5900, vatCents: 1239, totalCents: 7139 },
      nextRenewal: { totalCents: 7139 },
    });
    expect(Date.parse(body.firstChargeAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(body.firstChargeAt)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(body.nextRenewal.at)).toBeLessThan(Date.now() + 32 * day * 1000);
    expect(Date.parse(body.nextRenewal.at)).toBeGreaterThan(Date.now() + 27 * day * 1000);
  });

  it('says which of Start’s limits the organization passes, and the step it needs', async () => {
    const fake = createFake({ employees: 760 });
    fake.tables.subscriptions!.push(subscriptionRow());
    fake.tables.organization_members!.push(
      { organization_id: organizationId, user_id: 'a', role: 'specialist' },
      { organization_id: organizationId, user_id: 'b', role: 'specialist' },
      { organization_id: organizationId, user_id: 'c', role: 'specialist' }
    );

    const startPreview = await previewOf(await request('POST', '/billing/preview', start));
    const proPreview = await previewOf(await request('POST', '/billing/preview', pro));

    expect(startPreview.problems).toEqual([
      { reason: 'employees_over_plan', maximum: 750 },
      { reason: 'members_over_plan', maximum: 3 },
    ]);
    expect(proPreview.problems).toEqual([]);
    expect(proPreview.minimumStep).toBe(1000);
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
      'subscription_details[items][0][price]': priceIdOf('profesional_1500_monthly_v2'),
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

  it('prices a change of a plan chosen in the trial before 2026-11-14 for the trial’s end', async () => {
    const fake = createFake();
    const trialEnd = new Date(Date.now() + 10 * day * 1000).toISOString();
    fake.tables.subscriptions!.push(
      paidRow(start, { status: 'trialing', trial_ends_at: trialEnd, access_until: trialEnd })
    );
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => ({
      ...stripeSubscription({
        status: 'trialing',
        choice: start,
        trialEnd: Math.floor(Date.parse(trialEnd) / 1000),
      }),
      default_payment_method: 'pm_1Card',
    });

    const body = await previewOf(await request('POST', '/billing/preview', pro));

    expect(body).toMatchObject({
      dueToday: { totalCents: 0 },
      firstChargeAt: trialEnd,
      nextRenewal: { at: trialEnd, totalCents: 18029 },
    });
  });

  it('prices a new checkout for a plan chosen in the trial whose card never confirmed', async () => {
    const fake = createFake();
    const trialEnd = new Date(Date.now() + 10 * day * 1000).toISOString();
    fake.tables.subscriptions!.push(
      paidRow(start, { status: 'trialing', trial_ends_at: trialEnd, access_until: trialEnd })
    );
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ status: 'trialing', choice: start });

    const body = await previewOf(await request('POST', '/billing/preview', pro));

    expect(body.dueToday.totalCents).toBe(18029);
    expect(Date.parse(body.firstChargeAt)).toBeLessThanOrEqual(Date.now());
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

  it('says a change for the renewal waits while an annual upgrade is still being paid', async () => {
    const fake = createFake();
    const annual = { ...pro, step: 2000, interval: 'year' } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => ({
      ...stripeSubscription({ choice: annual }),
      pending_update: { expires_at: now() + day },
    });

    const body = await previewOf(
      await request('POST', '/billing/preview', { ...annual, step: 1500 })
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

  it('charges a plan chosen during the trial now, and leaves the trial as it is until it is paid', async () => {
    const fake = createFake();
    const trial = subscriptionRow();
    fake.tables.subscriptions!.push(trial);
    creating(fake, {
      ...stripeSubscription({ status: 'incomplete', choice: { ...start, step: 500 } }),
      latest_invoice: {
        id: 'in_1First',
        object: 'invoice',
        status: 'open',
        amount_remaining: 7139,
        confirmation_secret: { client_secret: 'pi_1_secret', type: 'payment_intent' },
      },
    });

    const response = await request('POST', '/billing/subscription', { ...start, step: 500 });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ clientSecret: 'pi_1_secret', intent: 'payment' });
    expect(stripeWrites(fake, '/v1/customers')[0]).toMatchObject({
      name: 'Prevenție Activă SRL',
      email: owner.email,
      'metadata[organization_id]': organizationId,
      'preferred_locales[0]': 'ro',
    });
    const sent = stripeWrites(fake, '/v1/subscriptions')[0]!;
    expect(sent).toMatchObject({
      customer: 'cus_1Test',
      'items[0][price]': priceIdOf('start_500_monthly_v2'),
      'items[0][quantity]': '1',
      'items[1][price]': priceIdOf('sms_overage_monthly_v2'),
      'items[2][price]': priceIdOf('credits_extra_monthly_v2'),
      'default_tax_rates[0]': 'txr_vat',
      payment_behavior: 'default_incomplete',
      'payment_settings[save_default_payment_method]': 'on_subscription',
      'payment_settings[payment_method_types][0]': 'card',
      'billing_mode[type]': 'flexible',
      'metadata[organization_id]': organizationId,
    });
    expect(sent.trial_end).toBeUndefined();
    expect(row(fake)).toMatchObject({
      plan: 'profesional',
      status: 'trialing',
      trial_ends_at: trial.trial_ends_at,
      access_until: trial.access_until,
      stripe_customer_id: 'cus_1Test',
      stripe_subscription_id: null,
      employee_step: null,
      first_paid_at: null,
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

  it('refuses a step below what the employees need', async () => {
    const fake = createFake({ employees: 312 });
    fake.tables.subscriptions!.push(subscriptionRow());

    const response = await request('POST', '/billing/subscription', start);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('step_below_need');
  });

  it('refuses a step that is not one of the plan’s', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());

    const response = await request('POST', '/billing/subscription', { ...start, step: 1000 });

    expect(response.status).toBe(400);
  });

  it('replaces a plan chosen in the trial before 2026-11-14 whose card never confirmed, and charges now', async () => {
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
      ...stripeSubscription({ status: 'incomplete', choice: pro }),
      latest_invoice: {
        id: 'in_1First',
        object: 'invoice',
        status: 'open',
        amount_remaining: 18029,
        confirmation_secret: { client_secret: 'pi_2_secret', type: 'payment_intent' },
      },
    });

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ clientSecret: 'pi_2_secret', intent: 'payment' });
    expect(stripeWrites(fake, '/v1/subscriptions')[0]!.trial_end).toBeUndefined();
    expect(
      fake.calls.some(
        (call) => call.method === 'DELETE' && call.url.pathname === '/v1/subscriptions/sub_1Old'
      )
    ).toBe(true);
    expect(row(fake)).toMatchObject({
      plan: 'profesional',
      status: 'trialing',
      stripe_subscription_id: null,
    });
  });

  async function checkoutKey(earlier: unknown[]) {
    const trialEnd = '2099-01-15T21:59:59.999Z';
    const fake = createFake();
    fake.tables.subscriptions!.push(
      subscriptionRow({
        trial_ends_at: trialEnd,
        access_until: trialEnd,
        stripe_customer_id: 'cus_1Test',
      })
    );
    fake.stripe['POST /v1/customers/cus_1Test'] = () => ({ id: 'cus_1Test', object: 'customer' });
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
    fake.stripe['GET /v1/subscriptions'] = () => stripeList(earlier);

    expect((await request('POST', '/billing/subscription', pro)).status).toBe(201);
    return fake.calls.find(
      (call) => call.method === 'POST' && call.url.pathname === '/v1/subscriptions'
    )!.idempotencyKey;
  }

  it('makes one subscription for two checkouts at the same moment, and a new one after an abandoned checkout', async () => {
    const first = await checkoutKey([]);
    const second = await checkoutKey([]);
    const afterAbandoned = await checkoutKey([
      stripeSubscription({ id: 'sub_1Gone', status: 'canceled', choice: pro }),
    ]);

    expect(first).toMatch(/^subscription-/);
    expect(second).toBe(first);
    expect(afterAbandoned).not.toBe(first);
  });

  it('answers a checkout that meets another one under way with a conflict', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(subscriptionRow());
    creating(fake, {});
    fake.stripe['POST /v1/subscriptions'] = () =>
      new Response(
        JSON.stringify({
          error: {
            type: 'idempotency_error',
            message: 'There is currently another in-progress request using this Idempotent Key.',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );

    const response = await request('POST', '/billing/subscription', pro);

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('checkout_in_progress');
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
    fake.tables.subscriptions!.push(paidRow(start));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: start });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });

    const response = await request('PATCH', '/billing/subscription', pro);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clientSecret: null, intent: null });
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]).toMatchObject({
      'items[0][id]': 'si_0',
      'items[0][price]': priceIdOf('profesional_1500_monthly_v2'),
      proration_behavior: 'create_prorations',
      payment_behavior: 'allow_incomplete',
    });
    expect(row(fake)).toMatchObject({ plan: 'profesional', employee_step: 1500 });
  });

  it('moves up a step as a change of the plan price, prorated on the next invoice', async () => {
    const fake = createFake({ employees: 300 });
    fake.tables.subscriptions!.push(paidRow({ ...start, step: 500 }));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: { ...start, step: 500 } });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({ choice: { ...start, step: 750 } });

    const response = await request('PATCH', '/billing/subscription', { ...start, step: 750 });

    expect(response.status).toBe(200);
    const write = stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0];
    expect(write).toMatchObject({
      'items[0][id]': 'si_0',
      'items[0][price]': priceIdOf('start_750_monthly_v2'),
      'items[0][quantity]': '1',
      proration_behavior: 'create_prorations',
    });
    expect(Object.keys(write!).filter((key) => key.startsWith('items[1]'))).toEqual([]);
    expect(row(fake)).toMatchObject({ plan: 'start', employee_step: 750 });
  });

  it('moves a v1 subscription to v2, removing its packs and extra members', async () => {
    const fake = createFake();
    fake.tables.subscriptions!.push(paidRow({ ...start, step: 500 }, { price_version: 'v1' }));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () =>
      stripeSubscription({
        choice: { ...start, step: 500 },
        lines: [
          { lookupKey: 'start_monthly_v1', quantity: 1 },
          { lookupKey: 'employees50_monthly_v1', quantity: 2 },
          { lookupKey: 'member_monthly_v1', quantity: 1 },
          { lookupKey: 'sms_overage_monthly_v1', quantity: undefined },
        ],
      });
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => stripeSubscription({ choice: pro });

    const response = await request('PATCH', '/billing/subscription', pro);

    expect(response.status).toBe(200);
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]).toMatchObject({
      'items[0][id]': 'si_0',
      'items[0][price]': priceIdOf('profesional_1500_monthly_v2'),
      'items[1][id]': 'si_1',
      'items[1][deleted]': 'true',
      'items[2][id]': 'si_2',
      'items[2][deleted]': 'true',
    });
    expect(row(fake)).toMatchObject({ price_version: 'v2', employee_step: 1500 });
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

  it("sets an annual v1 Start's packs to none rather than deleting them, which a pending update cannot", async () => {
    const fake = createFake();
    const annual = { ...start, step: 500, interval: 'year' } as const;
    fake.tables.subscriptions!.push(paidRow(annual, { price_version: 'v1' }));
    const v1 = stripeSubscription({
      choice: annual,
      lines: [
        { lookupKey: 'start_annual_v1', quantity: 1 },
        { lookupKey: 'employees50_annual_v1', quantity: 2 },
        { lookupKey: 'sms_overage_monthly_v1', quantity: undefined },
      ],
    });
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => v1;
    fake.stripe['POST /v1/subscriptions/sub_1Test'] = () => v1;

    await request('PATCH', '/billing/subscription', { ...pro, interval: 'year' });

    const sent = stripeWrites(fake, '/v1/subscriptions/sub_1Test')[0]!;
    expect(sent).toMatchObject({
      'items[0][id]': 'si_0',
      'items[0][price]': priceIdOf('profesional_1500_annual_v2'),
      'items[1][id]': 'si_1',
      'items[1][quantity]': '0',
    });
    expect(Object.keys(sent).some((key) => key.endsWith('[deleted]'))).toBe(false);
  });

  it('refuses a change for the renewal while an annual upgrade waits for its payment, before touching Stripe', async () => {
    const fake = createFake();
    const annual = { ...pro, step: 2000, interval: 'year' } as const;
    fake.tables.subscriptions!.push(paidRow(annual));
    fake.stripe['GET /v1/subscriptions/sub_1Test'] = () => ({
      ...stripeSubscription({ choice: annual }),
      pending_update: { expires_at: now() + day },
    });

    const response = await request('PATCH', '/billing/subscription', { ...annual, step: 1500 });

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

    const response = await request('PATCH', '/billing/subscription', { ...start, step: 500 });

    expect(response.status).toBe(200);
    expect(stripeWrites(fake, '/v1/subscriptions/sub_1Test')).toEqual([]);
    expect(stripeWrites(fake, '/v1/subscription_schedules')).toEqual([
      { from_subscription: 'sub_1Test' },
    ]);
    expect(stripeWrites(fake, '/v1/subscription_schedules/sub_sched_1')[0]).toMatchObject({
      end_behavior: 'release',
      'phases[0][end_date]': String(renewal),
      'phases[0][items][0][price]': priceIdOf('profesional_1500_monthly_v2'),
      'phases[1][items][0][price]': priceIdOf('start_500_monthly_v2'),
      'phases[1][items][1][price]': priceIdOf('sms_overage_monthly_v2'),
      'phases[1][items][2][price]': priceIdOf('credits_extra_monthly_v2'),
      'phases[1][proration_behavior]': 'none',
      'phases[1][duration][interval]': 'month',
    });
    expect(row(fake)).toMatchObject({ plan: 'profesional' });
    expect(fake.tables.subscription_changes).toContainEqual(
      expect.objectContaining({ change: 'change_scheduled', source: 'owner' })
    );
  });

  it('changes a plan chosen in the trial before 2026-11-14 at once, with nothing prorated', async () => {
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

  it('drops a plan chosen in the trial before 2026-11-14 at once and returns to the plain trial', async () => {
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
      employee_step: null,
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
      return_url: 'https://app.example.ro/organizatie/abonament',
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

describe('the credits meter', () => {
  const specialist = { user_id: owner.id, role: 'specialist', access: 'full' } as const;
  const meterFake = (credits: Partial<Fake['credits']> = {}) =>
    createFake({
      credits: { granted: 0, used: 0, shortfall: 0, gift_left: 0, extra: 0, ...credits },
      membership: specialist,
    });
  const creditsOf = async () =>
    billingOverviewSchema.parse(await (await request('GET', '/billing')).json()).usage
      .creditsThisMonth;
  const balanceAsked = (fake: Fake) =>
    JSON.parse(
      fake.calls.find((call) => call.url.pathname === '/rest/v1/rpc/credit_balance')!.body!
    ) as Record<string, unknown>;

  it("counts a paid plan's credits on the subscription's month, with the gift and last month's shortfall", async () => {
    const fake = meterFake({ used: 120, granted: 50, shortfall: 4, gift_left: 2500 });
    const anchor = new Date((now() - 3 * day) * 1000).toISOString();
    fake.tables.subscriptions!.push(paidRow(start, { billing_anchor_at: anchor }));

    expect(await creditsOf()).toMatchObject({
      used: 120,
      included: 800,
      allowance: 750,
      granted: 50,
      shortfall: 4,
      left: 676,
      giftLeft: 2500,
      period: 'month',
      periodStart: anchor,
      state: 'ok',
    });
    expect(balanceAsked(fake)).toMatchObject({
      p_organization_id: organizationId,
      p_period_start: anchor,
      p_allowance: 750,
      p_previous_end: anchor,
      p_previous_allowance: 750,
    });
  });

  it("gives each step its own credits a month: 3,250 at Profesional's 1,500", async () => {
    meterFake({ used: 3000 }).tables.subscriptions!.push(paidRow(pro));
    expect(await creditsOf()).toMatchObject({ included: 3250, left: 250, state: 'near' });

    meterFake({ used: 0 }).tables.subscriptions!.push(paidRow({ ...pro, step: 5000 }));
    expect(await creditsOf()).toMatchObject({ included: 10250 });
  });

  it('says negative below zero, which the next month makes up', async () => {
    meterFake({ used: 790 }).tables.subscriptions!.push(paidRow(start));

    expect(await creditsOf()).toMatchObject({ left: -40, giftLeft: 0, state: 'negative' });
  });

  it('says out at zero, and counts the gift as left', async () => {
    meterFake({ used: 750 }).tables.subscriptions!.push(paidRow(start));
    expect(await creditsOf()).toMatchObject({ left: 0, state: 'out' });

    meterFake({ used: 750, gift_left: 40 }).tables.subscriptions!.push(paidRow(start));
    expect(await creditsOf()).toMatchObject({ left: 0, giftLeft: 40, state: 'near' });
  });

  it('keeps a plan chosen during the trial before 2026-11-14 at the trial’s 300 until its first payment', async () => {
    const trialEnd = new Date((now() + 5 * day) * 1000).toISOString();
    const fake = meterFake({ used: 100 });
    fake.tables.subscriptions!.push(
      paidRow(pro, {
        status: 'trialing',
        trial_ends_at: trialEnd,
        access_until: trialEnd,
        first_paid_at: null,
      })
    );

    expect(await creditsOf()).toMatchObject({
      included: 300,
      left: 200,
      period: 'trial',
      periodEnd: trialEnd,
    });
    expect(balanceAsked(fake)).toMatchObject({ p_previous_start: null });
  });

  it("gives a tester's trial Profesional's credits a month and no gift", async () => {
    const fake = meterFake({ used: 12 });
    const trial = subscriptionRow({
      tester_allowances: true,
      created_at: new Date((now() - 40 * day) * 1000).toISOString(),
    });
    fake.tables.subscriptions!.push(trial);

    const credits = await creditsOf();

    expect(credits).toMatchObject({
      included: 1500,
      left: 1488,
      period: 'month',
    });
    expect(new Date(credits.periodStart) > new Date(trial.created_at as string)).toBe(true);
    expect(balanceAsked(fake)).toMatchObject({
      p_previous_start: trial.created_at,
      p_previous_end: credits.periodStart,
      p_previous_allowance: 1500,
    });
  });

  it('sets no limit without a subscription', async () => {
    meterFake({ used: 70 });

    expect(await creditsOf()).toMatchObject({
      used: 70,
      included: null,
      left: null,
      state: 'unlimited',
    });
  });
});

describe('the SMS meter', () => {
  const specialist = { user_id: owner.id, role: 'specialist', access: 'full' } as const;
  const meterFake = (smsUsage: { used: number; overage: number; granted: number }) =>
    createFake({ smsUsage, membership: specialist });
  const smsOf = async () =>
    billingOverviewSchema.parse(await (await request('GET', '/billing')).json()).usage.smsThisMonth;

  it("counts a paid plan's signing codes on the subscription's month, near the allowance from 80 %", async () => {
    const fake = meterFake({ used: 45, overage: 0, granted: 0 });
    const anchor = new Date((now() - 3 * day) * 1000).toISOString();
    fake.tables.subscriptions!.push(paidRow(start, { billing_anchor_at: anchor }));

    const sms = await smsOf();

    expect(sms).toMatchObject({
      used: 45,
      included: 50,
      allowance: 50,
      overage: 0,
      periodStart: anchor,
      state: 'near',
    });
    const counted = fake.calls.find(
      (call) => call.url.pathname === '/rest/v1/rpc/sms_period_usage'
    );
    expect(JSON.parse(counted!.body!)).toMatchObject({
      p_organization_id: organizationId,
      p_period_start: anchor,
    });
  });

  it("gives each step one code for every five employees: 300 at Profesional's 1,500", async () => {
    meterFake({ used: 10, overage: 0, granted: 0 }).tables.subscriptions!.push(paidRow(pro));

    expect(await smsOf()).toMatchObject({ included: 300, allowance: 300 });
  });

  it('stops a paid plan at its allowance, with the codes granted by hand, while extras are off', async () => {
    meterFake({ used: 55, overage: 0, granted: 5 }).tables.subscriptions!.push(paidRow(start));

    expect(await smsOf()).toMatchObject({
      used: 55,
      included: 55,
      overage: 0,
      state: 'stopped',
    });
  });

  it('sends no SMS for a plan chosen during the trial before 2026-11-14 until its first payment', async () => {
    const trialEnd = new Date((now() + 5 * day) * 1000).toISOString();
    meterFake({ used: 0, overage: 0, granted: 0 }).tables.subscriptions!.push(
      paidRow(start, {
        status: 'trialing',
        trial_ends_at: trialEnd,
        access_until: trialEnd,
        first_paid_at: null,
      })
    );

    expect(await smsOf()).toMatchObject({ included: 0, state: 'none' });
  });

  it("gives a tester's trial Profesional's codes with a hard stop", async () => {
    meterFake({ used: 12, overage: 0, granted: 0 }).tables.subscriptions!.push(
      subscriptionRow({ tester_allowances: true })
    );

    expect(await smsOf()).toMatchObject({ used: 12, included: 300, state: 'ok' });
  });

  it('sets no limit without a subscription', async () => {
    meterFake({ used: 7, overage: 0, granted: 0 });

    expect(await smsOf()).toMatchObject({ used: 7, included: null, state: 'ok' });
  });

  it('no longer takes a safety cap from the owner', async () => {
    createFake().tables.subscriptions!.push(paidRow(start));

    expect((await request('PUT', '/billing/sms-cap', { factor: 6 })).status).toBe(404);
  });
});
