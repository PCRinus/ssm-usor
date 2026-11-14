import {
  type BillingChoice,
  type BillingCreditsUsage,
  type BillingOverview,
  billingPlans,
  type BillingPreview,
  type BillingSmsUsage,
  planStep,
  smsOverage,
  type SubscriptionSummary,
  vatPercent,
} from '@ssm-usor/contracts';

export const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect Consult' };

export const inDays = (days: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();
};

export function meFor({
  role = 'owner',
  subscription = null,
  impersonating = false,
  smsThisMonth = null,
}: {
  role?: 'owner' | 'specialist';
  subscription?: SubscriptionSummary | null;
  impersonating?: boolean;
  smsThisMonth?: BillingSmsUsage | null;
} = {}) {
  return {
    user: { id: 'user-one', email: 'ana@protectconsult.test' },
    profile: { fullName: 'Ana Popescu', termsVersion: null, termsAcceptedAt: null },
    membership: { organization, role },
    impersonation: impersonating
      ? {
          targetMemberId: '0e0c1d36-5a4e-4b19-9d4b-8a1f1b6f9f10',
          targetOrganizationId: organization.id,
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          targetName: 'Ana Popescu',
        }
      : null,
    subscription,
    smsThisMonth,
  };
}

/** The month's AI credits as the API reports them, on Profesional at 1,500 unless told otherwise. */
export function creditsUsage(overrides: Partial<BillingCreditsUsage> = {}): BillingCreditsUsage {
  return {
    used: 640,
    included: 3250,
    allowance: 3250,
    granted: 0,
    shortfall: 0,
    left: 2610,
    giftLeft: 8640,
    period: 'month',
    periodStart: inDays(-17),
    periodEnd: inDays(14),
    state: 'ok',
    ...overrides,
  };
}

/** The month's signing codes as the API reports them, on a paid plan unless told otherwise. */
export function smsUsage(overrides: Partial<BillingSmsUsage> = {}): BillingSmsUsage {
  return {
    used: 0,
    included: 300,
    allowance: 300,
    granted: 0,
    cap: null,
    capFactor: null,
    overage: 0,
    periodStart: inDays(-17),
    periodEnd: inDays(14),
    state: 'ok',
    ...overrides,
  };
}

export const catalogue: BillingOverview['catalogue'] = {
  currency: 'eur',
  vatPercent,
  plans: (['start', 'profesional'] as const).map((key) => ({
    key,
    name: billingPlans[key].name,
    members: billingPlans[key].members,
    steps: billingPlans[key].steps.map((step) => ({
      employees: step.employees,
      prices: { month: step.prices.month.unitAmount, year: step.prices.year.unitAmount },
      monthlySms: step.monthlySms,
      monthlyCredits: step.monthlyCredits,
      welcomeCredits: step.welcomeCredits,
    })),
  })),
  smsOverageCents: smsOverage.price.unitAmount,
};

type Subscription = NonNullable<BillingOverview['subscription']>;
type Owner = NonNullable<BillingOverview['owner']>;

export const trialSubscription = (days = 12): Subscription => ({
  plan: 'profesional',
  planChosen: false,
  status: 'trialing',
  interval: null,
  step: null,
  trialEndsAt: inDays(days),
  currentPeriodEnd: null,
  accessUntil: inDays(days),
  access: 'full',
  deletesAt: null,
  cancelsAt: null,
});

export const trialChosenSubscription = (): Subscription => ({
  ...trialSubscription(12),
  plan: 'start',
  planChosen: true,
  interval: 'month',
  step: 500,
  accessUntil: inDays(26),
  currentPeriodEnd: inDays(12),
});

export const activeSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  plan: 'profesional',
  planChosen: true,
  status: 'active',
  interval: 'year',
  step: 1500,
  trialEndsAt: null,
  currentPeriodEnd: inDays(126),
  accessUntil: null,
  access: 'full',
  deletesAt: null,
  cancelsAt: null,
  ...overrides,
});

export const noChoices: Owner['choices'] = {
  start: { minimumStep: 500, problems: [] },
  profesional: { minimumStep: 500, problems: [] },
};

export const ownerPart = (overrides: Partial<Owner> = {}): Owner => ({
  nextPayment: null,
  smsOverageCents: null,
  card: null,
  invoiceEmail: null,
  ownerEmail: 'ana@protectconsult.test',
  scheduledChange: null,
  choices: noChoices,
  invoices: [],
  ...overrides,
});

export function overviewWith({
  subscription,
  owner = null,
  employees = 312,
  members = 1,
  invitations = 0,
  limits,
  sms,
  credits,
}: {
  subscription: Subscription | null;
  owner?: Owner | null;
  employees?: number;
  members?: number;
  invitations?: number;
  limits?: { employees: number | null; members: number | null; sms: number | null };
  sms?: Partial<BillingSmsUsage>;
  credits?: Partial<BillingCreditsUsage>;
}): BillingOverview {
  return {
    subscription,
    usage: {
      employees: { used: employees, limit: limits?.employees ?? 5000 },
      members: { used: members, limit: limits?.members ?? 10 },
      invitations,
      smsThisMonth: {
        used: 0,
        included: limits?.sms ?? 0,
        allowance: limits?.sms ?? 0,
        granted: 0,
        cap: null,
        capFactor: null,
        overage: 0,
        periodStart: null,
        periodEnd: null,
        state: limits?.sms ? 'ok' : 'none',
        ...sms,
      },
      creditsThisMonth: {
        used: 0,
        included: 300,
        allowance: 300,
        granted: 0,
        shortfall: 0,
        left: 300,
        giftLeft: 0,
        period: 'trial',
        periodStart: '2026-10-01T08:00:00.000Z',
        periodEnd: '2026-10-31T08:00:00.000Z',
        state: 'ok',
        ...credits,
      },
    },
    catalogue,
    owner,
  };
}

export const summaryOf = (subscription: Subscription | null): SubscriptionSummary | null =>
  subscription && {
    plan: subscription.plan,
    planChosen: subscription.planChosen,
    step: subscription.step,
    status: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    accessUntil: subscription.accessUntil,
    access: subscription.access,
    deletesAt: subscription.deletesAt,
  };

const cents = (choice: BillingChoice) =>
  planStep(choice.plan, choice.step)!.prices[choice.interval].unitAmount;

export function previewFor(
  choice: BillingChoice,
  {
    dueToday = 0,
    appliesAt = inDays(12),
    firstChargeAt = inDays(12),
    problems = [],
    unchanged = false,
    proration = null,
    prorationDate = null,
  }: {
    dueToday?: number;
    appliesAt?: string;
    firstChargeAt?: string;
    problems?: BillingPreview['problems'];
    unchanged?: boolean;
    proration?: BillingPreview['proration'];
    prorationDate?: string | null;
  } = {}
): BillingPreview {
  const subtotal = cents(choice);
  const vat = Math.round((subtotal * vatPercent) / 100);
  const dueVat = Math.round((dueToday * vatPercent) / 100);
  return {
    choice,
    problems,
    minimumStep: 500,
    unchanged,
    recurring: {
      interval: choice.interval,
      lines: [],
      subtotalCents: subtotal,
      vatCents: vat,
      totalCents: subtotal + vat,
    },
    appliesAt,
    dueToday: { subtotalCents: dueToday, vatCents: dueVat, totalCents: dueToday + dueVat },
    proration,
    nextRenewal: {
      at: firstChargeAt,
      subtotalCents: subtotal,
      vatCents: vat,
      totalCents: subtotal + vat,
    },
    firstChargeAt,
    prorationDate,
  };
}
