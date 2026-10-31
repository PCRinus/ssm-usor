import type { RouteHandler } from '@hono/zod-openapi';
import {
  type AccessLevel,
  type BillingCatalogue,
  type BillingCheckoutResponse,
  billingCurrency,
  type BillingInvoice,
  type BillingInvoiceLink,
  type BillingOverview,
  billingPlans,
  type BillingPortalSession,
  employeePacks,
  extraMember,
  type InvoiceEmail,
  readOnlyDays,
  smsOverage,
  vatPercent,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';
import type Stripe from 'stripe';

import { createAdminClient } from '../../lib/admin-db';
import { type ApiEnv, appOrigin } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore } from '../../lib/files';
import { isOwnerInPerson } from '../../lib/membership';
import type {
  cancelSubscriptionRoute,
  changeSubscriptionRoute,
  createPortalSessionRoute,
  createSubscriptionRoute,
  getBillingRoute,
  getInvoicePdfRoute,
  previewBillingRoute,
  resumeSubscriptionRoute,
  updateInvoiceEmailRoute,
} from './routes';
import { minimumsFor, problemsWith, usageLimits } from './rules';
import {
  type Billing,
  cancelSubscription,
  changeSubscription,
  createSubscription,
  hasLiveSubscription,
  preview,
  resumeSubscription,
  retrieveSubscription,
  scheduledChoice,
  type StripeBilling,
} from './service';
import {
  countUsage,
  type InvoiceRow,
  listInvoices,
  loadInvoice,
  loadSubscription,
  ownerEmail,
  saveSubscription,
  type SubscriptionRow,
} from './store';
import { stripeCatalogue, stripeFor } from './stripe';

const subscriptionTab = '/organization/subscription';

function billingOf(c: Context<ApiEnv>): Billing {
  return {
    db: createAdminClient(c),
    organizationId: c.get('membership').organizationId,
    userId: c.get('user').id,
    now: new Date(),
  };
}

async function withStripe(c: Context<ApiEnv>, billing: Billing): Promise<StripeBilling> {
  const access = stripeFor(c.env);
  return { ...billing, access, catalogue: await stripeCatalogue(access) };
}

const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);
const fromSeconds = (value: number) => new Date(value * 1000).toISOString();

const catalogue: BillingCatalogue = {
  currency: billingCurrency,
  vatPercent,
  plans: Object.values(billingPlans).map((plan) => ({
    key: plan.key,
    name: plan.name,
    prices: { month: plan.prices.month.unitAmount, year: plan.prices.year.unitAmount },
    includedEmployees: plan.includedEmployees,
    includedMembers: plan.includedMembers,
    maxMembers: plan.maxMembers,
    monthlySms: plan.monthlySms,
    employeePack: plan.employeePack,
    maxEmployeePacks: plan.maxEmployeePacks,
  })),
  employeePacks: Object.values(employeePacks).map((pack) => ({
    key: pack.key,
    name: pack.name,
    employees: pack.employees,
    prices: { month: pack.prices.month.unitAmount, year: pack.prices.year.unitAmount },
  })),
  extraMember: {
    name: extraMember.name,
    prices: {
      month: extraMember.prices.month.unitAmount,
      year: extraMember.prices.year.unitAmount,
    },
  },
  smsOverageCents: smsOverage.price.unitAmount,
};

// A row past due keeps the retry grace as its end, so a cancellation set meanwhile is known
// only from Stripe, which the owner's view reads; access ends at whichever comes first.
function cancelsAtOf(row: SubscriptionRow, stripeCancelAt: string | null) {
  if (row.status === 'active') return iso(row.access_until);
  if (row.status !== 'past_due' || !stripeCancelAt) return null;
  if (!row.access_until) return stripeCancelAt;
  return new Date(Math.min(Date.parse(stripeCancelAt), Date.parse(row.access_until))).toISOString();
}

function subscriptionView(
  row: SubscriptionRow,
  access: AccessLevel,
  stripeCancelAt: string | null
): NonNullable<BillingOverview['subscription']> {
  const deletesAt =
    access === 'read_only' && row.access_until
      ? new Date(new Date(row.access_until).getTime() + readOnlyDays * 86_400_000).toISOString()
      : null;
  return {
    plan: row.plan,
    planChosen: row.stripe_subscription_id !== null,
    status: row.status,
    interval: row.billing_interval,
    employeePacks: row.employee_packs,
    extraMembers: row.extra_members,
    trialEndsAt: iso(row.trial_ends_at),
    currentPeriodEnd: iso(row.current_period_end),
    accessUntil: iso(row.access_until),
    access,
    deletesAt,
    cancelsAt: cancelsAtOf(row, stripeCancelAt),
  };
}

function invoiceView(row: InvoiceRow): BillingInvoice {
  return {
    stripeInvoiceId: row.stripe_invoice_id,
    kind: row.kind,
    number: row.oblio_series && row.oblio_number ? `${row.oblio_series}-${row.oblio_number}` : null,
    issuedAt: iso(row.issued_at),
    amountCents: row.amount_cents,
    currency: row.currency,
    stornoOf: row.storno_of,
    hasPdf: row.pdf_path !== null,
  };
}

function cardOf(method: string | Stripe.PaymentMethod | null | undefined) {
  if (!method || typeof method === 'string' || !method.card) return null;
  const { brand, last4, exp_month, exp_year } = method.card;
  return { brand, last4, expMonth: exp_month, expYear: exp_year };
}

async function stripeDetails(c: Context<ApiEnv>, billing: Billing, row: SubscriptionRow) {
  const stripeBilling = await withStripe(c, billing);
  const { stripe } = stripeBilling.access;
  const subscription = await retrieveSubscription(stripeBilling, row.stripe_subscription_id!);
  let card = cardOf(
    typeof subscription.default_payment_method === 'string'
      ? await stripe.paymentMethods.retrieve(subscription.default_payment_method)
      : subscription.default_payment_method
  );
  if (!card && row.stripe_customer_id) {
    const customer = await stripe.customers.retrieve(row.stripe_customer_id, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (!customer.deleted) card = cardOf(customer.invoice_settings.default_payment_method);
  }

  let nextPayment: NonNullable<BillingOverview['owner']>['nextPayment'] = null;
  let smsOverageCents: number | null = null;
  if (!subscription.cancel_at) {
    const upcoming = await stripe.invoices.createPreview({ subscription: subscription.id });
    const smsPrice = stripeBilling.catalogue.priceIds.get(smsOverage.price.lookupKey);
    smsOverageCents = upcoming.lines.data
      .filter((line) => {
        const price = line.pricing?.price_details?.price;
        return (typeof price === 'string' ? price : price?.id) === smsPrice;
      })
      .reduce((sum, line) => sum + line.amount, 0);
    nextPayment = {
      at: fromSeconds(upcoming.next_payment_attempt ?? upcoming.period_end),
      subtotalCents: upcoming.subtotal,
      vatCents: upcoming.total - upcoming.subtotal,
      totalCents: upcoming.total,
    };
  }

  const scheduled = await scheduledChoice(stripeBilling, subscription);
  return {
    card,
    cancelAt: subscription.cancel_at ? fromSeconds(subscription.cancel_at) : null,
    nextPayment,
    smsOverageCents,
    scheduledChange: scheduled ? { ...scheduled.choice, at: scheduled.at.toISOString() } : null,
  };
}

export const getBilling: RouteHandler<typeof getBillingRoute, ApiEnv> = async (c) => {
  const billing = billingOf(c);
  const membership = c.get('membership');
  const [row, usage] = await Promise.all([
    loadSubscription(billing.db, billing.organizationId),
    countUsage(billing.db, billing.organizationId),
  ]);
  const limits = usageLimits(row, billing.now);

  let owner: BillingOverview['owner'] = null;
  let stripeCancelAt: string | null = null;
  if (isOwnerInPerson(membership, billing.userId)) {
    const [invoices, email, details] = await Promise.all([
      listInvoices(billing.db, billing.organizationId),
      ownerEmail(billing.db, billing.organizationId),
      hasLiveSubscription(row) ? stripeDetails(c, billing, row) : null,
    ]);
    stripeCancelAt = details?.cancelAt ?? null;
    const choiceLimits = (plan: 'start' | 'profesional') => {
      const minimums = minimumsFor(plan, usage);
      return {
        minimums,
        problems: problemsWith({ plan, interval: 'month', ...minimums }, usage),
      };
    };
    owner = {
      nextPayment: details?.nextPayment ?? null,
      smsOverageCents: details?.smsOverageCents ?? null,
      card: details?.card ?? null,
      invoiceEmail: row?.invoice_email ?? null,
      ownerEmail: email,
      scheduledChange: details?.scheduledChange ?? null,
      choices: { start: choiceLimits('start'), profesional: choiceLimits('profesional') },
      invoices: invoices.map(invoiceView),
    };
  }

  return c.json(
    {
      subscription: row ? subscriptionView(row, membership.access, stripeCancelAt) : null,
      usage: {
        employees: { used: usage.employees, limit: limits.employees },
        members: { used: usage.members, limit: limits.members },
        smsThisMonth: { used: null, limit: limits.sms },
      },
      catalogue,
      owner,
    } satisfies BillingOverview,
    200
  );
};

async function ownerState(billing: Billing) {
  return Promise.all([
    loadSubscription(billing.db, billing.organizationId),
    countUsage(billing.db, billing.organizationId),
  ]);
}

export const previewBilling: RouteHandler<typeof previewBillingRoute, ApiEnv> = async (c) => {
  const billing = billingOf(c);
  const [row, usage] = await ownerState(billing);
  if (row?.plan === 'enterprise') {
    throw new ApiError(
      'conflict',
      'An Enterprise subscription is changed by email.',
      undefined,
      'enterprise_plan'
    );
  }
  const result = await preview(
    { ...billing, stripe: () => withStripe(c, billing) },
    row,
    usage,
    c.req.valid('json')
  );
  return c.json(result, 200);
};

export const createSubscriptionHandler: RouteHandler<
  typeof createSubscriptionRoute,
  ApiEnv
> = async (c) => {
  const billing = billingOf(c);
  const [row, usage] = await ownerState(billing);
  const result = await createSubscription(
    await withStripe(c, billing),
    row,
    usage,
    c.req.valid('json')
  );
  return c.json(result satisfies BillingCheckoutResponse, 201);
};

export const changeSubscriptionHandler: RouteHandler<
  typeof changeSubscriptionRoute,
  ApiEnv
> = async (c) => {
  const billing = billingOf(c);
  const [row, usage] = await ownerState(billing);
  const { prorationDate, ...choice } = c.req.valid('json');
  const result = await changeSubscription(
    await withStripe(c, billing),
    row,
    usage,
    choice,
    prorationDate
  );
  return c.json(result satisfies BillingCheckoutResponse, 200);
};

export const cancelSubscriptionHandler: RouteHandler<
  typeof cancelSubscriptionRoute,
  ApiEnv
> = async (c) => {
  const billing = billingOf(c);
  const row = await loadSubscription(billing.db, billing.organizationId);
  await cancelSubscription(await withStripe(c, billing), row, c.req.valid('json'));
  return c.body(null, 204);
};

export const resumeSubscriptionHandler: RouteHandler<
  typeof resumeSubscriptionRoute,
  ApiEnv
> = async (c) => {
  const billing = billingOf(c);
  const row = await loadSubscription(billing.db, billing.organizationId);
  await resumeSubscription(await withStripe(c, billing), row);
  return c.body(null, 204);
};

export const createPortalSession: RouteHandler<typeof createPortalSessionRoute, ApiEnv> = async (
  c
) => {
  const billing = billingOf(c);
  const row = await loadSubscription(billing.db, billing.organizationId);
  if (!row?.stripe_customer_id) {
    throw new ApiError(
      'conflict',
      'The organization has no card on file yet.',
      undefined,
      'no_subscription'
    );
  }
  const stripeBilling = await withStripe(c, billing);
  const returnUrl = new URL(subscriptionTab, appOrigin(c.env)).href;
  const session = await stripeBilling.access.stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    ...(stripeBilling.catalogue.portalConfigurationId
      ? { configuration: stripeBilling.catalogue.portalConfigurationId }
      : {}),
    locale: 'ro',
    return_url: returnUrl,
    flow_data: {
      type: 'payment_method_update',
      after_completion: { type: 'redirect', redirect: { return_url: returnUrl } },
    },
  });
  return c.json({ url: session.url } satisfies BillingPortalSession, 201);
};

export const updateInvoiceEmail: RouteHandler<typeof updateInvoiceEmailRoute, ApiEnv> = async (
  c
) => {
  const billing = billingOf(c);
  const { email } = c.req.valid('json');
  const row = await loadSubscription(billing.db, billing.organizationId);
  if (!row) {
    throw new ApiError(
      'conflict',
      'The organization has no subscription to invoice.',
      undefined,
      'no_subscription'
    );
  }
  const saved = await saveSubscription(
    billing.db,
    billing.organizationId,
    row,
    { invoice_email: email?.trim().toLowerCase() ?? null },
    { source: 'owner', change: 'invoice_email', details: { actor: billing.userId } }
  );
  return c.json({ email: saved?.invoice_email ?? null } satisfies InvoiceEmail, 200);
};

export const getInvoicePdf: RouteHandler<typeof getInvoicePdfRoute, ApiEnv> = async (c) => {
  const billing = billingOf(c);
  const { stripeInvoiceId } = c.req.valid('param');
  const row = await loadInvoice(billing.db, stripeInvoiceId);
  if (!row || row.organization_id !== billing.organizationId) {
    throw new ApiError('not_found', 'No such invoice.');
  }
  if (!row.pdf_path) {
    throw new ApiError(
      'conflict',
      'The PDF of this invoice is not stored yet.',
      undefined,
      'pdf_pending'
    );
  }
  const expiresInSeconds = 60;
  const fileName = row.pdf_path.split('/').pop()!;
  const url = await adminFileStore(c.env, c.req.raw.signal).billingInvoiceLink(
    row.pdf_path,
    fileName,
    expiresInSeconds
  );
  return c.json(
    {
      url,
      fileName,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    } satisfies BillingInvoiceLink,
    200
  );
};
