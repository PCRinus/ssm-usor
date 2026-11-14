import type { RouteHandler } from '@hono/zod-openapi';
import {
  type BillingCreditsUsage,
  type BillingExtra,
  type BillingExtras,
  type BillingSmsUsage,
  creditsExtra,
  type ExtraKind,
  type meteredProducts,
  smsOverage,
} from '@ssm-usor/contracts';

import { createAdminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import {
  hasMetered,
  releaseSchedule,
  retrieveSubscription,
  scheduledChoice,
  scheduleRenewal,
  type StripeBilling,
} from '../billing/service';
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

const meteredOf: Record<ExtraKind, (typeof meteredProducts)[number]> = {
  sms: smsOverage,
  credits: creditsExtra,
};

// A subscription made before an extra's price existed carries no item for its meter, and a meter
// event for a customer without one is accepted and billed to nobody. A change waiting for its
// payment is discarded by any items update, so Extra waits for it; a change set for the renewal
// is a schedule whose phases list the items, so it is set again with the new item in it.
export async function ensureMeteredItem(
  billing: StripeBilling,
  subscriptionId: string,
  kind: ExtraKind
) {
  const product = meteredOf[kind];
  const subscription = await retrieveSubscription(billing, subscriptionId);
  if (hasMetered(subscription, product.key)) return false;
  if (subscription.pending_update) {
    throw conflict(
      'extras_pending_payment',
      'A change waits for its payment; Extra can be turned on once it is settled.'
    );
  }
  const scheduled = await scheduledChoice(billing, subscription);
  if (scheduled) await releaseSchedule(billing, subscription);
  await billing.access.stripe.subscriptionItems.create(
    {
      subscription: subscriptionId,
      price: priceId(billing.catalogue, product.price.lookupKey),
      proration_behavior: 'none',
    },
    { idempotencyKey: `${product.key}-item-${subscriptionId}` }
  );
  if (scheduled) {
    await scheduleRenewal(
      billing,
      await retrieveSubscription(billing, subscriptionId),
      scheduled.choice
    );
  }
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
  const before = await store.ceilings(organizationId);
  const was = before[kind];
  // Lowering or turning off is how an owner stops a cost, so it works whatever the subscription.
  const raising = ceilingCents !== null && (was === null || ceilingCents > was);
  if (raising && extrasUnavailable(row)) {
    throw conflict(
      'extras_unavailable',
      'Extras apply only to a paid subscription in good standing.'
    );
  }
  if (was !== ceilingCents) {
    if (raising && row?.stripe_subscription_id) {
      const access = stripeFor(c.env);
      await ensureMeteredItem(
        {
          db,
          organizationId,
          userId,
          now: new Date(),
          access,
          catalogue: await stripeCatalogue(access),
        },
        row.stripe_subscription_id,
        kind
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
