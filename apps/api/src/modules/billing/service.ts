import {
  type BillingChoice,
  type BillingPreview,
  type CancellationReason,
  smsOverage,
} from '@ssm-usor/contracts';
import type Stripe from 'stripe';

import type { AdminClient } from '../../lib/admin-db';
import { ApiError } from '../../lib/errors';
import {
  addInterval,
  amounts,
  type ChangeSplit,
  choiceFromItems,
  choiceLines,
  minimumsFor,
  problemsWith,
  recurringPrice,
  sameChoice,
  splitChange,
  type Usage,
} from './rules';
import {
  type Company,
  loadCompany,
  ownerEmail,
  recordChange,
  saveSubscription,
  type SubscriptionRow,
} from './store';
import { idOf, priceId, type StripeAccess, type StripeCatalogue } from './stripe';
import { choiceOf, plainTrial, planItemOf, stateFromStripe } from './sync';

export type Billing = {
  db: AdminClient;
  organizationId: string;
  userId: string;
  now: Date;
};

export type StripeBilling = Billing & { access: StripeAccess; catalogue: StripeCatalogue };

const conflict = (reason: string, message: string) =>
  new ApiError('conflict', message, undefined, reason);

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const fromSeconds = (value: number) => new Date(value * 1000);

export function hasLiveSubscription(row: SubscriptionRow | null): row is SubscriptionRow & {
  stripe_subscription_id: string;
} {
  return Boolean(row?.stripe_subscription_id) && row?.status !== 'canceled';
}

export function inTrial(row: SubscriptionRow | null, now: Date) {
  return (
    row?.status === 'trialing' && row.trial_ends_at !== null && new Date(row.trial_ends_at) > now
  );
}

const trialMarginMs = 3_600_000;

// Within the trial's last hour the first charge is taken now, rather than set for a moment that
// may have passed by the time Stripe reads it. The preview and the checkout both ask here.
export function firstChargeAtTrialEnd(row: SubscriptionRow | null, now: Date) {
  if (!inTrial(row, new Date(now.getTime() + trialMarginMs))) return null;
  return new Date(row!.trial_ends_at!);
}

const prorationDateMaxAgeMs = 3_600_000;

export function prorationDateOf(requested: string | undefined, now: Date) {
  const at = requested ? new Date(requested) : null;
  const fits =
    at !== null &&
    at.getTime() <= now.getTime() &&
    now.getTime() - at.getTime() <= prorationDateMaxAgeMs;
  return fits ? at : now;
}

export function assertBuyable(choice: BillingChoice, usage: Usage) {
  const [problem] = problemsWith(choice, usage);
  if (problem) {
    throw conflict(problem.reason, 'This plan does not fit the organization as it is today.');
  }
}

function assertNotEnterprise(row: SubscriptionRow | null) {
  if (row?.plan === 'enterprise') {
    throw conflict('enterprise_plan', 'An Enterprise subscription is changed by email.');
  }
}

export function currentChoice(row: SubscriptionRow): BillingChoice | null {
  if (row.plan === 'enterprise' || !row.billing_interval) return null;
  return {
    plan: row.plan,
    interval: row.billing_interval,
    employeePacks: row.employee_packs,
    extraMembers: row.extra_members,
  };
}

function itemGroup(lookupKey: string | null) {
  if (!lookupKey) return null;
  if (lookupKey.startsWith('start_') || lookupKey.startsWith('profesional_')) return 'plan';
  if (lookupKey.startsWith('employees')) return 'pack';
  if (lookupKey.startsWith('member_')) return 'member';
  return null;
}

// Stripe changes a subscription item by its id: a price or quantity in place, a removal by
// `deleted`, so the items are matched to the choice by what they are, not by their price.
// A pending update (`pending_if_incomplete`) takes only an item's price and quantity, so there a
// removal sets the quantity to 0 instead, and the item is deleted by a later change.
export function itemChanges(
  subscription: Stripe.Subscription,
  target: BillingChoice,
  catalogue: StripeCatalogue,
  removal: 'delete' | 'zero' = 'delete'
): Stripe.SubscriptionUpdateParams.Item[] {
  const wanted = choiceLines(target);
  const changes: Stripe.SubscriptionUpdateParams.Item[] = [];
  for (const group of ['plan', 'pack', 'member'] as const) {
    const want = wanted.find((line) => itemGroup(line.lookupKey) === group);
    const have = subscription.items.data.find((item) => itemGroup(item.price.lookup_key) === group);
    if (want) {
      const price = priceId(catalogue, want.lookupKey);
      if (!have) changes.push({ price, quantity: want.quantity });
      else if (have.price.id !== price || (have.quantity ?? 1) !== want.quantity) {
        changes.push({ id: have.id, price, quantity: want.quantity });
      }
    } else if (have && removal === 'delete') {
      changes.push({ id: have.id, deleted: true });
    } else if (have && (have.quantity ?? 1) !== 0) {
      changes.push({ id: have.id, quantity: 0 });
    }
  }
  return changes;
}

function phaseItems(choice: BillingChoice, catalogue: StripeCatalogue) {
  return [
    ...choiceLines(choice).map((line) => ({
      price: priceId(catalogue, line.lookupKey),
      quantity: line.quantity,
    })),
    { price: priceId(catalogue, smsOverage.price.lookupKey) },
  ];
}

const isProration = (line: Stripe.InvoiceLineItem) =>
  Boolean(line.parent?.subscription_item_details?.proration);

function invoiceAmounts(invoice: Stripe.Invoice) {
  return {
    subtotalCents: invoice.subtotal,
    vatCents: invoice.total - invoice.subtotal,
    totalCents: invoice.total,
  };
}

export async function retrieveSubscription(billing: StripeBilling, id: string) {
  return billing.access.stripe.subscriptions.retrieve(id, { expand: ['schedule'] });
}

export async function preview(
  billing: Billing & { stripe: (() => Promise<StripeBilling>) | null },
  row: SubscriptionRow | null,
  usage: Usage,
  choice: BillingChoice
): Promise<BillingPreview> {
  const { now } = billing;
  const recurring = recurringPrice(choice);
  const base = {
    choice,
    problems: problemsWith(choice, usage),
    minimums: minimumsFor(choice.plan, usage),
    recurring,
  };
  const none = amounts(0);
  const recurringAmounts = {
    subtotalCents: recurring.subtotalCents,
    vatCents: recurring.vatCents,
    totalCents: recurring.totalCents,
  };

  const purchase = (): BillingPreview => {
    const trialEndsAt = firstChargeAtTrialEnd(row, now);
    if (trialEndsAt) {
      const trialEnd = trialEndsAt.toISOString();
      return {
        ...base,
        unchanged: false,
        appliesAt: trialEnd,
        dueToday: none,
        proration: null,
        nextRenewal: { at: trialEnd, ...recurringAmounts },
        firstChargeAt: trialEnd,
        prorationDate: null,
      };
    }
    return {
      ...base,
      unchanged: false,
      appliesAt: now.toISOString(),
      dueToday: recurringAmounts,
      proration: null,
      nextRenewal: { at: addInterval(now, choice.interval).toISOString(), ...recurringAmounts },
      firstChargeAt: now.toISOString(),
      prorationDate: null,
    };
  };
  if (!hasLiveSubscription(row)) return purchase();

  const current = currentChoice(row);
  if (!current)
    throw conflict('enterprise_plan', 'An Enterprise subscription is changed by email.');

  if (row.status === 'trialing' && row.trial_ends_at) {
    // The checkout replaces a plan whose card never confirmed, and charges now within the
    // trial's last hour.
    if (!firstChargeAtTrialEnd(row, now)) {
      const subscription = await retrieveSubscription(
        await billing.stripe!(),
        row.stripe_subscription_id
      );
      if (!subscription.default_payment_method) return purchase();
    }
    const trialEnd = new Date(row.trial_ends_at).toISOString();
    return {
      ...base,
      unchanged: sameChoice(current, choice),
      appliesAt: trialEnd,
      dueToday: none,
      proration: null,
      nextRenewal: { at: trialEnd, ...recurringAmounts },
      firstChargeAt: trialEnd,
      prorationDate: null,
    };
  }

  const stripeBilling = await billing.stripe!();
  const subscription = await retrieveSubscription(stripeBilling, row.stripe_subscription_id);
  const renewalAt = fromSeconds(planItemOf(subscription)!.current_period_end);
  const scheduled = await scheduledChoice(stripeBilling, subscription);
  const split = splitChange(current, choice);
  const unchanged = scheduled
    ? sameChoice(scheduled.choice, choice)
    : split.now === null && split.atRenewal === null;

  const problems = mustWait(split, subscription)
    ? [...base.problems, { reason: 'split_change' as const }]
    : base.problems;

  let dueToday = none;
  let proration: BillingPreview['proration'] = null;
  const prorationDate = seconds(now);
  if (split.now) {
    const upcoming = await stripeBilling.access.stripe.invoices.createPreview({
      customer: idOf(subscription.customer) ?? undefined,
      subscription: subscription.id,
      subscription_details: {
        items: itemChanges(subscription, split.now, stripeBilling.catalogue, removalFor(split)),
        proration_behavior: split.chargeNow ? 'always_invoice' : 'create_prorations',
        proration_date: prorationDate,
      },
    });
    if (split.chargeNow) {
      dueToday = invoiceAmounts(upcoming);
      proration = { subtotalCents: upcoming.subtotal, chargedNow: true };
    } else {
      const prorated = upcoming.lines.data
        .filter(isProration)
        .reduce((sum, line) => sum + line.amount, 0);
      proration = { subtotalCents: prorated, chargedNow: false };
    }
  }

  const intervalNow = split.now && split.now.interval !== current.interval;
  const nextRenewalAt = intervalNow ? addInterval(now, 'year') : renewalAt;
  const nextSubtotal =
    recurring.subtotalCents + (proration && !proration.chargedNow ? proration.subtotalCents : 0);
  return {
    ...base,
    problems,
    unchanged,
    appliesAt: (split.atRenewal ? renewalAt : now).toISOString(),
    dueToday,
    proration,
    nextRenewal: { at: nextRenewalAt.toISOString(), ...amounts(nextSubtotal) },
    firstChargeAt: (dueToday.totalCents > 0 ? now : nextRenewalAt).toISOString(),
    prorationDate: split.now ? fromSeconds(prorationDate).toISOString() : null,
  };
}

// An annual change charged now applies only once paid, as a pending update, and a schedule set
// up beside it would be built from the items before it; a later schedule phase or items update
// would also discard the pending update and void its invoice. So the two go one at a time.
// An addition still waiting for its payment is such a pending update too.
function mustWait(split: ChangeSplit, subscription: Stripe.Subscription) {
  const splitAnnual = split.chargeNow && split.now !== null && split.atRenewal !== null;
  return splitAnnual || (split.atRenewal !== null && Boolean(subscription.pending_update));
}

const removalFor = (split: ChangeSplit) => (split.chargeNow ? 'zero' : 'delete');

export async function scheduledChoice(billing: StripeBilling, subscription: Stripe.Subscription) {
  const scheduleId = idOf(subscription.schedule);
  if (!scheduleId) return null;
  const schedule =
    typeof subscription.schedule === 'object' && subscription.schedule
      ? subscription.schedule
      : await billing.access.stripe.subscriptionSchedules.retrieve(scheduleId);
  const nowSeconds = seconds(billing.now);
  const next = schedule.phases.find((phase) => phase.start_date > nowSeconds);
  if (!next) return null;
  const chosen = choiceFromItems(
    next.items.map((item) => ({
      lookupKey: billing.catalogue.lookupKeys.get(idOf(item.price) ?? '') ?? null,
      quantity: item.quantity ?? 1,
    }))
  );
  return chosen ? { choice: chosen.choice, at: fromSeconds(next.start_date) } : null;
}

function companyOrRefuse(company: Company) {
  if (!company.name || !company.cui) {
    throw conflict(
      'company_details_missing',
      "The invoices need the company's legal name and CUI, filled in under Date firmă."
    );
  }
  return { ...company, name: company.name, cui: company.cui };
}

async function ensureCustomer(billing: StripeBilling, row: SubscriptionRow | null) {
  const { stripe } = billing.access;
  const company = companyOrRefuse(await loadCompany(billing.db, billing.organizationId));
  const email = await ownerEmail(billing.db, billing.organizationId);
  const details: Stripe.CustomerUpdateParams = {
    name: company.name,
    email: email ?? undefined,
    address: {
      country: 'RO',
      line1: company.addressLine ?? undefined,
      city: company.locality ?? undefined,
    },
    preferred_locales: ['ro'],
    metadata: { organization_id: billing.organizationId },
  };
  const existingId =
    row?.stripe_customer_id ?? (email ? await customerOfOrganization(billing, email) : null);
  if (existingId) {
    await stripe.customers.update(existingId, details);
    return existingId;
  }
  // An organization without a subscriptions row keeps no customer id until its subscription
  // exists, and a key reused with other details is an error at Stripe: the key covers them.
  const customer = await stripe.customers.create(details as Stripe.CustomerCreateParams, {
    idempotencyKey: `customer-${billing.organizationId}-${await digest(details)}`,
  });
  return customer.id;
}

// Listing by email, unlike Stripe's search, sees a customer created a moment ago.
async function customerOfOrganization(billing: StripeBilling, email: string) {
  const customers = await billing.access.stripe.customers.list({ email, limit: 100 });
  return (
    customers.data.find((customer) => customer.metadata?.organization_id === billing.organizationId)
      ?.id ?? null
  );
}

async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value))
  );
  return Array.from(new Uint8Array(bytes).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

const paidFor = new Set(['active', 'past_due', 'unpaid', 'paused']);

// A checkout left before paying, or a card form in the trial never confirmed, leaves a
// subscription that would otherwise sit there; the new attempt replaces it. One that is paid
// for, or holds a confirmed card, means an earlier checkout went through and its webhook has
// not arrived yet: the row takes it, and no second subscription is made.
async function settleEarlierCheckouts(
  billing: StripeBilling,
  row: SubscriptionRow | null,
  customerId: string
) {
  const { stripe } = billing.access;
  const earlier = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });
  const live = earlier.data.find(
    (subscription) =>
      paidFor.has(subscription.status) ||
      (subscription.status === 'trialing' && subscription.default_payment_method)
  );
  if (live) {
    await sync(billing, row, live, 'subscription_adopted');
    throw conflict('already_subscribed', 'An earlier checkout already made the subscription.');
  }
  for (const subscription of earlier.data) {
    if (subscription.status === 'incomplete' || subscription.status === 'trialing') {
      await stripe.subscriptions.cancel(subscription.id);
    }
  }
  return earlier.data.map((subscription) => subscription.id);
}

function secretOf(subscription: Stripe.Subscription) {
  const setup = subscription.pending_setup_intent;
  if (setup && typeof setup === 'object' && setup.client_secret) {
    return { clientSecret: setup.client_secret, intent: 'setup' as const };
  }
  const invoice = subscription.latest_invoice;
  if (
    invoice &&
    typeof invoice === 'object' &&
    invoice.status === 'open' &&
    invoice.amount_remaining > 0 &&
    invoice.confirmation_secret
  ) {
    return { clientSecret: invoice.confirmation_secret.client_secret, intent: 'payment' as const };
  }
  return { clientSecret: null, intent: null };
}

async function sync(
  billing: StripeBilling,
  previous: SubscriptionRow | null,
  subscription: Stripe.Subscription,
  change: string,
  details: Record<string, string | number | null> = {}
) {
  const next = stateFromStripe(subscription, previous, {
    accountId: billing.catalogue.accountId,
    now: billing.now,
  });
  if (!next) return previous;
  return saveSubscription(billing.db, billing.organizationId, previous, next, {
    source: 'owner',
    change,
    details: { ...details, actor: billing.userId, stripe_subscription: subscription.id },
  });
}

// A card that failed to confirm during the trial leaves a plan chosen with no card behind it; the
// owner's next attempt replaces that plan rather than finding it in the way.
async function withoutUnconfirmedTrialPlan(
  billing: StripeBilling,
  row: SubscriptionRow | null
): Promise<SubscriptionRow | null> {
  if (!hasLiveSubscription(row) || row.status !== 'trialing') return row;
  const subscription = await retrieveSubscription(billing, row.stripe_subscription_id);
  if (subscription.status !== 'trialing' || subscription.default_payment_method) return row;
  await releaseSchedule(billing, subscription);
  await billing.access.stripe.subscriptions.cancel(subscription.id);
  return saveSubscription(billing.db, billing.organizationId, row, plainTrial(row), {
    source: 'owner',
    change: 'unconfirmed_plan_replaced',
    details: { actor: billing.userId, stripe_subscription: subscription.id },
  });
}

export async function createSubscription(
  billing: StripeBilling,
  current: SubscriptionRow | null,
  usage: Usage,
  choice: BillingChoice
) {
  const row = await withoutUnconfirmedTrialPlan(billing, current);
  if (hasLiveSubscription(row)) {
    throw conflict('subscription_exists', 'The organization already has a subscription.');
  }
  assertNotEnterprise(row);
  assertBuyable(choice, usage);
  const { stripe } = billing.access;
  const customerId = await ensureCustomer(billing, row);
  if (row) {
    await saveSubscription(
      billing.db,
      billing.organizationId,
      row,
      { stripe_customer_id: customerId, stripe_account: billing.catalogue.accountId },
      { source: 'owner', change: 'stripe_customer', details: { actor: billing.userId } }
    );
  }
  const earlier = await settleEarlierCheckouts(billing, row, customerId);

  const trialEndsAt = firstChargeAtTrialEnd(row, billing.now);
  const trialEnd = trialEndsAt ? seconds(trialEndsAt) : undefined;

  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: phaseItems(choice, billing.catalogue),
    default_tax_rates: [billing.catalogue.taxRateId],
    payment_behavior: 'default_incomplete',
    // Card only: Apple Pay and Google Pay come through it, and Link stays off (ADR 029).
    payment_settings: {
      save_default_payment_method: 'on_subscription',
      payment_method_types: ['card'],
    },
    billing_mode: { type: 'flexible' },
    ...(trialEnd ? { trial_end: trialEnd } : {}),
    metadata: { organization_id: billing.organizationId },
    expand: ['latest_invoice.confirmation_secret', 'pending_setup_intent'],
  };
  // Two checkouts that both found no subscription (two tabs, the same second) send the same key,
  // so Stripe makes one subscription and answers both with it. The subscriptions found before are
  // in the key, so a checkout after an earlier one was abandoned or replaced never gets that
  // earlier answer back.
  const subscription = await stripe.subscriptions.create(params, {
    idempotencyKey: `subscription-${billing.organizationId}-${await digest({ params, earlier })}`,
  });

  // An incomplete subscription is not the organization's until its first payment succeeds; the
  // webhook adopts it then.
  if (subscription.status !== 'incomplete') {
    await sync(billing, row, subscription, 'plan_chosen', { plan: choice.plan });
  }
  return secretOf(subscription);
}

async function releaseSchedule(billing: StripeBilling, subscription: Stripe.Subscription) {
  const scheduleId = idOf(subscription.schedule);
  if (scheduleId) await billing.access.stripe.subscriptionSchedules.release(scheduleId);
}

async function scheduleRenewal(
  billing: StripeBilling,
  subscription: Stripe.Subscription,
  target: BillingChoice
) {
  const { stripe } = billing.access;
  const renewalAt = planItemOf(subscription)!.current_period_end;
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: subscription.id,
  });
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      {
        start_date: schedule.phases[0]!.start_date,
        end_date: renewalAt,
        items: subscription.items.data
          .filter((item) => item.quantity !== 0)
          .map((item) => ({
            price: item.price.id,
            ...(item.price.recurring?.usage_type === 'metered'
              ? {}
              : { quantity: item.quantity ?? 1 }),
          })),
        default_tax_rates: [billing.catalogue.taxRateId],
      },
      {
        items: phaseItems(target, billing.catalogue),
        default_tax_rates: [billing.catalogue.taxRateId],
        proration_behavior: 'none',
        duration: { interval: target.interval, interval_count: 1 },
        metadata: { organization_id: billing.organizationId },
      },
    ],
  });
}

export async function changeSubscription(
  billing: StripeBilling,
  row: SubscriptionRow | null,
  usage: Usage,
  choice: BillingChoice,
  requestedProrationDate?: string
) {
  if (!hasLiveSubscription(row)) {
    throw conflict('no_subscription', 'The organization has no subscription to change.');
  }
  assertNotEnterprise(row);
  const current = currentChoice(row);
  if (!current) throw conflict('no_subscription', 'The subscription has no plan to change.');
  assertBuyable(choice, usage);

  const { stripe } = billing.access;
  const subscription = await retrieveSubscription(billing, row.stripe_subscription_id);
  const scheduled = await scheduledChoice(billing, subscription);
  if (sameChoice(current, choice) && !scheduled) {
    throw conflict('unchanged', 'Nothing would change.');
  }
  if (scheduled && sameChoice(scheduled.choice, choice)) {
    throw conflict('unchanged', 'This change is already set for the renewal.');
  }
  const split: ChangeSplit = splitChange(current, choice);
  if (subscription.status !== 'trialing' && mustWait(split, subscription)) {
    throw conflict(
      'split_change',
      'An annual addition charged now and a removal at the renewal go one after the other.'
    );
  }
  await releaseSchedule(billing, subscription);
  if (sameChoice(current, choice)) {
    await recordChange(billing.db, billing.organizationId, {
      source: 'owner',
      change: 'scheduled_change_withdrawn',
      details: { actor: billing.userId },
    });
    return { clientSecret: null, intent: null };
  }

  // Nothing is paid during a trial, so every change applies at once and nothing is prorated.
  if (subscription.status === 'trialing') {
    const updated = await stripe.subscriptions.update(subscription.id, {
      items: itemChanges(subscription, choice, billing.catalogue),
      proration_behavior: 'none',
    });
    await sync(billing, row, updated, 'plan_changed', { plan: choice.plan });
    return { clientSecret: null, intent: null };
  }

  let updated = subscription;
  if (split.now) {
    updated = await stripe.subscriptions.update(subscription.id, {
      items: itemChanges(subscription, split.now, billing.catalogue, removalFor(split)),
      proration_behavior: split.chargeNow ? 'always_invoice' : 'create_prorations',
      proration_date: seconds(prorationDateOf(requestedProrationDate, billing.now)),
      // An annual upgrade is charged at once and applies only once paid; a monthly one goes
      // on the next invoice, so it applies at once.
      payment_behavior: split.chargeNow ? 'pending_if_incomplete' : 'allow_incomplete',
      expand: ['latest_invoice.confirmation_secret'],
    });
  }
  if (split.atRenewal) await scheduleRenewal(billing, updated, split.atRenewal);

  await sync(billing, row, updated, 'plan_changed', { plan: choice.plan });
  if (split.atRenewal) {
    await recordChange(billing.db, billing.organizationId, {
      source: 'owner',
      change: 'change_scheduled',
      details: {
        actor: billing.userId,
        at: new Date(planItemOf(updated)!.current_period_end * 1000).toISOString(),
        plan: split.atRenewal.plan,
        interval: split.atRenewal.interval,
        employee_packs: split.atRenewal.employeePacks,
        extra_members: split.atRenewal.extraMembers,
      },
    });
  }
  const invoice = updated.latest_invoice;
  const fromThisChange =
    split.chargeNow &&
    invoice &&
    typeof invoice === 'object' &&
    invoice.billing_reason === 'subscription_update';
  return fromThisChange ? secretOf(updated) : { clientSecret: null, intent: null };
}

export async function cancelSubscription(
  billing: StripeBilling,
  row: SubscriptionRow | null,
  request: { reason?: CancellationReason; note?: string }
) {
  if (!hasLiveSubscription(row)) {
    throw conflict('no_subscription', 'The organization has no subscription to cancel.');
  }
  const { stripe } = billing.access;
  const subscription = await retrieveSubscription(billing, row.stripe_subscription_id);
  const cancellation_details = {
    ...(request.reason ? { feedback: request.reason } : {}),
    ...(request.note ? { comment: request.note } : {}),
  };
  const record = {
    source: 'owner' as const,
    reason: request.reason ?? null,
    details: { actor: billing.userId, note: request.note ?? null },
  };

  // Before the first charge nothing was paid: the plan goes at once and the trial carries on.
  if (subscription.status === 'trialing') {
    await releaseSchedule(billing, subscription);
    await stripe.subscriptions.cancel(subscription.id, { cancellation_details });
    await saveSubscription(billing.db, billing.organizationId, row, plainTrial(row), {
      ...record,
      change: 'plan_canceled_in_trial',
    });
    return;
  }

  await releaseSchedule(billing, subscription);
  // Not cancel_at_period_end: on a mixed-interval subscription that stops at the monthly SMS
  // item's end, a month into a paid year (ADR 029).
  const updated = await stripe.subscriptions.update(subscription.id, {
    cancel_at: 'max_period_end',
    cancellation_details,
  });
  await recordChange(billing.db, billing.organizationId, { ...record, change: 'cancel_requested' });
  await sync(billing, row, updated, 'cancel_requested');
}

export async function resumeSubscription(billing: StripeBilling, row: SubscriptionRow | null) {
  if (!hasLiveSubscription(row)) {
    throw conflict('no_subscription', 'The organization has no subscription to resume.');
  }
  const subscription = await retrieveSubscription(billing, row.stripe_subscription_id);
  if (!subscription.cancel_at && !subscription.cancel_at_period_end) {
    throw conflict('not_canceling', 'The subscription is not set to end.');
  }
  const updated = await billing.access.stripe.subscriptions.update(subscription.id, {
    cancel_at: '',
    ...(subscription.cancel_at_period_end ? { cancel_at_period_end: false } : {}),
  });
  await sync(billing, row, updated, 'cancel_withdrawn');
}

export function choiceOfSubscription(subscription: Stripe.Subscription) {
  return choiceOf(subscription)?.choice ?? null;
}
