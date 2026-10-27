import type Stripe from 'stripe';

import type { AdminClient } from '../../lib/admin-db';
import { choiceFromItems } from './rules';
import {
  type ChangeRecord,
  findSubscriptionByCustomer,
  loadSubscription,
  saveSubscription,
  type SubscriptionFields,
  type SubscriptionRow,
} from './store';
import { idOf } from './stripe';

const day = 86_400_000;

// ADR 029: a failed renewal keeps full access 14 days from the first failure, the length of
// Stripe's Smart Retries.
export const retryGraceMs = 14 * day;

const iso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

const live = new Set(['trialing', 'active', 'past_due', 'unpaid', 'paused']);

export function planItemOf(subscription: Stripe.Subscription) {
  return subscription.items.data.find((item) => {
    const key = item.price.lookup_key ?? '';
    return key.startsWith('start_') || key.startsWith('profesional_');
  });
}

export function choiceOf(subscription: Stripe.Subscription) {
  return choiceFromItems(
    subscription.items.data.map((item) => ({
      lookupKey: item.price.lookup_key,
      quantity: item.quantity ?? 1,
    }))
  );
}

// Back to the trial the organization had before it picked a plan, which keeps its days.
export function plainTrial(row: SubscriptionRow): SubscriptionFields {
  return {
    plan: 'profesional',
    status: 'trialing',
    trial_ends_at: row.trial_ends_at,
    access_until: row.trial_ends_at,
    stripe_subscription_id: null,
    billing_interval: null,
    price_version: null,
    employee_packs: 0,
    extra_members: 0,
    current_period_end: null,
  };
}

export function stateFromStripe(
  subscription: Stripe.Subscription,
  previous: SubscriptionRow | null,
  context: { accountId: string; now: Date; failedAt?: Date }
): SubscriptionFields | null {
  const chosen = choiceOf(subscription);
  if (!chosen) {
    throw new Error(`Stripe subscription ${subscription.id} has no plan of the catalogue.`);
  }
  const planItem = planItemOf(subscription)!;
  const common: SubscriptionFields = {
    plan: chosen.choice.plan,
    stripe_account: context.accountId,
    stripe_customer_id: idOf(subscription.customer),
    stripe_subscription_id: subscription.id,
    billing_interval: chosen.choice.interval,
    price_version: chosen.version,
    employee_packs: chosen.choice.employeePacks,
    extra_members: chosen.choice.extraMembers,
    current_period_end: iso(planItem.current_period_end),
  };
  const retrying = previous?.status === 'past_due' && previous.access_until !== null;

  switch (subscription.status) {
    case 'trialing': {
      const trialEnd = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : context.now;
      // Full access runs on past the trial's end by the retry grace, so a first charge that
      // fails, or a webhook that comes late, never flips the organization to read-only early.
      return {
        ...common,
        status: 'trialing',
        trial_ends_at: trialEnd.toISOString(),
        access_until: new Date(trialEnd.getTime() + retryGraceMs).toISOString(),
      };
    }
    case 'active':
      return { ...common, status: 'active', access_until: iso(subscription.cancel_at) };
    case 'past_due':
    case 'unpaid':
    case 'paused': {
      const firstFailure = context.failedAt ?? context.now;
      return {
        ...common,
        status: 'past_due',
        access_until: retrying
          ? previous.access_until
          : new Date(firstFailure.getTime() + retryGraceMs).toISOString(),
      };
    }
    case 'canceled': {
      const endedAt = new Date((subscription.ended_at ?? subscription.canceled_at ?? 0) * 1000);
      const ended = endedAt.getTime() > 0 ? endedAt : context.now;
      if (
        previous?.status === 'trialing' &&
        previous.trial_ends_at &&
        new Date(previous.trial_ends_at) > ended
      ) {
        return plainTrial(previous);
      }
      return {
        ...common,
        status: 'canceled',
        access_until: retrying ? previous.access_until : ended.toISOString(),
      };
    }
    default:
      return null;
  }
}

// An organization follows one Stripe subscription at a time. A live one it does not follow yet
// is adopted when it follows none or only an ended one, which covers a webhook that beats the
// checkout's own write; anything else is an older subscription's late event.
function follows(row: SubscriptionRow | null, subscription: Stripe.Subscription) {
  const current = row?.stripe_subscription_id ?? null;
  if (current === subscription.id) return true;
  if (!live.has(subscription.status)) return false;
  return current === null || row?.status === 'canceled';
}

export async function organizationOf(
  db: AdminClient,
  subscription: Pick<Stripe.Subscription, 'metadata' | 'customer'>
) {
  const fromMetadata = subscription.metadata?.organization_id;
  if (fromMetadata) return fromMetadata;
  const customerId = idOf(subscription.customer);
  if (!customerId) return null;
  return (await findSubscriptionByCustomer(db, customerId))?.organization_id ?? null;
}

export async function syncSubscription(
  db: AdminClient,
  subscription: Stripe.Subscription,
  context: { accountId: string; now: Date; failedAt?: Date; record: ChangeRecord }
) {
  const organizationId = await organizationOf(db, subscription);
  if (!organizationId) {
    console.warn(`Stripe subscription ${subscription.id} names no organization; left alone.`);
    return null;
  }
  const previous = await loadSubscription(db, organizationId);
  if (!follows(previous, subscription)) return previous;
  const next = stateFromStripe(subscription, previous, context);
  if (!next) return previous;
  return saveSubscription(db, organizationId, previous, next, {
    ...context.record,
    details: { ...context.record.details, stripe_subscription: subscription.id },
  });
}
