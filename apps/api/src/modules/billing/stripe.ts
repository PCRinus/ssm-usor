import Stripe from 'stripe';

import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';

// The version stripe@23.0.1 ships. Flexible billing mode, which an annual plan with a monthly
// metered SMS item needs, is the default from 2025-09-30.clover on (ADR 029).
export const stripeApiVersion = '2026-09-30.endive';

// Marks what the setup script made, where Stripe offers nothing better to find it by.
export const metadataKey = 'ssm_usor';

export function createStripe(secretKey: string, fetchFn?: typeof fetch) {
  return new Stripe(secretKey, {
    apiVersion: stripeApiVersion,
    httpClient: Stripe.createFetchHttpClient(fetchFn),
    maxNetworkRetries: 2,
    telemetry: false,
  });
}

export type StripeAccess = {
  stripe: Stripe;
  secretKey: string;
  livemode: boolean;
};

const notConfigured = () =>
  new ApiError('service_unavailable', 'Payments are not configured.', undefined, 'stripe_unset');

export function stripeFor(env: ApiEnv['Bindings']): StripeAccess {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw notConfigured();
  return {
    stripe: createStripe(secretKey),
    secretKey,
    livemode: /^(sk|rk)_live_/.test(secretKey),
  };
}

export class WebhookRefused extends Error {}

// Events carry `account` only through a Connect endpoint, which we never set up: one that does
// came from somewhere else, as does one of the other mode.
export async function verifyWebhook(
  env: ApiEnv['Bindings'],
  payload: string,
  signature: string | undefined
): Promise<{ event: Stripe.Event; access: StripeAccess }> {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw notConfigured();
  const access = stripeFor(env);
  if (!signature) throw new WebhookRefused('The request carries no Stripe signature.');
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch {
    throw new WebhookRefused('The Stripe signature does not match.');
  }
  if (event.livemode !== access.livemode) {
    throw new WebhookRefused(`A ${event.livemode ? 'live' : 'test'} event reached this API.`);
  }
  if ((event as { account?: string }).account) {
    throw new WebhookRefused('The event belongs to a connected account.');
  }
  return { event, access };
}

export type StripeCatalogue = {
  accountId: string;
  taxRateId: string;
  // The configuration that offers the card alone; null leaves it to the account's default.
  portalConfigurationId: string | null;
  priceIds: Map<string, string>;
  lookupKeys: Map<string, string>;
};

const catalogueLifetimeMs = 10 * 60_000;
const catalogues = new Map<string, { at: number; value: Promise<StripeCatalogue> }>();

async function readCatalogue(stripe: Stripe): Promise<StripeCatalogue> {
  const [account, prices, taxRates, portals] = await Promise.all([
    stripe.accounts.retrieveCurrent(),
    stripe.prices.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 }),
    stripe.taxRates.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 }),
    stripe.billingPortal.configurations
      .list({ active: true, limit: 100 })
      .autoPagingToArray({ limit: 1000 }),
  ]);
  const taxRate = taxRates.find((rate) => rate.metadata?.[metadataKey] === 'vat');
  if (!taxRate) {
    throw new ApiError(
      'service_unavailable',
      'Stripe has no VAT rate from the setup script; run stripe:setup.',
      undefined,
      'stripe_not_set_up'
    );
  }
  const portal =
    portals.find((configuration) => configuration.metadata?.[metadataKey] === 'portal') ??
    portals.find((configuration) => configuration.is_default);
  const priceIds = new Map<string, string>();
  const lookupKeys = new Map<string, string>();
  for (const price of prices) {
    if (!price.lookup_key) continue;
    priceIds.set(price.lookup_key, price.id);
    lookupKeys.set(price.id, price.lookup_key);
  }
  return {
    accountId: account.id,
    taxRateId: taxRate.id,
    portalConfigurationId: portal?.id ?? null,
    priceIds,
    lookupKeys,
  };
}

// The prices, the tax rate and the account change only with the setup script, so an isolate
// reads them once in a while instead of on every request.
export function stripeCatalogue(access: StripeAccess, now = Date.now()): Promise<StripeCatalogue> {
  const cached = catalogues.get(access.secretKey);
  if (cached && now - cached.at < catalogueLifetimeMs) return cached.value;
  const value = readCatalogue(access.stripe);
  catalogues.set(access.secretKey, { at: now, value });
  value.catch(() => catalogues.delete(access.secretKey));
  return value;
}

export function priceId(catalogue: StripeCatalogue, lookupKey: string) {
  const id = catalogue.priceIds.get(lookupKey);
  if (!id) {
    throw new ApiError(
      'service_unavailable',
      `Stripe has no active price ${lookupKey}; run stripe:setup.`,
      undefined,
      'stripe_not_set_up'
    );
  }
  return id;
}

export const isStripeError = (error: unknown): error is Stripe.errors.StripeError =>
  error instanceof Stripe.errors.StripeError;

export function fromStripeError(error: Error): Error {
  if (!isStripeError(error)) return error;
  if (error.type === 'StripeCardError') {
    return new ApiError('unprocessable', error.message, undefined, 'card_declined');
  }
  console.error(`Stripe refused a request: ${error.type} ${error.code ?? ''} ${error.message}`);
  if (error.type === 'StripeInvalidRequestError') {
    return new ApiError(
      'unprocessable',
      'Stripe refused the request.',
      undefined,
      'stripe_refused'
    );
  }
  return new ApiError(
    'service_unavailable',
    'Payments are temporarily unavailable.',
    undefined,
    'stripe_unavailable'
  );
}

export function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}
