import { z } from 'zod';

import {
  accessLevelSchema,
  subscriptionPlanSchema,
  subscriptionStatusSchema,
} from './subscriptions';

export const billingIntervalSchema = z.enum(['month', 'year']);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

// Enterprise is a quote sold by email and never reaches the checkout (ADR 029).
export const paidPlanSchema = subscriptionPlanSchema.exclude(['enterprise']);
export type PaidPlan = z.infer<typeof paidPlanSchema>;

export const billingCurrency = 'eur';

// Added on top of every price, never included in it.
export const vatPercent = 21;

// A changed amount is a new Stripe price under a new version, never an edit of the old one: Stripe
// prices are immutable, and existing subscriptions move at their renewal (ADR 029).
export const priceVersion = 'v1';

export const billingProductKeySchema = z.enum([
  'start',
  'profesional',
  'employees50',
  'employees500',
  'member',
  'sms_overage',
]);
export type BillingProductKey = z.infer<typeof billingProductKeySchema>;

export type EmployeePackKey = Extract<BillingProductKey, 'employees50' | 'employees500'>;

export interface CataloguePrice {
  lookupKey: string;
  product: BillingProductKey;
  interval: BillingInterval;
  /** Euro cents, without VAT. */
  unitAmount: number;
  usage: 'licensed' | 'metered';
}

export interface CatalogueProduct {
  key: BillingProductKey;
  /** Romanian, as it reads on the invoice. */
  name: string;
}

const monthsPaidPerYear = 10;

function lookupKey(product: BillingProductKey, interval: BillingInterval) {
  return `${product}_${interval === 'month' ? 'monthly' : 'annual'}_${priceVersion}`;
}

function recurring(
  product: BillingProductKey,
  monthlyAmount: number
): Record<BillingInterval, CataloguePrice> {
  return {
    month: {
      lookupKey: lookupKey(product, 'month'),
      product,
      interval: 'month',
      unitAmount: monthlyAmount,
      usage: 'licensed',
    },
    year: {
      lookupKey: lookupKey(product, 'year'),
      product,
      interval: 'year',
      unitAmount: monthlyAmount * monthsPaidPerYear,
      usage: 'licensed',
    },
  };
}

export interface EmployeePack {
  key: EmployeePackKey;
  name: string;
  employees: number;
  prices: Record<BillingInterval, CataloguePrice>;
}

export const employeePacks: Record<EmployeePackKey, EmployeePack> = {
  employees50: {
    key: 'employees50',
    name: 'Pachet de 50 de angajați',
    employees: 50,
    prices: recurring('employees50', 1500),
  },
  employees500: {
    key: 'employees500',
    name: 'Pachet de 500 de angajați',
    employees: 500,
    prices: recurring('employees500', 4000),
  },
};

export const extraMember: {
  key: 'member';
  name: string;
  prices: Record<BillingInterval, CataloguePrice>;
} = {
  key: 'member',
  name: 'Utilizator în plus',
  prices: recurring('member', 1500),
};

// Monthly on every plan, annual ones too, which makes an annual subscription mixed-interval. The
// API reports only the codes past the plan's allowance, so one price serves both plans.
export const smsOverage: {
  key: 'sms_overage';
  name: string;
  meterEventName: string;
  price: CataloguePrice;
} = {
  key: 'sms_overage',
  name: 'SMS peste cele incluse în plan',
  meterEventName: 'sms_overage',
  price: {
    lookupKey: lookupKey('sms_overage', 'month'),
    product: 'sms_overage',
    interval: 'month',
    unitAmount: 10,
    usage: 'metered',
  },
};

export interface PlanTerms {
  key: PaidPlan;
  name: string;
  prices: Record<BillingInterval, CataloguePrice>;
  includedEmployees: number;
  includedMembers: number;
  /** Members in all, extra ones included; null where any number may be bought. */
  maxMembers: number | null;
  monthlySms: number;
  employeePack: EmployeePackKey;
  /** Null where any number may be bought. */
  maxEmployeePacks: number | null;
}

export const billingPlans: Record<PaidPlan, PlanTerms> = {
  start: {
    key: 'start',
    name: 'SSM Ușor Start',
    prices: recurring('start', 3900),
    includedEmployees: 250,
    includedMembers: 1,
    maxMembers: 2,
    monthlySms: 50,
    employeePack: 'employees50',
    // 600 employees: past that, Start with packs costs more than Profesional.
    maxEmployeePacks: 7,
  },
  profesional: {
    key: 'profesional',
    name: 'SSM Ușor Profesional',
    prices: recurring('profesional', 14900),
    includedEmployees: 1500,
    includedMembers: 3,
    maxMembers: null,
    monthlySms: 300,
    employeePack: 'employees500',
    maxEmployeePacks: null,
  },
};

export const catalogueProducts: CatalogueProduct[] = [
  ...Object.values(billingPlans),
  ...Object.values(employeePacks),
  extraMember,
  smsOverage,
].map(({ key, name }) => ({ key, name }));

export const cataloguePrices: CataloguePrice[] = [
  ...[...Object.values(billingPlans), ...Object.values(employeePacks), extraMember].flatMap(
    ({ prices }) => [prices.month, prices.year]
  ),
  smsOverage.price,
];

export const billingChoiceSchema = z.object({
  plan: paidPlanSchema,
  interval: billingIntervalSchema,
  employeePacks: z.int().min(0).max(100),
  extraMembers: z.int().min(0).max(100),
});
export type BillingChoice = z.infer<typeof billingChoiceSchema>;

export const billingChoiceProblemReasonSchema = z.enum([
  'start_employee_ceiling',
  'start_member_ceiling',
  'employee_packs_below_need',
  'extra_members_below_need',
  'employee_packs_above_plan',
  'extra_members_above_plan',
  // An annual change that both adds now, charged today, and removes at the renewal: the two
  // go one after the other, the addition first.
  'split_change',
]);
export type BillingChoiceProblemReason = z.infer<typeof billingChoiceProblemReasonSchema>;

export const billingChoiceProblemSchema = z.object({
  reason: billingChoiceProblemReasonSchema,
  // With a `_below_need` reason: the fewest packs or extra members that would do.
  minimum: z.int().min(0).optional(),
  // With an `_above_plan` reason: the most the plan allows.
  maximum: z.int().min(0).optional(),
});
export type BillingChoiceProblem = z.infer<typeof billingChoiceProblemSchema>;

const cents = z.int();
const timestamp = z.iso.datetime({ offset: true });

export const billingAmountsSchema = z.object({
  subtotalCents: cents,
  vatCents: cents,
  totalCents: cents,
});
export type BillingAmounts = z.infer<typeof billingAmountsSchema>;

export const billingPreviewLineSchema = z.object({
  product: billingProductKeySchema,
  quantity: z.int().min(1),
  // For the whole quantity and one interval, without VAT.
  amountCents: cents,
});

export const billingPreviewSchema = z.object({
  choice: billingChoiceSchema,
  // Empty when the choice may be bought; otherwise creating or changing to it answers 409.
  problems: z.array(billingChoiceProblemSchema),
  minimums: z.object({ employeePacks: z.int().min(0), extraMembers: z.int().min(0) }),
  // True when the subscription already is, or is already set to become, this choice.
  unchanged: z.boolean(),
  recurring: billingAmountsSchema.extend({
    interval: billingIntervalSchema,
    lines: z.array(billingPreviewLineSchema),
  }),
  // When the whole choice applies: now, at the trial's end, or at the renewal for a downgrade
  // or a removal, which waits (ADR 029).
  appliesAt: timestamp,
  dueToday: billingAmountsSchema,
  // The difference for the days left of what changes now: on the next renewal of a monthly
  // plan, charged today (inside `dueToday`) on an annual one. Null when nothing is prorated.
  proration: z.object({ subtotalCents: cents, chargedNow: z.boolean() }).nullable(),
  // The plan's next renewal under this choice, a monthly proration included.
  nextRenewal: billingAmountsSchema.extend({ at: timestamp }),
  firstChargeAt: timestamp,
  // The moment Stripe prorated from; sent back with the change so it charges what was shown.
  // Null when nothing is prorated.
  prorationDate: timestamp.nullable(),
});
export type BillingPreview = z.infer<typeof billingPreviewSchema>;

export const changeSubscriptionRequestSchema = billingChoiceSchema.extend({
  // The preview's `prorationDate`; one older than an hour, or in the future, is replaced by now.
  prorationDate: timestamp.optional(),
});
export type ChangeSubscriptionRequest = z.infer<typeof changeSubscriptionRequestSchema>;

export const billingCheckoutResponseSchema = z.object({
  // For the Payment Element: `confirmPayment` with a payment secret, `confirmSetup` with a
  // setup one. Null when nothing waits on the browser.
  clientSecret: z.string().nullable(),
  intent: z.enum(['payment', 'setup']).nullable(),
});
export type BillingCheckoutResponse = z.infer<typeof billingCheckoutResponseSchema>;

// Stripe's own cancellation feedback values, so the reason reaches its dashboard as it is.
export const cancellationReasonSchema = z.enum([
  'too_expensive',
  'missing_features',
  'switched_service',
  'unused',
  'too_complex',
  'low_quality',
  'customer_service',
  'other',
]);
export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

export const cancelSubscriptionRequestSchema = z.object({
  reason: cancellationReasonSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CancelSubscriptionRequest = z.infer<typeof cancelSubscriptionRequestSchema>;

export const invoiceEmailSchema = z.object({
  // Null sends the invoices to the owner.
  email: z.email().max(254).nullable(),
});
export type InvoiceEmail = z.infer<typeof invoiceEmailSchema>;

export const billingPortalSessionSchema = z.object({ url: z.url() });
export type BillingPortalSession = z.infer<typeof billingPortalSessionSchema>;

export const billingInvoiceLinkSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  expiresAt: timestamp,
});
export type BillingInvoiceLink = z.infer<typeof billingInvoiceLinkSchema>;

export const billingUsageMeterSchema = z.object({
  used: z.int().min(0).nullable(),
  // Null where nothing limits it: no subscription, or Enterprise.
  limit: z.int().min(0).nullable(),
});
export type BillingUsageMeter = z.infer<typeof billingUsageMeterSchema>;

/** A tester's trial sends Profesional's signing codes a month, with a hard stop (ADR 029). */
export const testerMonthlySms = billingPlans.profesional.monthlySms;

/** The safety cap on signing codes, as a multiple of the plan's allowance (ADR 029). */
export const smsCapFactor = { default: 3, max: 20 } as const;

/** Why an SMS was not sent, as `reason` carries it on the refusal. */
export const smsRefusalReasons = [
  // A trial without a chosen plan or the tester switch, or one that has ended.
  'sms_trial',
  // SMS go to Romanian numbers (+40) only.
  'sms_foreign_number',
  // The month's signing codes are used up where nothing past them can be billed: a tester's
  // trial, or a plan chosen during the trial before its first payment.
  'sms_allowance_reached',
  // The safety cap is reached; the owner can raise it.
  'sms_cap_reached',
] as const;
export const smsRefusalReasonSchema = z.enum(smsRefusalReasons);
export type SmsRefusalReason = z.infer<typeof smsRefusalReasonSchema>;

/**
 * `none`: no SMS goes at all; `near`: from 80 % of what is included; `over`: past it, billed;
 * `capped`: at the safety cap; `stopped`: at a hard stop, where nothing past it is billed.
 */
export const smsUsageStateSchema = z.enum(['ok', 'near', 'over', 'capped', 'stopped', 'none']);
export type SmsUsageState = z.infer<typeof smsUsageStateSchema>;

export const billingSmsUsageSchema = z.object({
  // Signing codes sent by SMS this month; the other kinds are not counted.
  used: z.int().min(0),
  // The plan's codes plus those granted by hand; null where nothing limits them.
  included: z.int().min(0).nullable(),
  allowance: z.int().min(0).nullable(),
  granted: z.int().min(0),
  // Null where nothing past `included` is sent: a hard stop, or no limit. Grants raise it too.
  cap: z.int().min(0).nullable(),
  capFactor: z.int().min(1).nullable(),
  // Codes past `included` this month, billed on the next invoice.
  overage: z.int().min(0),
  // Null while no SMS goes.
  periodStart: timestamp.nullable(),
  periodEnd: timestamp.nullable(),
  state: smsUsageStateSchema,
});
export type BillingSmsUsage = z.infer<typeof billingSmsUsageSchema>;

export const smsCapRequestSchema = z.object({
  factor: z.int().min(smsCapFactor.default).max(smsCapFactor.max),
});
export type SmsCapRequest = z.infer<typeof smsCapRequestSchema>;

export const smsCapSchema = z.object({
  factor: z.int(),
  // The plan's allowance times the factor, before any codes granted by hand.
  cap: z.int(),
});
export type SmsCap = z.infer<typeof smsCapSchema>;

export const billingInvoiceSchema = z.object({
  stripeInvoiceId: z.string(),
  kind: z.enum(['invoice', 'proforma']),
  // Oblio's series and number, such as SSMUSOR-0001; null until Oblio has issued it.
  number: z.string().nullable(),
  issuedAt: timestamp.nullable(),
  // With VAT; negative for a storno.
  amountCents: cents,
  currency: z.string(),
  stornoOf: z.string().nullable(),
  hasPdf: z.boolean(),
});
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;

const pricePair = z.object({ month: cents, year: cents });

export const billingCatalogueSchema = z.object({
  currency: z.string(),
  vatPercent: z.number(),
  plans: z.array(
    z.object({
      key: paidPlanSchema,
      name: z.string(),
      prices: pricePair,
      includedEmployees: z.int(),
      includedMembers: z.int(),
      maxMembers: z.int().nullable(),
      monthlySms: z.int(),
      employeePack: billingProductKeySchema,
      maxEmployeePacks: z.int().nullable(),
    })
  ),
  employeePacks: z.array(
    z.object({
      key: billingProductKeySchema,
      name: z.string(),
      employees: z.int(),
      prices: pricePair,
    })
  ),
  extraMember: z.object({ name: z.string(), prices: pricePair }),
  smsOverageCents: cents,
});
export type BillingCatalogue = z.infer<typeof billingCatalogueSchema>;

const choiceLimitsSchema = z.object({
  minimums: z.object({ employeePacks: z.int(), extraMembers: z.int() }),
  problems: z.array(billingChoiceProblemSchema),
});

export const billingOverviewSchema = z.object({
  // Null for an organization without a subscription, which has full access indefinitely.
  subscription: z
    .object({
      plan: subscriptionPlanSchema,
      planChosen: z.boolean(),
      status: subscriptionStatusSchema,
      interval: billingIntervalSchema.nullable(),
      employeePacks: z.int().min(0),
      extraMembers: z.int().min(0),
      trialEndsAt: timestamp.nullable(),
      currentPeriodEnd: timestamp.nullable(),
      accessUntil: timestamp.nullable(),
      access: accessLevelSchema,
      deletesAt: timestamp.nullable(),
      // Set while a cancellation waits for the end of the paid period; resuming clears it.
      // While a payment is overdue it is set in the owner's view only, read from Stripe.
      cancelsAt: timestamp.nullable(),
    })
    .nullable(),
  usage: z.object({
    // Active employees of active clients. Until a trial ends, the trial's limits apply, a plan
    // chosen during it or not.
    employees: billingUsageMeterSchema,
    members: billingUsageMeterSchema,
    // The subscription's month, from the day it renews (ADR 029).
    smsThisMonth: billingSmsUsageSchema,
  }),
  catalogue: billingCatalogueSchema,
  // The owner's alone (ADR 029): null for the other members and for an impersonating admin.
  owner: z
    .object({
      // Null without a renewing subscription.
      nextPayment: billingAmountsSchema.extend({ at: timestamp }).nullable(),
      smsOverageCents: cents.nullable(),
      card: z
        .object({ brand: z.string(), last4: z.string(), expMonth: z.int(), expYear: z.int() })
        .nullable(),
      invoiceEmail: z.email().nullable(),
      // Where the invoices go while `invoiceEmail` is null.
      ownerEmail: z.email().nullable(),
      // A downgrade or removal waiting for the renewal.
      scheduledChange: billingChoiceSchema.extend({ at: timestamp }).nullable(),
      // The fewest packs and extra members each plan needs today, and what keeps it out.
      choices: z.object({ start: choiceLimitsSchema, profesional: choiceLimitsSchema }),
      invoices: z.array(billingInvoiceSchema),
    })
    .nullable(),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

/** `reason` values on billing errors, so the SPA can word them itself. */
export const billingErrorReasons = [
  ...billingChoiceProblemReasonSchema.options,
  'subscription_exists',
  'already_subscribed',
  'checkout_in_progress',
  'no_subscription',
  'enterprise_plan',
  'company_details_missing',
  'not_canceling',
  'unchanged',
  'pdf_pending',
] as const;
export type BillingErrorReason = (typeof billingErrorReasons)[number];
