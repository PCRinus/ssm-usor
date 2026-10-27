import { cataloguePrices, catalogueProducts } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyPlan,
  assertKeyMatchesEnvironment,
  createStripe,
  planDomain,
  planPortal,
  planPrices,
  planProducts,
  planSetup,
  planTaxRate,
  planWebhook,
  type PortalState,
  type PriceState,
  productId,
  readStripeState,
  stripeApiVersion,
  webhookEvents,
  type WebhookState,
} from './stripe-setup';

const smsMeter = { id: 'mtr_1', eventName: 'sms_overage', status: 'active' };

function matchingPrices(): PriceState[] {
  return cataloguePrices.map((price, index) => ({
    id: `price_${index}`,
    lookupKey: price.lookupKey,
    productId: productId(price.product),
    currency: 'eur',
    unitAmount: price.unitAmount,
    interval: price.interval,
    usage: price.usage,
    meterId: price.usage === 'metered' ? smsMeter.id : null,
    active: true,
  }));
}

const cardOnly = {
  paymentMethodUpdate: true,
  invoiceHistory: false,
  subscriptionCancel: false,
  subscriptionUpdate: false,
  customerUpdate: false,
};

const endpoint: WebhookState = {
  id: 'we_1',
  url: 'https://api.non-prod.ssmusor.ro/billing/stripe-webhook',
  enabledEvents: ['invoice.paid'],
  status: 'enabled',
  apiVersion: stripeApiVersion,
};

describe('the key guard', () => {
  it.each([
    ['sk_test_abc123', 'non-prod'],
    ['rk_test_abc123', 'non-prod'],
    ['sk_live_abc123', 'production'],
    ['rk_live_abc123', 'production'],
  ] as const)('accepts %s for %s', (key, environment) => {
    expect(() => assertKeyMatchesEnvironment(key, environment)).not.toThrow();
  });

  it.each([
    ['sk_live_secret123', 'non-prod'],
    ['rk_test_secret123', 'production'],
    ['pk_test_secret123', 'non-prod'],
    ['whsec_secret123', 'production'],
  ] as const)('refuses %s for %s without repeating the key', (key, environment) => {
    expect(() => assertKeyMatchesEnvironment(key, environment)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secret123') })
    );
  });
});

describe('planning the catalogue', () => {
  it('creates every product and price in an empty account', () => {
    expect(planProducts([])).toHaveLength(catalogueProducts.length);
    expect(planPrices([], [])).toHaveLength(cataloguePrices.length);
  });

  it('changes nothing that already matches', () => {
    const products = catalogueProducts.map((product) => ({
      id: productId(product.key),
      name: product.name,
      active: true,
    }));
    expect(planProducts(products)).toEqual([]);
    expect(planPrices(matchingPrices(), [smsMeter])).toEqual([]);
  });

  it('renames a product whose name changed', () => {
    const products = catalogueProducts.map((product) => ({
      id: productId(product.key),
      name: product.key === 'start' ? 'Start' : product.name,
      active: true,
    }));
    expect(planProducts(products)).toEqual([
      { kind: 'update_product', id: 'ssm_usor_start', name: 'SSM Ușor Start' },
    ]);
  });

  it('stops when a lookup key holds a different amount, since a price never changes', () => {
    const prices = matchingPrices().map((price) =>
      price.lookupKey === 'start_monthly_v1' ? { ...price, unitAmount: 4900 } : price
    );
    expect(() => planPrices(prices, [smsMeter])).toThrow(
      /start_monthly_v1 \(price_0\) has amount 4900/
    );
  });

  it('stops when the SMS price counts another meter', () => {
    expect(() => planPrices(matchingPrices(), [{ ...smsMeter, id: 'mtr_2' }])).toThrow(
      /sms_overage_monthly_v1 .* has meter mtr_1/
    );
  });

  it('reactivates an archived price that still matches', () => {
    const prices = matchingPrices().map((price) =>
      price.lookupKey === 'member_annual_v1' ? { ...price, active: false } : price
    );
    expect(planPrices(prices, [smsMeter])).toEqual([
      { kind: 'activate_price', id: expect.any(String), lookupKey: 'member_annual_v1' },
    ]);
  });
});

describe('planning the tax rate', () => {
  const vat = {
    id: 'txr_1',
    percentage: 21,
    inclusive: false,
    country: 'RO',
    active: true,
    marked: true,
  };

  it('creates it once', () => {
    expect(planTaxRate([{ ...vat, marked: false }])).toEqual([{ kind: 'create_tax_rate' }]);
    expect(planTaxRate([vat])).toEqual([]);
  });

  it('stops when the marked rate is not 21 % added on top', () => {
    expect(() => planTaxRate([{ ...vat, percentage: 19 }])).toThrow(/txr_1 is 19 %/);
    expect(() => planTaxRate([{ ...vat, inclusive: true }])).toThrow(/inclusive/);
  });
});

describe('planning the customer portal', () => {
  const portal: PortalState = { id: 'bpc_1', isDefault: true, marked: false, features: cardOnly };

  it('turns the default configuration to card updates only', () => {
    expect(
      planPortal([{ ...portal, features: { ...cardOnly, subscriptionCancel: true } }])
    ).toEqual({ actions: [{ kind: 'update_portal', id: 'bpc_1' }], warnings: [] });
    expect(planPortal([portal])).toEqual({ actions: [], warnings: [] });
  });

  it('creates one when there is no default, and says it cannot be made the default', () => {
    const { actions, warnings } = planPortal([]);
    expect(actions).toEqual([{ kind: 'create_portal' }]);
    expect(warnings).toEqual([expect.stringContaining('no default')]);
  });
});

describe('planning the payment method domain', () => {
  it('registers the app host once', () => {
    expect(planDomain([], 'https://app.non-prod.ssmusor.ro')).toEqual([
      { kind: 'create_domain', domainName: 'app.non-prod.ssmusor.ro' },
    ]);
    expect(
      planDomain(
        [{ id: 'pmd_1', domainName: 'app.non-prod.ssmusor.ro', enabled: true }],
        'https://app.non-prod.ssmusor.ro'
      )
    ).toEqual([]);
  });
});

describe('planning the webhook endpoint', () => {
  it('never creates the endpoint, and says how to', () => {
    const plan = planWebhook([], 'https://api.non-prod.ssmusor.ro', 'non-prod');
    expect(plan.actions).toEqual([]);
    expect(plan.blockers).toEqual([
      expect.stringContaining('gh secret set STRIPE_WEBHOOK_SECRET --env non-prod'),
    ]);
  });

  it('sets the events of the endpoint at the API URL', () => {
    expect(planWebhook([endpoint], 'https://api.non-prod.ssmusor.ro/', 'non-prod')).toEqual({
      actions: [{ kind: 'update_webhook', id: 'we_1', url: endpoint.url }],
      warnings: [],
      blockers: [],
    });
    const done = { ...endpoint, enabledEvents: [...webhookEvents].reverse() };
    expect(planWebhook([done], 'https://api.non-prod.ssmusor.ro', 'non-prod').actions).toEqual([]);
  });

  it('warns when the endpoint sends events in another API version', () => {
    const old = { ...endpoint, apiVersion: '2025-03-31.basil' };
    expect(planWebhook([old], 'https://api.non-prod.ssmusor.ro', 'non-prod').warnings).toEqual([
      expect.stringContaining('2025-03-31.basil'),
    ]);
  });
});

type Stored = Record<string, unknown> & { id: string };

function fakeStripe(options: { livemode?: boolean; webhooks?: Stored[]; prices?: Stored[] } = {}) {
  const livemode = options.livemode ?? false;
  const collections: Record<string, Stored[]> = {
    '/v1/products': [],
    '/v1/prices': options.prices ?? [],
    '/v1/billing/meters': [],
    '/v1/tax_rates': [],
    '/v1/billing_portal/configurations': [],
    '/v1/payment_method_domains': [],
    '/v1/webhook_endpoints': options.webhooks ?? [],
  };
  const writes: { method: string; path: string; body: URLSearchParams }[] = [];
  let next = 1;

  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (method === 'GET') {
      // Like Stripe, prices list only active ones unless asked otherwise.
      const active =
        url.searchParams.get('active') ?? (url.pathname === '/v1/prices' ? 'true' : null);
      const data = (collections[url.pathname] ?? []).filter(
        (item) =>
          active === null ||
          String((item as { active?: boolean | string }).active ?? true) === active
      );
      return json({ object: 'list', url: url.pathname, has_more: false, data });
    }
    const body = new URLSearchParams(String(init?.body ?? ''));
    writes.push({ method, path: url.pathname, body });
    const collection = collections[url.pathname];
    const created = {
      id: body.get('id') ?? `obj_${next++}`,
      livemode,
      ...Object.fromEntries(body),
    };
    collection?.push(created);
    return json(created);
  }) as typeof fetch;

  return { stripe: createStripe('sk_test_fake', fetchFn), writes, collections };
}

describe('a run against Stripe', () => {
  const webhook = {
    id: 'we_1',
    object: 'webhook_endpoint',
    livemode: false,
    url: 'https://api.non-prod.ssmusor.ro/billing/stripe-webhook',
    enabled_events: ['*'],
    status: 'enabled',
    api_version: stripeApiVersion,
  };
  const options = {
    apiUrl: 'https://api.non-prod.ssmusor.ro',
    appUrl: 'https://app.non-prod.ssmusor.ro',
    environment: 'non-prod' as const,
  };

  it('sets up an empty sandbox with the metered price on the new meter', async () => {
    const { stripe, writes, collections } = fakeStripe({ webhooks: [webhook] });
    const state = await readStripeState(stripe, 'non-prod');
    const plan = planSetup(state, options);
    await applyPlan(stripe, plan, state, () => {});

    const posted = (path: string) => writes.filter((write) => write.path === path);
    expect(posted('/v1/products')).toHaveLength(catalogueProducts.length);
    const meter = posted('/v1/billing/meters');
    expect(meter.map((write) => write.body.get('event_name'))).toEqual(['sms_overage']);

    const prices = posted('/v1/prices');
    expect(prices).toHaveLength(cataloguePrices.length);
    const sms = prices.find((write) => write.body.get('lookup_key') === 'sms_overage_monthly_v1');
    expect(Object.fromEntries(sms!.body)).toMatchObject({
      product: 'ssm_usor_sms_overage',
      unit_amount: '10',
      'recurring[interval]': 'month',
      'recurring[usage_type]': 'metered',
      'recurring[meter]': collections['/v1/billing/meters']![0]!.id,
      tax_behavior: 'exclusive',
    });
    const annual = prices.find((write) => write.body.get('lookup_key') === 'profesional_annual_v1');
    expect(annual!.body.get('unit_amount')).toBe('149000');

    expect(Object.fromEntries(posted('/v1/tax_rates')[0]!.body)).toMatchObject({
      percentage: '21',
      inclusive: 'false',
      country: 'RO',
      display_name: 'TVA',
    });
    expect(Object.fromEntries(posted('/v1/billing_portal/configurations')[0]!.body)).toMatchObject({
      'features[payment_method_update][enabled]': 'true',
      'features[invoice_history][enabled]': 'false',
      'features[subscription_cancel][enabled]': 'false',
      'features[subscription_update][enabled]': 'false',
      'features[customer_update][enabled]': 'false',
    });
    expect(posted('/v1/payment_method_domains')[0]!.body.get('domain_name')).toBe(
      'app.non-prod.ssmusor.ro'
    );
    expect(
      [...posted('/v1/webhook_endpoints/we_1')[0]!.body.entries()]
        .filter(([key]) => key.startsWith('enabled_events'))
        .map(([, value]) => value)
    ).toEqual([...webhookEvents]);
  });

  it('reads archived prices too, so a lookup key held by one is not created again', async () => {
    const archived = {
      id: 'price_archived',
      object: 'price',
      livemode: false,
      active: false,
      lookup_key: 'member_annual_v1',
      product: 'ssm_usor_member',
      currency: 'eur',
      unit_amount: 15000,
      recurring: { interval: 'year', usage_type: 'licensed', meter: null },
    };
    const { stripe } = fakeStripe({ webhooks: [webhook], prices: [archived] });
    const state = await readStripeState(stripe, 'non-prod');

    expect(state.prices.map((price) => price.id)).toEqual(['price_archived']);
  });

  it('refuses live data on non-prod', async () => {
    const { stripe } = fakeStripe({ webhooks: [{ ...webhook, livemode: true }] });
    await expect(readStripeState(stripe, 'non-prod')).rejects.toThrow(/live data/);
  });
});
