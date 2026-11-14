import type { RouteHandler } from '@hono/zod-openapi';
import {
  type BillingCreditsUsage,
  type BillingExtra,
  type BillingExtras,
  type BillingSmsUsage,
  creditsExtra,
  type ExtraKind,
} from '@ssm-usor/contracts';
import type Stripe from 'stripe';

import { createAdminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { loadSubscription, recordChange } from '../billing/store';
import { priceId, stripeCatalogue, stripeFor } from '../billing/stripe';
import { creditsStore } from '../credits/store';
import { creditsUsageOf } from '../credits/usage';
import { smsUsageStore } from '../sms-usage/store';
import { smsUsageOf } from '../sms-usage/usage';
import { extraSpend, extrasUnavailable } from './policy';
import type { setExtraRoute } from './routes';
import { type Ceilings, extrasStore } from './store';

const hidden: Omit<BillingExtra, 'enabled'> = {
  ceilingCents: null,
  limit: null,
  used: null,
  spentCents: null,
};

/** The other members see whether each kind is on, and nothing of the ceilings or the amounts. */
export function extrasView(input: {
  row: Parameters<typeof extrasUnavailable>[0];
  ceilings: Ceilings;
  sms: Pick<BillingSmsUsage, 'overage'>;
  credits: Pick<BillingCreditsUsage, 'extra'>;
  owner: boolean;
}): BillingExtras {
  const unavailable = extrasUnavailable(input.row);
  const kind = (name: ExtraKind, used: number): BillingExtra => {
    const ceilingCents = input.ceilings[name];
    const enabled = ceilingCents !== null;
    if (!input.owner) return { enabled, ...hidden };
    if (!enabled) {
      const spend = extraSpend(name, 0, used);
      return { enabled, ceilingCents: null, limit: null, used, spentCents: spend.spentCents };
    }
    return { enabled, ceilingCents, ...extraSpend(name, ceilingCents, used) };
  };
  return {
    unavailable,
    sms: kind('sms', input.sms.overage),
    credits: kind('credits', input.credits.extra),
  };
}

const conflict = (reason: string, message: string) =>
  new ApiError('conflict', message, undefined, reason);

// Subscriptions made before AI extras existed carry no item for their meter, and a meter event
// for a customer whose subscription has no such item is accepted and billed to nobody.
export async function ensureCreditsItem(stripe: Stripe, subscriptionId: string, price: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.items.data.some((item) => item.price.id === price)) return false;
  await stripe.subscriptionItems.create(
    { subscription: subscriptionId, price, proration_behavior: 'none' },
    { idempotencyKey: `credits-extra-item-${subscriptionId}` }
  );
  return true;
}

export const setExtra: RouteHandler<typeof setExtraRoute, ApiEnv> = async (c) => {
  const db = createAdminClient(c);
  const organizationId = c.get('membership').organizationId;
  const userId = c.get('user').id;
  const { kind } = c.req.valid('param');
  const { ceilingEuros } = c.req.valid('json');
  const ceilingCents = ceilingEuros === null ? null : ceilingEuros * 100;
  const store = extrasStore(db);

  const row = await loadSubscription(db, organizationId);
  const unavailable = extrasUnavailable(row);
  if (ceilingCents !== null && unavailable) {
    throw conflict(
      'extras_unavailable',
      'Extras apply only to a paid subscription in good standing.'
    );
  }
  const before = await store.ceilings(organizationId);
  if (before[kind] !== ceilingCents) {
    if (kind === 'credits' && ceilingCents !== null && row?.stripe_subscription_id) {
      const access = stripeFor(c.env);
      const catalogue = await stripeCatalogue(access);
      await ensureCreditsItem(
        access.stripe,
        row.stripe_subscription_id,
        priceId(catalogue, creditsExtra.price.lookupKey)
      );
    }
    await store.setCeiling(organizationId, kind, ceilingCents);
    await recordChange(db, organizationId, {
      source: 'owner',
      change: `extras_${kind}`,
      details: { actor: userId, from: before[kind], to: ceilingCents },
    });
  }

  const now = new Date();
  const [ceilings, sms, credits] = await Promise.all([
    store.ceilings(organizationId),
    smsUsageOf(smsUsageStore(db), organizationId, row, now),
    creditsUsageOf(creditsStore(db), organizationId, row, now),
  ]);
  return c.json(extrasView({ row, ceilings, sms, credits, owner: true }), 200);
};
