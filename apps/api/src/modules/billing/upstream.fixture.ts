import { type BillingChoice, cataloguePrices, meteredProducts } from '@ssm-usor/contracts';
import { vi } from 'vitest';

import type { ApiEnv } from '../../lib/env';
import { choiceLines } from './rules';
import { createStripe } from './stripe';

export const owner = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
export const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
export const accountId = 'acct_1TestAccount';
export const webhookSecret = 'whsec_test_secret';

export const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  CORS_ORIGINS: 'https://app.example.ro',
  APP_ORIGIN: 'https://app.example.ro',
  STRIPE_SECRET_KEY: 'sk_test_fake_key',
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  OBLIO_CLIENT_ID: 'facturi@example.ro',
  OBLIO_CLIENT_SECRET: 'oblio-secret',
  OBLIO_DOCUMENTS: 'invoice',
};

export const fetchMock = vi.fn<typeof fetch>();

type Row = Record<string, unknown>;

export type Call = {
  method: string;
  url: URL;
  body: string | null;
  idempotencyKey: string | null;
};

export type StripeRoute = (call: Call & { form: URLSearchParams }) => unknown;

export type Fake = {
  tables: Record<string, Row[]>;
  employees: number;
  membership: { user_id: string; role: 'owner' | 'specialist'; access: 'full' | 'read_only' };
  stripe: Record<string, StripeRoute>;
  oblio: Record<string, (call: Call) => unknown>;
  discord: (call: Call) => Response | Promise<Response>;
  calls: Call[];
  uploads: { path: string; bytes: number }[];
  smsUsage: { used: number; overage: number; granted: number };
  employeesOverStep: Row | null;
  credits: {
    granted: number;
    used: number;
    shortfall: number;
    gift_left: number;
    extra: number;
    extra_left?: number;
  };
};

export const priceIdOf = (lookupKey: string) => `price_${lookupKey}`;

export function stripePrice(lookupKey: string) {
  const price = cataloguePrices.find((candidate) => candidate.lookupKey === lookupKey);
  return {
    id: priceIdOf(lookupKey),
    object: 'price',
    lookup_key: lookupKey,
    active: true,
    unit_amount: price?.unitAmount ?? 1500,
    recurring: {
      interval: price?.interval ?? (lookupKey.includes('_annual_') ? 'year' : 'month'),
      usage_type: price?.usage ?? 'licensed',
    },
  };
}

const day = 86_400;

export function stripeSubscription(options: {
  id?: string;
  status?: string;
  choice: BillingChoice;
  periodEnd?: number;
  trialEnd?: number | null;
  startDate?: number;
  anchor?: number | null;
  cancelAt?: number | null;
  endedAt?: number | null;
  schedule?: unknown;
  latestInvoice?: unknown;
  pendingSetupIntent?: unknown;
  metadata?: Record<string, string>;
  lines?: { lookupKey: string; quantity: number | undefined }[];
}) {
  const periodEnd = options.periodEnd ?? Math.floor(Date.now() / 1000) + 20 * day;
  const lines = options.lines ?? [
    ...choiceLines(options.choice),
    ...meteredProducts.map((product) => ({
      lookupKey: product.price.lookupKey,
      quantity: undefined,
    })),
  ];
  return {
    id: options.id ?? 'sub_1Test',
    object: 'subscription',
    status: options.status ?? 'active',
    customer: 'cus_1Test',
    livemode: false,
    metadata: options.metadata ?? { organization_id: organizationId },
    trial_end: options.trialEnd ?? null,
    start_date: options.startDate ?? periodEnd - 30 * day,
    billing_cycle_anchor: options.anchor ?? null,
    cancel_at: options.cancelAt ?? null,
    cancel_at_period_end: false,
    canceled_at: options.endedAt ?? null,
    ended_at: options.endedAt ?? null,
    schedule: options.schedule ?? null,
    default_payment_method: null,
    latest_invoice: options.latestInvoice ?? null,
    pending_setup_intent: options.pendingSetupIntent ?? null,
    items: {
      object: 'list',
      has_more: false,
      data: lines.map((line, index) => ({
        id: `si_${index}`,
        object: 'subscription_item',
        price: stripePrice(line.lookupKey),
        quantity: line.quantity,
        current_period_end: periodEnd,
        current_period_start: periodEnd - 30 * day,
      })),
    },
  };
}

export function stripeList(data: unknown[]) {
  return { object: 'list', has_more: false, url: '/v1/x', data };
}

export function subscriptionRow(overrides: Row = {}): Row {
  return {
    organization_id: organizationId,
    plan: 'profesional',
    status: 'trialing',
    trial_ends_at: new Date(Date.now() + 20 * day * 1000).toISOString(),
    access_until: new Date(Date.now() + 20 * day * 1000).toISOString(),
    created_at: new Date(Date.now() - 10 * day * 1000).toISOString(),
    tester_allowances: false,
    first_paid_at: null,
    billing_anchor_at: null,
    stripe_account: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    billing_interval: null,
    price_version: null,
    employee_step: null,
    invoice_email: null,
    current_period_end: null,
    ...overrides,
  };
}

export function paidRow(choice: BillingChoice, overrides: Row = {}): Row {
  return subscriptionRow({
    plan: choice.plan,
    status: 'active',
    access_until: null,
    stripe_account: accountId,
    stripe_customer_id: 'cus_1Test',
    stripe_subscription_id: 'sub_1Test',
    billing_interval: choice.interval,
    price_version: 'v2',
    trial_ends_at: new Date(Date.now() - 40 * day * 1000).toISOString(),
    first_paid_at: new Date(Date.now() - 40 * day * 1000).toISOString(),
    employee_step: choice.step,
    ...overrides,
  });
}

function matches(row: Row, url: URL) {
  for (const [key, value] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(key) || key.includes('.')) {
      continue;
    }
    if (value === 'is.null' && row[key] !== null && row[key] !== undefined) return false;
    if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
    if (value.startsWith('cs.')) {
      const contained = JSON.parse(value.slice(3)) as Row;
      const held = (row[key] ?? {}) as Row;
      if (Object.entries(contained).some(([field, wanted]) => held[field] !== wanted)) {
        return false;
      }
    }
  }
  return true;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let changeIds = 0;

function database(fake: Fake, call: Call, headers: Headers) {
  const table = call.url.pathname.replace('/rest/v1/', '');
  const rows = (fake.tables[table] ??= []);
  const one = headers.get('Accept')?.includes('vnd.pgrst.object');
  const answer = (result: Row[], status = 200) => json(one ? (result[0] ?? null) : result, status);

  if (call.method === 'HEAD') {
    const count =
      table === 'employees' ? fake.employees : rows.filter((r) => matches(r, call.url)).length;
    return new Response(null, { headers: { 'content-range': `*/${count}` } });
  }
  if (call.method === 'GET') {
    let found = rows.filter((row) => matches(row, call.url));
    const limit = call.url.searchParams.get('limit');
    if (limit) found = found.slice(0, Number(limit));
    return answer(found);
  }
  if (call.method === 'POST') {
    const body = JSON.parse(call.body ?? '{}') as Row | Row[];
    const added = (Array.isArray(body) ? body : [body]).map((row): Row => ({
      created_at: new Date().toISOString(),
      ...row,
    }));
    if (table === 'usage_extras') {
      for (const row of added) {
        const at = rows.findIndex(
          (existing) =>
            existing.organization_id === row.organization_id && existing.kind === row.kind
        );
        if (at >= 0) rows.splice(at, 1);
      }
    }
    for (const row of added) {
      const key =
        table === 'stripe_events'
          ? 'id'
          : table === 'billing_invoices'
            ? 'stripe_invoice_id'
            : null;
      if (key && rows.some((existing) => existing[key] === row[key])) {
        return json({ code: '23505', message: 'duplicate key', details: null, hint: null }, 409);
      }
      if (table === 'subscription_changes' && row.change === 'operator_alerted') {
        const alertKey = (row.details as Row).alert_key;
        if (
          rows.some(
            (existing) =>
              existing.change === 'operator_alerted' &&
              (existing.details as Row).alert_key === alertKey
          )
        ) {
          return json({ code: '23505', message: 'duplicate key', details: null, hint: null }, 409);
        }
      }
    }
    if (table === 'subscription_changes') {
      for (const row of added) row.id ??= ++changeIds;
    }
    rows.push(...added);
    if (!call.url.searchParams.has('select')) return new Response(null, { status: 201 });
    return answer(added, 201);
  }
  if (call.method === 'PATCH') {
    const changes = JSON.parse(call.body ?? '{}') as Row;
    const found = rows.filter((row) => matches(row, call.url));
    for (const row of found) Object.assign(row, changes);
    if (!call.url.searchParams.has('select')) return new Response(null, { status: 204 });
    return answer(found);
  }
  if (call.method === 'DELETE') {
    const found = rows.filter((row) => matches(row, call.url));
    fake.tables[table] = rows.filter((row) => !found.includes(row));
    if (!call.url.searchParams.has('select')) return new Response(null, { status: 204 });
    return answer(found);
  }
  throw new Error(`Unexpected database request: ${call.method} ${call.url}`);
}

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

export function createFake(overrides: Partial<Fake> = {}): Fake {
  const fake: Fake = {
    tables: {
      subscriptions: [],
      subscription_changes: [],
      stripe_events: [],
      billing_invoices: [],
      organizations: [
        {
          id: organizationId,
          legal_name: 'Prevenție Activă SRL',
          cui: '12345678',
          trade_register_number: 'J12/345/2020',
          county_code: 'CJ',
          locality: 'Cluj-Napoca',
          address_line: 'Str. Memorandumului nr. 1',
          vat_payer: true,
        },
      ],
      organization_members: [{ organization_id: organizationId, user_id: owner.id, role: 'owner' }],
    },
    employees: 120,
    membership: { user_id: owner.id, role: 'owner', access: 'full' },
    stripe: {},
    oblio: {},
    discord: () => new Response(null, { status: 204 }),
    calls: [],
    uploads: [],
    smsUsage: { used: 0, overage: 0, granted: 0 },
    employeesOverStep: null,
    credits: { granted: 0, used: 0, shortfall: 0, gift_left: 0, extra: 0 },
    ...overrides,
  };

  const stripeDefaults: Record<string, StripeRoute> = {
    'GET /v1/account': () => ({ id: accountId, object: 'account' }),
    'GET /v1/prices': () =>
      stripeList(cataloguePrices.map((price) => stripePrice(price.lookupKey))),
    'GET /v1/tax_rates': () =>
      stripeList([{ id: 'txr_vat', object: 'tax_rate', metadata: { ssm_usor: 'vat' } }]),
    'GET /v1/billing_portal/configurations': () =>
      stripeList([
        {
          id: 'bpc_card',
          object: 'billing_portal.configuration',
          is_default: true,
          metadata: { ssm_usor: 'portal' },
        },
      ]),
  };

  const oblioDefaults: Record<string, (call: Call) => unknown> = {
    'POST /api/authorize/token': () => ({ access_token: 'oblio-token', expires_in: 3600 }),
    'GET /api/nomenclature/companies': () => ({
      status: 200,
      data: [{ cif: 'RO99999999', company: 'Casapu Mircea-Adrian PFA' }],
    }),
    'POST /api/docs/invoice': () => ({
      status: 200,
      data: {
        seriesName: 'SSMUSOR',
        number: '0001',
        link: 'https://www.oblio.eu/utils/show_file/?ic=1&id=1',
      },
    }),
    'POST /api/docs/proforma': () => ({
      status: 200,
      data: {
        seriesName: 'TEST',
        number: '0007',
        link: 'https://www.oblio.eu/utils/show_file/?ic=1&id=7',
      },
    }),
    'PUT /api/docs/proforma/cancel': () => ({ status: 200, data: {} }),
    'GET /api/docs/invoice/list': (call) => listedDocument(fake, 'invoice', call),
    'GET /api/docs/proforma/list': (call) => listedDocument(fake, 'proforma', call),
  };

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body =
      typeof init?.body === 'string'
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : null;
    const call: Call = { method, url, body, idempotencyKey: headers.get('Idempotency-Key') };
    fake.calls.push(call);

    if (url.host === 'api.stripe.com') {
      const key = `${method} ${url.pathname}`;
      const route =
        fake.stripe[key] ??
        stripeDefaults[key] ??
        Object.entries(fake.stripe).find(([pattern]) => new RegExp(`^${pattern}$`).test(key))?.[1];
      if (!route) throw new Error(`Unexpected Stripe request: ${key}`);
      const form = new URLSearchParams(method === 'GET' ? url.search : (body ?? ''));
      const result = await route({ ...call, form });
      return result instanceof Response ? result : json(result);
    }

    if (url.host === discordHost) return fake.discord(call);

    if (url.host === 'www.oblio.eu') {
      if (url.pathname.startsWith('/utils/show_file')) {
        return new Response(pdfBytes, { headers: { 'content-type': 'application/pdf' } });
      }
      const key = `${method} ${url.pathname}`;
      const route = fake.oblio[key] ?? oblioDefaults[key];
      if (!route) throw new Error(`Unexpected Oblio request: ${key}`);
      const result = await route(call);
      return result instanceof Response ? result : json(result);
    }

    if (url.pathname === '/auth/v1/user') return json({ ...owner, is_anonymous: false });
    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      return json({ id: url.pathname.split('/').pop(), email: owner.email });
    }
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return json([{ ...fake.membership, organization_id: organizationId }]);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/billing-invoices/')) {
      const path = url.pathname.replace('/storage/v1/object/sign/billing-invoices/', '');
      return json({ signedURL: `/object/sign/billing-invoices/${path}?token=signed` });
    }
    if (url.pathname.startsWith('/storage/v1/object/billing-invoices/')) {
      const path = url.pathname.replace('/storage/v1/object/billing-invoices/', '');
      fake.uploads.push({ path, bytes: 0 });
      return json({ Key: `billing-invoices/${path}` });
    }
    if (url.pathname === '/rest/v1/rpc/sms_period_usage') return json(fake.smsUsage);
    if (url.pathname === '/rest/v1/rpc/employees_over_step') return json(fake.employeesOverStep);
    if (url.pathname === '/rest/v1/rpc/credit_balance') {
      const { p_allowance } = JSON.parse(body ?? '{}') as { p_allowance: number | null };
      const { granted, used, shortfall } = fake.credits;
      return json({
        extra_left: 0,
        ...fake.credits,
        balance: p_allowance === null ? null : p_allowance + granted - used - shortfall,
      });
    }
    if (url.pathname.startsWith('/rest/v1/')) return database(fake, call, headers);
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
  return fake;
}

type PostedProduct = { price: number; quantity: number; vatIncluded: 0 | 1; vatPercentage: number };

const roundCents = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

// Oblio's arithmetic as its documents show it: a line's value, then its VAT rounded to the cent.
export function oblioTotalCents(products: PostedProduct[]) {
  return products.reduce((total, product) => {
    const value = roundCents(product.price * product.quantity * 100);
    if (product.vatIncluded) return total + value;
    return total + value + roundCents((value * product.vatPercentage) / 100);
  }, 0);
}

function listedDocument(fake: Fake, kind: 'invoice' | 'proforma', call: Call) {
  const posted = oblioWrites(fake, `/api/docs/${kind}`).at(-1);
  const products = (posted?.products ?? []) as PostedProduct[];
  return {
    status: 200,
    data: [
      {
        seriesName: call.url.searchParams.get('seriesName'),
        number: call.url.searchParams.get('number'),
        total: (oblioTotalCents(products) / 100).toFixed(4),
      },
    ],
  };
}

export const discordHost = 'discord.example';
export const billingWebhook = `https://${discordHost}/api/webhooks/2/token`;

export const discordPosts = (fake: Fake) =>
  fake.calls
    .filter((call) => call.url.host === discordHost)
    .map((call) => (JSON.parse(call.body ?? '{}') as { content: string }).content);

export const stripeWrites = (fake: Fake, path: string) =>
  fake.calls
    .filter(
      (call) =>
        call.url.host === 'api.stripe.com' && call.method === 'POST' && call.url.pathname === path
    )
    .map((call) => Object.fromEntries(new URLSearchParams(call.body ?? '')));

export const oblioWrites = (fake: Fake, path: string) =>
  fake.calls
    .filter(
      (call) =>
        call.url.host === 'www.oblio.eu' && call.url.pathname === path && call.method !== 'GET'
    )
    .map((call) => JSON.parse(call.body ?? '{}') as Record<string, unknown>);

export async function signedEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify({
    object: 'event',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    ...event,
  });
  const signature = createStripe('sk_test_fake_key').webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  return { payload, signature };
}
