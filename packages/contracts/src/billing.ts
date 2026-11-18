import { z } from 'zod';

import { billingExtrasSchema } from './extras';
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
export const priceVersion = 'v2';

export const billingProductKeySchema = z.enum([
  'start',
  'profesional',
  'sms_overage',
  'credits_extra',
]);
export type BillingProductKey = z.infer<typeof billingProductKeySchema>;

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

const intervalKeys: Record<BillingInterval, string> = { month: 'monthly', year: 'annual' };

/** Annual pays ten months for twelve, each rounded down to a whole euro (ADR 029). */
export function annualCents(monthlyCents: number) {
  return Math.floor(((monthlyCents / 100) * 10) / 12) * 12 * 100;
}

export const smsCodesFor = (step: number) => step / 5;

/** AI credits a month: two for every employee of the step, plus 250; they do not carry over. */
export const creditsFor = (step: number) => 2 * step + 250;

/** AI credits granted once, at the first payment, that never expire. */
export const welcomeCreditsFor = (step: number) => Math.min(10 * step, 10_000);

export interface PlanStep {
  employees: number;
  prices: Record<BillingInterval, CataloguePrice>;
  monthlySms: number;
  monthlyCredits: number;
  welcomeCredits: number;
}

export interface PlanTerms {
  key: PaidPlan;
  name: string;
  /** Users, the owner included; fixed, none can be bought. */
  members: number;
  steps: PlanStep[];
}

function step(plan: PaidPlan, employees: number, monthlyEuros: number): PlanStep {
  const price = (interval: BillingInterval, unitAmount: number): CataloguePrice => ({
    lookupKey: `${plan}_${employees}_${intervalKeys[interval]}_${priceVersion}`,
    product: plan,
    interval,
    unitAmount,
    usage: 'licensed',
  });
  return {
    employees,
    prices: {
      month: price('month', monthlyEuros * 100),
      year: price('year', annualCents(monthlyEuros * 100)),
    },
    monthlySms: smsCodesFor(employees),
    monthlyCredits: creditsFor(employees),
    welcomeCredits: welcomeCreditsFor(employees),
  };
}

export const billingPlans: Record<PaidPlan, PlanTerms> = {
  start: {
    key: 'start',
    name: 'SSM Ușor Start',
    members: 3,
    steps: [step('start', 250, 39), step('start', 500, 59), step('start', 750, 79)],
  },
  profesional: {
    key: 'profesional',
    name: 'SSM Ușor Profesional',
    members: 10,
    steps: [
      step('profesional', 500, 89),
      step('profesional', 1000, 119),
      step('profesional', 1500, 149),
      step('profesional', 2000, 179),
      step('profesional', 3000, 239),
      step('profesional', 4000, 299),
      step('profesional', 5000, 359),
    ],
  },
};

export const paidPlans = Object.keys(billingPlans) as PaidPlan[];

export function planStep(plan: PaidPlan, employees: number): PlanStep | undefined {
  return billingPlans[plan].steps.find((candidate) => candidate.employees === employees);
}

export function stepFor(plan: PaidPlan, employees: number): PlanStep | undefined {
  return billingPlans[plan].steps.find((candidate) => candidate.employees >= employees);
}

export const lastStep = (plan: PaidPlan) => billingPlans[plan].steps.at(-1)!;

/** Past these, an organization needs Enterprise, which is sold by email (ADR 029). */
export const selfServeLimits = {
  employees: lastStep('profesional').employees,
  members: billingPlans.profesional.members,
} as const;

// Monthly on every plan, annual ones too, which makes an annual subscription mixed-interval. On
// every subscription, so that turning extras on changes none; while they are off nothing is
// reported to its meter, and it bills nothing (ADR 029).
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
    lookupKey: `sms_overage_monthly_${priceVersion}`,
    product: 'sms_overage',
    interval: 'month',
    unitAmount: 10,
    usage: 'metered',
  },
};

/** AI credits past the month's and the welcome ones, sold in blocks of 100; one unit is a block. */
export const creditsExtra: {
  key: 'credits_extra';
  name: string;
  meterEventName: string;
  blockCredits: number;
  price: CataloguePrice;
} = {
  key: 'credits_extra',
  name: 'Credite AI peste cele incluse în plan, câte 100',
  meterEventName: 'credits_extra_blocks',
  blockCredits: 100,
  price: {
    lookupKey: `credits_extra_monthly_${priceVersion}`,
    product: 'credits_extra',
    interval: 'month',
    unitAmount: 150,
    usage: 'metered',
  },
};

export const meteredProducts = [smsOverage, creditsExtra];

export const catalogueProducts: CatalogueProduct[] = [
  ...Object.values(billingPlans),
  ...meteredProducts,
].map(({ key, name }) => ({ key, name }));

export const cataloguePrices: CataloguePrice[] = [
  ...Object.values(billingPlans).flatMap((plan) =>
    plan.steps.flatMap(({ prices }) => [prices.month, prices.year])
  ),
  ...meteredProducts.map((product) => product.price),
];

const billingChoiceShape = z.object({
  plan: paidPlanSchema,
  step: z.int().min(1),
  interval: billingIntervalSchema,
});

export const billingChoiceSchema = billingChoiceShape.refine(
  (choice) => planStep(choice.plan, choice.step) !== undefined,
  { message: 'Not a step of this plan.', path: ['step'] }
);
export type BillingChoice = z.infer<typeof billingChoiceSchema>;

export const billingChoiceProblemReasonSchema = z.enum([
  // Today's employees are past the plan's last step: Start's 750, or Profesional's 5,000.
  'employees_over_plan',
  'members_over_plan',
  'step_below_need',
  // An annual change while an earlier one, charged now, still waits for its payment: the two go
  // one after the other.
  'split_change',
]);
export type BillingChoiceProblemReason = z.infer<typeof billingChoiceProblemReasonSchema>;

export const billingChoiceProblemSchema = z.object({
  reason: billingChoiceProblemReasonSchema,
  minimum: z.int().min(0).optional(),
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
  choice: billingChoiceShape,
  // Empty when the choice may be bought; otherwise creating or changing to it answers 409.
  problems: z.array(billingChoiceProblemSchema),
  // The plan's smallest step that covers today's employees; null when none of its steps does.
  minimumStep: z.int().nullable(),
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

export const changeSubscriptionRequestSchema = billingChoiceShape
  .extend({
    // The preview's `prorationDate`; one older than an hour, or in the future, is replaced by now.
    prorationDate: timestamp.optional(),
  })
  .refine((choice) => planStep(choice.plan, choice.step) !== undefined, {
    message: 'Not a step of this plan.',
    path: ['step'],
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

// The active employees are past the step (ADR 029). Until `lastDay` ends, in Romanian time, new
// employees are still added; after it, while still over, nothing that adds one is accepted.
export const employeesOverStepSchema = z.object({
  since: timestamp,
  lastDay: z.iso.date(),
  blocked: z.boolean(),
});
export type EmployeesOverStep = z.infer<typeof employeesOverStepSchema>;

// The `reason` of the 403 for adding employees, or bringing them back, past the month over the step.
export const employeesOverStepReason = 'employees_over_step';

/** A tester's trial sends this many signing codes a month, with a hard stop (ADR 029). */
export const testerMonthlySms = 300;

/** Why an SMS was not sent, as `reason` carries it on the refusal. */
export const smsRefusalReasons = [
  // A trial without a chosen plan or the tester switch, or one that has ended.
  'sms_trial',
  // SMS go to Romanian numbers (+40) only.
  'sms_foreign_number',
  // The month's signing codes are used up, and extras are off or at their ceiling.
  'sms_allowance_reached',
] as const;
export const smsRefusalReasonSchema = z.enum(smsRefusalReasons);
export type SmsRefusalReason = z.infer<typeof smsRefusalReasonSchema>;

/**
 * `none`: no SMS goes at all; `near`: from 80 % of what is included; `extra`: all included used,
 * and codes go on as extras within the owner's ceiling; `stopped`: all used, and extras are off or
 * at their ceiling.
 */
export const smsUsageStateSchema = z.enum(['ok', 'near', 'extra', 'stopped', 'none']);
export type SmsUsageState = z.infer<typeof smsUsageStateSchema>;

export const billingSmsUsageSchema = z.object({
  // Signing codes sent by SMS this month; the other kinds are not counted.
  used: z.int().min(0),
  // The plan's codes plus those granted by hand; null where nothing limits them.
  included: z.int().min(0).nullable(),
  allowance: z.int().min(0).nullable(),
  granted: z.int().min(0),
  // Codes past `included` this month, sent as extras and billed on the next invoice.
  overage: z.int().min(0),
  // The owner turned SMS extras on and they apply now: past `included`, codes go on by SMS.
  extrasOn: z.boolean(),
  // Null while no SMS goes.
  periodStart: timestamp.nullable(),
  periodEnd: timestamp.nullable(),
  state: smsUsageStateSchema,
});
export type BillingSmsUsage = z.infer<typeof billingSmsUsageSchema>;

/** A trial's credits for the whole trial, without a monthly reset (ADR 030). */
export const trialCredits = 300;

/** A tester's trial has this many credits a month, with a hard stop and no gift (ADR 029). */
export const testerMonthlyCredits = 1500;

/** What an import uses (ADR 030): one credit per photograph or page read. */
export const importCredits = {
  // Reading a client's documents, whatever their length.
  clientReading: 25,
  perPage: 1,
  // Reading a pack's own instructions for the library, each time they are read (ADR 034).
  ownInstructions: { ssm: 25, su: 10 },
  // Reading a pack's risk evaluations, each time they are read: 15, not 10, because the dearest
  // reference reading cost $0.095, past the $0.08 that ADR 036 set for 10.
  riskEvaluations: 15,
  // Reading one product's safety data sheet in the substance dialog, outside any import (ADR 030).
  safetySheet: 3,
} as const;

/**
 * `unlimited`: nothing limits the credits; `near`: what is left, the gift included, is under a
 * fifth of the month's; `out`: nothing is left; `negative`: the balance is below zero, and the
 * shortfall comes off the next month.
 */
export const creditsUsageStateSchema = z.enum(['ok', 'near', 'out', 'negative', 'unlimited']);
export type CreditsUsageState = z.infer<typeof creditsUsageStateSchema>;

export const billingCreditsUsageSchema = z.object({
  // The month's credits used, net of refunds; what the gift paid for is not in it.
  used: z.int().min(0),
  // The allowance plus the credits added by hand; null where nothing limits them.
  included: z.int().min(0).nullable(),
  allowance: z.int().min(0).nullable(),
  granted: z.int().min(0),
  // Taken off this month because the month before ended below zero.
  shortfall: z.int().min(0),
  // `included` less `shortfall` and `used`; below zero by at most 150. Null where nothing limits.
  left: z.int().nullable(),
  // The welcome gift's credits left; used once the month's are gone.
  giftLeft: z.int().min(0),
  // Credits bought this month in blocks of 100, as extras; inside `left` until used.
  extra: z.int().min(0),
  // What the extras' ceiling can still buy this month, in whole blocks; 0 while extras are off.
  extraLeft: z.int().min(0),
  // The owner turned AI extras on and they apply now.
  extrasOn: z.boolean(),
  // `trial`: one allowance for the whole trial, which does not renew; `month`: renews at the end.
  period: z.enum(['trial', 'month']),
  periodStart: timestamp,
  periodEnd: timestamp,
  state: creditsUsageStateSchema,
});
export type BillingCreditsUsage = z.infer<typeof billingCreditsUsageSchema>;

export const billingInvoiceSchema = z.object({
  stripeInvoiceId: z.string(),
  kind: z.enum(['invoice', 'proforma']),
  // Oblio's series and number, such as SSMUSOR-0001; null until Oblio has issued it.
  number: z.string().nullable(),
  issuedAt: timestamp.nullable(),
  // With VAT; negative for a storno.
  amountCents: cents,
  // Without VAT, as the issued invoice prints it; null until it is issued, and for an invoice
  // issued before it was kept.
  subtotalCents: cents.nullable(),
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
      members: z.int(),
      steps: z.array(
        z.object({
          employees: z.int(),
          prices: pricePair,
          monthlySms: z.int(),
          monthlyCredits: z.int(),
          welcomeCredits: z.int(),
        })
      ),
    })
  ),
  smsOverageCents: cents,
  creditBlockCents: cents,
});
export type BillingCatalogue = z.infer<typeof billingCatalogueSchema>;

const choiceLimitsSchema = z.object({
  minimumStep: z.int().nullable(),
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
      // The step of the chosen plan; null without one, and on Enterprise.
      step: z.int().nullable(),
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
    // Null while the employees are within the step, and where nothing limits them.
    employeesOverStep: employeesOverStepSchema.nullable(),
    members: billingUsageMeterSchema,
    // Open invitations, each holding one of the plan's users until accepted, revoked or expired.
    invitations: z.int().min(0),
    // The subscription's month, from the day it renews (ADR 029).
    smsThisMonth: billingSmsUsageSchema,
    // Import credits, on the same month (ADR 030); a trial's last the whole trial.
    creditsThisMonth: billingCreditsUsageSchema,
  }),
  catalogue: billingCatalogueSchema,
  extras: billingExtrasSchema,
  // The owner's alone (ADR 029): null for the other members and for an impersonating admin.
  owner: z
    .object({
      // Null without a renewing subscription.
      nextPayment: billingAmountsSchema.extend({ at: timestamp }).nullable(),
      smsOverageCents: cents.nullable(),
      // The extras already on Stripe's preview of the next payment, without VAT; its meters lag
      // behind the extras counted here by a little. Null without a renewing subscription.
      extrasInPreviewCents: cents.nullable(),
      card: z
        .object({ brand: z.string(), last4: z.string(), expMonth: z.int(), expYear: z.int() })
        .nullable(),
      invoiceEmail: z.email().nullable(),
      // Where the invoices go while `invoiceEmail` is null.
      ownerEmail: z.email().nullable(),
      // A downgrade or removal waiting for the renewal.
      scheduledChange: billingChoiceShape.extend({ at: timestamp }).nullable(),
      // The smallest step each plan needs today, and what keeps it out.
      choices: z.object({ start: choiceLimitsSchema, profesional: choiceLimitsSchema }),
      invoices: z.array(billingInvoiceSchema),
      // The „Plătitor de TVA” of Date firmă, as it is today, not as it was on each invoice.
      vatPayer: z.boolean(),
    })
    .nullable(),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;
