import {
  billingCurrency,
  type BillingProductKey,
  type CataloguePrice,
  cataloguePrices,
  catalogueProducts,
  smsOverage,
  vatPercent,
} from '@ssm-usor/contracts';
import Stripe from 'stripe';

export type StripeEnvironment = 'non-prod' | 'production';

// The version stripe@23.0.1 ships. Flexible billing mode, which an annual plan with a monthly
// metered SMS item needs, is the default from 2025-09-30.clover on (ADR 029).
export const stripeApiVersion = '2026-09-30.endive';

export const webhookPath = '/billing/stripe-webhook';

export const webhookEvents = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.upcoming',
] as const satisfies Stripe.WebhookEndpointUpdateParams.EnabledEvent[];

// Marks what this script made, where Stripe offers nothing better to find it by.
export const metadataKey = 'ssm_usor';

export class SetupError extends Error {}

export function createStripe(secretKey: string, fetchFn?: typeof fetch) {
  return new Stripe(secretKey, {
    apiVersion: stripeApiVersion,
    httpClient: Stripe.createFetchHttpClient(fetchFn),
    maxNetworkRetries: 2,
    telemetry: false,
  });
}

// Never echo the key: the error reaches a workflow log.
export function assertKeyMatchesEnvironment(secretKey: string, environment: StripeEnvironment) {
  const mode = /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(secretKey.trim())?.[2];
  if (!mode) throw new SetupError('STRIPE_SECRET_KEY is not a Stripe secret or restricted key.');
  const wanted = environment === 'production' ? 'live' : 'test';
  if (mode !== wanted) {
    throw new SetupError(
      `The ${environment} environment needs a ${wanted} key, and STRIPE_SECRET_KEY is a ${mode} key.`
    );
  }
}

export function assertLivemode(objects: { livemode: boolean }[], environment: StripeEnvironment) {
  const live = environment === 'production';
  if (objects.some((object) => object.livemode !== live)) {
    throw new SetupError(
      `Stripe answered with ${live ? 'test' : 'live'} data for the ${environment} environment.`
    );
  }
}

export function productId(key: BillingProductKey) {
  return `ssm_usor_${key}`;
}

export interface ProductState {
  id: string;
  name: string;
  active: boolean;
}

export interface PriceState {
  id: string;
  lookupKey: string | null;
  productId: string;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  usage: string | null;
  meterId: string | null;
  active: boolean;
}

export interface MeterState {
  id: string;
  eventName: string;
  status: string;
}

export interface TaxRateState {
  id: string;
  percentage: number;
  inclusive: boolean;
  country: string | null;
  active: boolean;
  marked: boolean;
}

export interface PortalFeatures {
  paymentMethodUpdate: boolean;
  invoiceHistory: boolean;
  subscriptionCancel: boolean;
  subscriptionUpdate: boolean;
  customerUpdate: boolean;
}

export interface PortalState {
  id: string;
  isDefault: boolean;
  marked: boolean;
  features: PortalFeatures;
}

export interface DomainState {
  id: string;
  domainName: string;
  enabled: boolean;
}

export interface WebhookState {
  id: string;
  url: string;
  enabledEvents: string[];
  status: string;
  apiVersion: string | null;
}

export interface StripeState {
  products: ProductState[];
  prices: PriceState[];
  meters: MeterState[];
  taxRates: TaxRateState[];
  portals: PortalState[];
  domains: DomainState[];
  webhooks: WebhookState[];
}

export type Action =
  | { kind: 'create_product'; id: string; name: string }
  | { kind: 'update_product'; id: string; name: string }
  | { kind: 'create_meter' }
  | { kind: 'reactivate_meter'; id: string }
  | { kind: 'create_price'; price: CataloguePrice }
  | { kind: 'activate_price'; id: string; lookupKey: string }
  | { kind: 'create_tax_rate' }
  | { kind: 'update_portal'; id: string }
  | { kind: 'create_portal' }
  | { kind: 'create_domain'; domainName: string }
  | { kind: 'enable_domain'; id: string; domainName: string }
  | { kind: 'update_webhook'; id: string; url: string };

export interface SetupPlan {
  actions: Action[];
  warnings: string[];
  // Applied anyway, so a second run after the operator's fix finishes the setup.
  blockers: string[];
}

export function planProducts(products: ProductState[]): Action[] {
  return catalogueProducts.flatMap((wanted): Action[] => {
    const id = productId(wanted.key);
    const found = products.find((product) => product.id === id);
    if (!found) return [{ kind: 'create_product', id, name: wanted.name }];
    if (found.name !== wanted.name || !found.active) {
      return [{ kind: 'update_product', id, name: wanted.name }];
    }
    return [];
  });
}

export function planMeter(meters: MeterState[]): Action[] {
  const found = meters.find((meter) => meter.eventName === smsOverage.meterEventName);
  if (!found) return [{ kind: 'create_meter' }];
  if (found.status !== 'active') return [{ kind: 'reactivate_meter', id: found.id }];
  return [];
}

// A price's amount, currency and interval never change in Stripe; a changed one is a new price
// under a new version (ADR 029), so a mismatch stops the run instead of being "fixed".
export function planPrices(prices: PriceState[], meters: MeterState[]): Action[] {
  const meter = meters.find((candidate) => candidate.eventName === smsOverage.meterEventName);
  const conflicts: string[] = [];
  const actions = cataloguePrices.flatMap((wanted): Action[] => {
    const found = prices.find((price) => price.lookupKey === wanted.lookupKey);
    if (!found) return [{ kind: 'create_price', price: wanted }];
    const differences = [
      found.productId !== productId(wanted.product) && `product ${found.productId}`,
      found.currency !== billingCurrency && `currency ${found.currency}`,
      found.unitAmount !== wanted.unitAmount && `amount ${found.unitAmount}`,
      found.interval !== wanted.interval && `interval ${found.interval}`,
      found.usage !== wanted.usage && `usage ${found.usage}`,
      wanted.usage === 'metered' && found.meterId !== meter?.id && `meter ${found.meterId}`,
    ].filter(Boolean);
    if (differences.length > 0) {
      conflicts.push(`${wanted.lookupKey} (${found.id}) has ${differences.join(', ')}`);
      return [];
    }
    return found.active
      ? []
      : [{ kind: 'activate_price', id: found.id, lookupKey: wanted.lookupKey }];
  });
  if (conflicts.length > 0) {
    throw new SetupError(
      [
        'These Stripe prices differ from the plan catalogue. A price never changes: give the',
        'changed price a new version in packages/contracts (a new lookup key) instead.',
        ...conflicts.map((conflict) => `  ${conflict}`),
      ].join('\n')
    );
  }
  return actions;
}

export function planTaxRate(taxRates: TaxRateState[]): Action[] {
  const found = taxRates.find((rate) => rate.marked && rate.active);
  if (!found) return [{ kind: 'create_tax_rate' }];
  if (found.percentage !== vatPercent || found.inclusive || found.country !== 'RO') {
    throw new SetupError(
      `Tax rate ${found.id} is ${found.percentage} %${found.inclusive ? ' inclusive' : ''} in ${found.country}, not ${vatPercent} % added on top in RO. Tax rates cannot change: archive it in the dashboard and run this again.`
    );
  }
  return [];
}

export const portalFeatures: PortalFeatures = {
  paymentMethodUpdate: true,
  invoiceHistory: false,
  subscriptionCancel: false,
  subscriptionUpdate: false,
  customerUpdate: false,
};

function samePortalFeatures(features: PortalFeatures) {
  return (Object.keys(portalFeatures) as (keyof PortalFeatures)[]).every(
    (key) => features[key] === portalFeatures[key]
  );
}

// The API cannot make a configuration the default; the dashboard makes one the first time its
// portal settings are saved, and from then on this script keeps that one.
export function planPortal(portals: PortalState[]): { actions: Action[]; warnings: string[] } {
  const found =
    portals.find((portal) => portal.isDefault) ?? portals.find((portal) => portal.marked);
  const warnings = found?.isDefault
    ? []
    : [
        'The account has no default customer portal configuration, so a portal session must name this one. Saving the portal settings once in the dashboard creates the default; run this again then.',
      ];
  if (!found) return { actions: [{ kind: 'create_portal' }], warnings };
  return {
    actions: samePortalFeatures(found.features) ? [] : [{ kind: 'update_portal', id: found.id }],
    warnings,
  };
}

export function planDomain(domains: DomainState[], appUrl: string): Action[] {
  const domainName = new URL(appUrl).hostname;
  const found = domains.find((domain) => domain.domainName === domainName);
  if (!found) return [{ kind: 'create_domain', domainName }];
  return found.enabled ? [] : [{ kind: 'enable_domain', id: found.id, domainName }];
}

export function webhookUrl(apiUrl: string) {
  return `${apiUrl.replace(/\/+$/, '')}${webhookPath}`;
}

export function planWebhook(
  webhooks: WebhookState[],
  apiUrl: string,
  environment: StripeEnvironment
): SetupPlan {
  const url = webhookUrl(apiUrl);
  const found = webhooks.find((webhook) => webhook.url.replace(/\/+$/, '') === url);
  if (!found) {
    return {
      actions: [],
      warnings: [],
      blockers: [
        `No webhook endpoint for ${url}. Create it in the Stripe dashboard (Developers → Webhooks, API version ${stripeApiVersion}, any one event), store its signing secret with \`gh secret set STRIPE_WEBHOOK_SECRET --env ${environment}\`, and run this again to set its events. Stripe shows the secret only when the endpoint is created.`,
      ],
    };
  }
  const warnings = [
    found.status !== 'enabled' && `The webhook endpoint ${found.id} is ${found.status}.`,
    found.apiVersion !== stripeApiVersion &&
      `The webhook endpoint ${found.id} sends events in API version ${found.apiVersion ?? "the account's default"}, not ${stripeApiVersion}; the API version of an endpoint cannot be changed, so make a new endpoint and secret.`,
  ].filter((warning): warning is string => Boolean(warning));
  const same =
    found.enabledEvents.length === webhookEvents.length &&
    webhookEvents.every((event) => found.enabledEvents.includes(event));
  return {
    actions: same ? [] : [{ kind: 'update_webhook', id: found.id, url }],
    warnings,
    blockers: [],
  };
}

export function planSetup(
  state: StripeState,
  options: { apiUrl: string; appUrl: string; environment: StripeEnvironment }
): SetupPlan {
  const portal = planPortal(state.portals);
  const webhook = planWebhook(state.webhooks, options.apiUrl, options.environment);
  return {
    actions: [
      ...planProducts(state.products),
      ...planMeter(state.meters),
      ...planPrices(state.prices, state.meters),
      ...planTaxRate(state.taxRates),
      ...portal.actions,
      ...planDomain(state.domains, options.appUrl),
      ...webhook.actions,
    ],
    warnings: [...portal.warnings, ...webhook.warnings],
    blockers: webhook.blockers,
  };
}

export function describeAction(action: Action): string {
  switch (action.kind) {
    case 'create_product':
      return `create product ${action.id} "${action.name}"`;
    case 'update_product':
      return `rename or reactivate product ${action.id} as "${action.name}"`;
    case 'create_meter':
      return `create billing meter ${smsOverage.meterEventName}`;
    case 'reactivate_meter':
      return `reactivate billing meter ${action.id}`;
    case 'create_price': {
      const { price } = action;
      return `create price ${price.lookupKey}: ${(price.unitAmount / 100).toFixed(2)} ${billingCurrency} per ${price.interval}${price.usage === 'metered' ? ', metered' : ''}`;
    }
    case 'activate_price':
      return `reactivate price ${action.lookupKey} (${action.id})`;
    case 'create_tax_rate':
      return `create tax rate TVA ${vatPercent} %, added to the price, RO`;
    case 'update_portal':
      return `set customer portal ${action.id} to card updates only`;
    case 'create_portal':
      return 'create a customer portal configuration with card updates only';
    case 'create_domain':
      return `register payment method domain ${action.domainName}`;
    case 'enable_domain':
      return `enable payment method domain ${action.domainName} (${action.id})`;
    case 'update_webhook':
      return `set the events of webhook endpoint ${action.id} (${action.url}) to ${webhookEvents.join(', ')}`;
  }
}

function idOf(value: string | { id: string }) {
  return typeof value === 'string' ? value : value.id;
}

export async function readStripeState(
  stripe: Stripe,
  environment: StripeEnvironment
): Promise<StripeState> {
  const limit = { limit: 10_000 };
  const [products, prices, meters, taxRates, portals, domains, webhooks] = await Promise.all([
    stripe.products.list({ limit: 100 }).autoPagingToArray(limit),
    stripe.prices.list({ limit: 100 }).autoPagingToArray(limit),
    stripe.billing.meters.list({ limit: 100 }).autoPagingToArray(limit),
    stripe.taxRates.list({ limit: 100 }).autoPagingToArray(limit),
    stripe.billingPortal.configurations.list({ limit: 100 }).autoPagingToArray(limit),
    stripe.paymentMethodDomains.list({ limit: 100 }).autoPagingToArray(limit),
    stripe.webhookEndpoints.list({ limit: 100 }).autoPagingToArray(limit),
  ]);
  assertLivemode(
    [...products, ...prices, ...meters, ...taxRates, ...portals, ...domains, ...webhooks],
    environment
  );
  return {
    products: products.map(({ id, name, active }) => ({ id, name, active })),
    prices: prices.map((price) => ({
      id: price.id,
      lookupKey: price.lookup_key,
      productId: idOf(price.product),
      currency: price.currency,
      unitAmount: price.unit_amount,
      interval: price.recurring?.interval ?? null,
      usage: price.recurring?.usage_type ?? null,
      meterId: price.recurring?.meter ?? null,
      active: price.active,
    })),
    meters: meters.map(({ id, event_name, status }) => ({ id, eventName: event_name, status })),
    taxRates: taxRates.map((rate) => ({
      id: rate.id,
      percentage: rate.percentage,
      inclusive: rate.inclusive,
      country: rate.country,
      active: rate.active,
      marked: rate.metadata?.[metadataKey] === 'vat',
    })),
    portals: portals.map((portal) => ({
      id: portal.id,
      isDefault: portal.is_default,
      marked: portal.metadata?.[metadataKey] === 'portal',
      features: {
        paymentMethodUpdate: portal.features.payment_method_update.enabled,
        invoiceHistory: portal.features.invoice_history.enabled,
        subscriptionCancel: portal.features.subscription_cancel.enabled,
        subscriptionUpdate: portal.features.subscription_update.enabled,
        customerUpdate: portal.features.customer_update.enabled,
      },
    })),
    domains: domains.map(({ id, domain_name, enabled }) => ({
      id,
      domainName: domain_name,
      enabled,
    })),
    webhooks: webhooks.map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      enabledEvents: webhook.enabled_events,
      status: webhook.status,
      apiVersion: webhook.api_version,
    })),
  };
}

const portalParams = {
  features: {
    payment_method_update: { enabled: portalFeatures.paymentMethodUpdate },
    invoice_history: { enabled: portalFeatures.invoiceHistory },
    subscription_cancel: { enabled: portalFeatures.subscriptionCancel },
    subscription_update: { enabled: portalFeatures.subscriptionUpdate },
    customer_update: { enabled: portalFeatures.customerUpdate },
  },
} satisfies Stripe.BillingPortal.ConfigurationUpdateParams;

export async function applyAction(
  stripe: Stripe,
  action: Action,
  context: { meterId?: string }
): Promise<void> {
  switch (action.kind) {
    case 'create_product':
      await stripe.products.create({
        id: action.id,
        name: action.name,
        metadata: { [metadataKey]: action.id },
      });
      return;
    case 'update_product':
      await stripe.products.update(action.id, { name: action.name, active: true });
      return;
    case 'create_meter': {
      const meter = await stripe.billing.meters.create({
        display_name: smsOverage.name,
        event_name: smsOverage.meterEventName,
        default_aggregation: { formula: 'sum' },
      });
      context.meterId = meter.id;
      return;
    }
    case 'reactivate_meter':
      await stripe.billing.meters.reactivate(action.id);
      context.meterId = action.id;
      return;
    case 'create_price': {
      const { price } = action;
      if (price.usage === 'metered' && !context.meterId) {
        throw new SetupError(`No meter ${smsOverage.meterEventName} for ${price.lookupKey}.`);
      }
      await stripe.prices.create({
        product: productId(price.product),
        currency: billingCurrency,
        unit_amount: price.unitAmount,
        lookup_key: price.lookupKey,
        tax_behavior: 'exclusive',
        recurring: {
          interval: price.interval,
          usage_type: price.usage,
          ...(price.usage === 'metered' ? { meter: context.meterId } : {}),
        },
        metadata: { [metadataKey]: price.lookupKey },
      });
      return;
    }
    case 'activate_price':
      await stripe.prices.update(action.id, { active: true });
      return;
    case 'create_tax_rate':
      await stripe.taxRates.create({
        display_name: 'TVA',
        percentage: vatPercent,
        inclusive: false,
        country: 'RO',
        tax_type: 'vat',
        description: `TVA ${vatPercent} %`,
        metadata: { [metadataKey]: 'vat' },
      });
      return;
    case 'update_portal':
      await stripe.billingPortal.configurations.update(action.id, portalParams);
      return;
    case 'create_portal':
      await stripe.billingPortal.configurations.create({
        ...portalParams,
        name: 'SSM Ușor: doar cardul',
        metadata: { [metadataKey]: 'portal' },
      });
      return;
    case 'create_domain':
      await stripe.paymentMethodDomains.create({ domain_name: action.domainName, enabled: true });
      return;
    case 'enable_domain':
      await stripe.paymentMethodDomains.update(action.id, { enabled: true });
      return;
    case 'update_webhook':
      await stripe.webhookEndpoints.update(action.id, { enabled_events: [...webhookEvents] });
      return;
  }
}

export async function applyPlan(
  stripe: Stripe,
  plan: SetupPlan,
  state: StripeState,
  log: (line: string) => void
) {
  const context = {
    meterId: state.meters.find((meter) => meter.eventName === smsOverage.meterEventName)?.id,
  };
  for (const action of plan.actions) {
    await applyAction(stripe, action, context);
    log(`done: ${describeAction(action)}`);
  }
}
