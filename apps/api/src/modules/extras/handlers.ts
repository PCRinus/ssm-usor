import type { RouteHandler } from '@hono/zod-openapi';
import {
  type BillingChoice,
  billingChoiceSchema,
  creditsExtra,
  type ExtraKind,
  type meteredProducts,
  smsOverage,
} from '@ssm-usor/contracts';
import type Stripe from 'stripe';

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
import { idOf, priceId, stripeCatalogue, stripeFor } from '../billing/stripe';
import { creditsStore } from '../credits/store';
import { creditsUsageOf } from '../credits/usage';
import { smsUsageStore } from '../sms-usage/store';
import { smsUsageOf } from '../sms-usage/usage';
import { extrasUnavailable } from './policy';
import type { setExtraRoute } from './routes';
import { extrasStore } from './store';
import { extrasView } from './view';

const meteredOf: Record<ExtraKind, (typeof meteredProducts)[number]> = {
  sms: smsOverage,
  credits: creditsExtra,
};

// A subscription made before an extra's price existed carries no item for its meter, and a meter
// event for a customer without one is accepted and billed to nobody. A change waiting for its
// payment is discarded by any items update, so Extra waits for it. A change set for the renewal
// lives only in Stripe's schedule, whose phases list the items: it is released, the item added,
// and the schedule set again. The choice is written on the subscription's metadata first, so a
// failure between those steps, or a second request racing this one, finds it and sets the
// schedule again rather than losing the change.
const pendingKey = 'extras_scheduled_change';

function pendingChoice(subscription: Stripe.Subscription): BillingChoice | null {
  const raw = subscription.metadata?.[pendingKey];
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = billingChoiceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function restoreSchedule(
  billing: StripeBilling,
  subscriptionId: string,
  choice: BillingChoice
) {
  try {
    const current = await retrieveSubscription(billing, subscriptionId);
    if (idOf(current.schedule)) await releaseSchedule(billing, current);
    await scheduleRenewal(billing, await retrieveSubscription(billing, subscriptionId), choice);
    await billing.access.stripe.subscriptions.update(subscriptionId, {
      metadata: { [pendingKey]: '' },
    });
  } catch (error) {
    console.error(
      `SCHEDULED CHANGE NOT RESTORED for organization ${billing.organizationId}, subscription ${subscriptionId}: set ${JSON.stringify(choice)} for the renewal by hand. ${error instanceof Error ? error.message : String(error)}`
    );
    throw new ApiError(
      'service_unavailable',
      'The change set for the renewal could not be set again; try once more.',
      undefined,
      'stripe_unavailable'
    );
  }
}

export async function ensureMeteredItem(
  billing: StripeBilling,
  subscriptionId: string,
  kind: ExtraKind
) {
  const product = meteredOf[kind];
  let subscription = await retrieveSubscription(billing, subscriptionId);
  const leftOver = pendingChoice(subscription);
  if (leftOver && !idOf(subscription.schedule)) {
    await restoreSchedule(billing, subscriptionId, leftOver);
    subscription = await retrieveSubscription(billing, subscriptionId);
  }
  if (hasMetered(subscription, product.key)) return false;
  if (subscription.pending_update) {
    throw ApiError.conflict(
      'extras_pending_payment',
      'A change waits for its payment; Extra can be turned on once it is settled.'
    );
  }
  const scheduled = await scheduledChoice(billing, subscription);
  if (scheduled) {
    await billing.access.stripe.subscriptions.update(subscriptionId, {
      metadata: { [pendingKey]: JSON.stringify(scheduled.choice) },
    });
  }
  // A schedule with no phase still to come holds no change; it goes, and the item with it is plain.
  if (idOf(subscription.schedule)) await releaseSchedule(billing, subscription);
  try {
    await billing.access.stripe.subscriptionItems.create(
      {
        subscription: subscriptionId,
        price: priceId(billing.catalogue, product.price.lookupKey),
        proration_behavior: 'none',
      },
      { idempotencyKey: `${product.key}-item-${subscriptionId}` }
    );
  } catch (error) {
    if (scheduled) await restoreSchedule(billing, subscriptionId, scheduled.choice);
    throw error;
  }
  if (scheduled) await restoreSchedule(billing, subscriptionId, scheduled.choice);
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
    throw ApiError.conflict(
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
