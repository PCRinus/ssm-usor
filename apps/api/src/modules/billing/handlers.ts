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
  creditsExtra,
  type InvoiceEmail,
  meteredProducts,
  type PaidPlan,
  smsOverage,
  vatPercent,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';
import type Stripe from 'stripe';

import { createAdminClient } from '../../lib/admin-db';
import { type ApiEnv, subscriptionUrl } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore } from '../../lib/files';
import { isOwnerInPerson } from '../../lib/membership';
import { creditsStore } from '../credits/store';
import { creditsUsageOf } from '../credits/usage';
import { creditsForMember, smsForMember } from '../extras/members';
import { extrasStore } from '../extras/store';
import { extrasView } from '../extras/view';
import { smsUsageStore } from '../sms-usage/store';
import { smsUsageOf } from '../sms-usage/usage';
import { employeesOverStepOf } from './employees-over-step';
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
import { deletesAtOf, minimumStepFor, problemsWith, productOf, usageLimits } from './rules';
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
  countOpenInvitations,
  countUsage,
  type InvoiceRow,
  listInvoices,
  loadCompany,
  loadInvoice,
  loadSubscription,
  ownerEmail,
  saveSubscription,
  type SubscriptionRow,
} from './store';
import { lookupKeyOfLine, priceIdOfLine, stripeCatalogue, stripeFor } from './stripe';

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
    members: plan.members,
    steps: plan.steps.map((step) => ({
      employees: step.employees,
      prices: { month: step.prices.month.unitAmount, year: step.prices.year.unitAmount },
      monthlySms: step.monthlySms,
      monthlyCredits: step.monthlyCredits,
      welcomeCredits: step.welcomeCredits,
    })),
  })),
  smsOverageCents: smsOverage.price.unitAmount,
  creditBlockCents: creditsExtra.price.unitAmount,
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
  return {
    plan: row.plan,
    planChosen: row.stripe_subscription_id !== null,
    status: row.status,
    interval: row.billing_interval,
    step: row.employee_step,
    trialEndsAt: iso(row.trial_ends_at),
    currentPeriodEnd: iso(row.current_period_end),
    billingAnchorAt: iso(row.billing_anchor_at),
    accessUntil: iso(row.access_until),
    access,
    deletesAt: deletesAtOf(row.access_until, access),
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
    subtotalCents: row.subtotal_cents,
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
  let extrasInPreviewCents: number | null = null;
  if (!subscription.cancel_at) {
    const upcoming = await stripe.invoices.createPreview({ subscription: subscription.id });
    const smsPrice = stripeBilling.catalogue.priceIds.get(smsOverage.price.lookupKey);
    smsOverageCents = upcoming.lines.data
      .filter((line) => priceIdOfLine(line) === smsPrice)
      .reduce((sum, line) => sum + line.amount, 0);
    extrasInPreviewCents = upcoming.lines.data
      .filter((line) => {
        const product = productOf(lookupKeyOfLine(line, stripeBilling.catalogue));
        return meteredProducts.some((metered) => metered.key === product);
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
    extrasInPreviewCents,
    scheduledChange: scheduled ? { ...scheduled.choice, at: scheduled.at.toISOString() } : null,
  };
}

export const getBilling: RouteHandler<typeof getBillingRoute, ApiEnv> = async (c) => {
  const billing = billingOf(c);
  const membership = c.get('membership');
  const [row, usage, invitations] = await Promise.all([
    loadSubscription(billing.db, billing.organizationId),
    countUsage(billing.db, billing.organizationId),
    countOpenInvitations(billing.db, billing.organizationId),
  ]);
  const limits = usageLimits(row, billing.now);
  const [sms, credits, employeesOverStep, ceilings] = await Promise.all([
    smsUsageOf(smsUsageStore(billing.db), billing.organizationId, row, billing.now),
    creditsUsageOf(creditsStore(billing.db), billing.organizationId, row, billing.now),
    employeesOverStepOf(billing.db, billing.organizationId),
    extrasStore(billing.db).ceilings(billing.organizationId),
  ]);
  const ownerInPerson = isOwnerInPerson(membership, billing.userId);

  let owner: BillingOverview['owner'] = null;
  let stripeCancelAt: string | null = null;
  if (ownerInPerson) {
    const [invoices, company, email, details] = await Promise.all([
      listInvoices(billing.db, billing.organizationId),
      loadCompany(billing.db, billing.organizationId),
      ownerEmail(billing.db, billing.organizationId),
      hasLiveSubscription(row) ? stripeDetails(c, billing, row) : null,
    ]);
    stripeCancelAt = details?.cancelAt ?? null;
    const choiceLimits = (plan: PaidPlan) => {
      const minimumStep = minimumStepFor(plan, usage.employees);
      const step = minimumStep ?? billingPlans[plan].steps.at(-1)!.employees;
      return { minimumStep, problems: problemsWith({ plan, step, interval: 'month' }, usage) };
    };
    owner = {
      nextPayment: details?.nextPayment ?? null,
      smsOverageCents: details?.smsOverageCents ?? null,
      extrasInPreviewCents: details?.extrasInPreviewCents ?? null,
      card: details?.card ?? null,
      invoiceEmail: row?.invoice_email ?? null,
      ownerEmail: email,
      scheduledChange: details?.scheduledChange ?? null,
      choices: { start: choiceLimits('start'), profesional: choiceLimits('profesional') },
      invoices: invoices.map(invoiceView),
      vatPayer: company.vatPayer,
    };
  }

  return c.json(
    {
      subscription: row ? subscriptionView(row, membership.access, stripeCancelAt) : null,
      usage: {
        employees: { used: usage.employees, limit: limits.employees },
        employeesOverStep,
        members: { used: usage.members, limit: limits.members },
        invitations,
        smsThisMonth: ownerInPerson ? sms : smsForMember(sms),
        creditsThisMonth: ownerInPerson ? credits : creditsForMember(credits),
      },
      catalogue,
      extras: extrasView({ row, ceilings, sms, credits, owner: ownerInPerson }),
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
  const returnUrl = subscriptionUrl(c.env);
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
