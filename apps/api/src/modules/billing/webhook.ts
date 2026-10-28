import type { Context } from 'hono';
import type Stripe from 'stripe';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { handleChargeRefunded, handleInvoicePaid } from './invoices';
import { findSubscriptionByCustomer, recordChange } from './store';
import {
  idOf,
  isStripeError,
  type StripeAccess,
  type StripeCatalogue,
  stripeCatalogue,
  verifyWebhook,
  WebhookRefused,
} from './stripe';
import { syncSubscription } from './sync';

type Handling = {
  env: ApiEnv['Bindings'];
  db: AdminClient;
  access: StripeAccess;
  catalogue: StripeCatalogue;
  event: Stripe.Event;
};

const subscriptionOfInvoice = (invoice: Stripe.Invoice) =>
  idOf(invoice.parent?.subscription_details?.subscription);

async function syncById(handling: Handling, subscriptionId: string, failedAt?: Date) {
  const subscription = await handling.access.stripe.subscriptions.retrieve(subscriptionId);
  return syncSubscription(handling.db, subscription, {
    accountId: handling.catalogue.accountId,
    now: new Date(),
    failedAt,
    record: {
      source: 'stripe',
      change: handling.event.type,
      details: { stripe_event: handling.event.id },
    },
  });
}

// The first charge of a new subscription is confirmed in the browser and fails there, not as a
// renewal: only a renewal or a change starts the 14 days.
async function paymentFailed(handling: Handling, invoice: Stripe.Invoice) {
  const subscriptionId = subscriptionOfInvoice(invoice);
  if (!subscriptionId || invoice.billing_reason === 'subscription_create') return;
  await syncById(handling, subscriptionId, new Date(handling.event.created * 1000));
}

async function paymentActionRequired(handling: Handling, invoice: Stripe.Invoice) {
  const customerId = idOf(invoice.customer);
  const row = customerId ? await findSubscriptionByCustomer(handling.db, customerId) : null;
  if (!row) return;
  await recordChange(handling.db, row.organization_id, {
    source: 'stripe',
    change: 'payment_action_required',
    details: { stripe_event: handling.event.id, stripe_invoice: invoice.id },
  });
}

// Stripe's portal makes a new card the customer's default only, and the subscription's own
// default, which the checkout set, would win over it: the subscription takes the new card too,
// and an invoice left open by a failed renewal is paid with it at once (ADR 029). The card is
// read from the customer as it is now, since an older event delivered late names a card that
// has since been replaced.
async function defaultCardChanged(handling: Handling, changed: Stripe.Customer) {
  const previous = (handling.event.data.previous_attributes ?? {}) as {
    invoice_settings?: { default_payment_method?: unknown };
  };
  if (!previous.invoice_settings || !('default_payment_method' in previous.invoice_settings)) {
    return;
  }
  const { stripe } = handling.access;
  const row = await findSubscriptionByCustomer(handling.db, changed.id);
  if (!row?.stripe_subscription_id || row.status === 'canceled') return;
  const customer = await stripe.customers.retrieve(changed.id);
  if (customer.deleted) return;
  const paymentMethod = idOf(customer.invoice_settings.default_payment_method);
  if (!paymentMethod) return;
  const customerId = customer.id;
  await stripe.subscriptions.update(row.stripe_subscription_id, {
    default_payment_method: paymentMethod,
  });
  if (row.status !== 'past_due') return;

  const open = await stripe.invoices.list({
    customer: customerId,
    subscription: row.stripe_subscription_id,
    status: 'open',
    limit: 10,
  });
  for (const invoice of open.data) {
    if (invoice.billing_reason === 'subscription_create' || invoice.attempt_count === 0) continue;
    try {
      await stripe.invoices.pay(invoice.id, { payment_method: paymentMethod });
    } catch (error) {
      // A declined card is the client's to fix; retrying the event would not change it.
      if (!isStripeError(error) || error.type !== 'StripeCardError') throw error;
      await recordChange(handling.db, row.organization_id, {
        source: 'stripe',
        change: 'card_payment_declined',
        details: { stripe_event: handling.event.id, stripe_invoice: invoice.id },
      });
    }
  }
}

export async function handleEvent(handling: Handling) {
  const { event } = handling;
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncById(handling, event.data.object.id);
      return;
    case 'invoice.paid':
      await handleInvoicePaid(handling, event.data.object.id);
      return;
    case 'invoice.payment_failed':
      await paymentFailed(handling, event.data.object);
      return;
    case 'invoice.payment_action_required':
      await paymentActionRequired(handling, event.data.object);
      return;
    case 'charge.refunded':
      await handleChargeRefunded(handling, event.data.object);
      return;
    case 'customer.updated':
      await defaultCardChanged(handling, event.data.object);
      return;
    default:
      return;
  }
}

async function claim(db: AdminClient, event: Stripe.Event) {
  const inserted = await db.from('stripe_events').insert({ id: event.id, type: event.type });
  if (!inserted.error) return 'new';
  if (inserted.error.code !== '23505') throw fromDatabaseError(inserted.error, 'stripe event');
  const { data, error } = await db
    .from('stripe_events')
    .select('processed_at')
    .eq('id', event.id)
    .single();
  if (error) throw fromDatabaseError(error, 'stripe event');
  return data.processed_at ? 'done' : 'retry';
}

export async function stripeWebhook(c: Context<ApiEnv>) {
  let verified: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    verified = await verifyWebhook(c.env, await c.req.text(), c.req.header('stripe-signature'));
  } catch (error) {
    if (error instanceof WebhookRefused) {
      return c.json({ error: 'validation_error', message: error.message }, 400);
    }
    throw error;
  }
  const { event, access } = verified;
  const db = adminClient(c.env);

  if ((await claim(db, event)) === 'done') return c.json({ received: true }, 200);

  try {
    const catalogue = await stripeCatalogue(access);
    await handleEvent({ env: c.env, db, access, catalogue, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Stripe event ${event.id} (${event.type}) failed: ${message}`);
    await db
      .from('stripe_events')
      .update({ error: message.slice(0, 2000), processed_at: null })
      .eq('id', event.id);
    // Stripe retries a failed delivery for three days.
    throw error instanceof ApiError ? error : new ApiError('internal_error');
  }

  const done = await db
    .from('stripe_events')
    .update({ processed_at: new Date().toISOString(), error: null })
    .eq('id', event.id);
  if (done.error) throw fromDatabaseError(done.error, 'stripe event done');
  return c.json({ received: true }, 200);
}
