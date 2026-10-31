import {
  type BillingChoice,
  type BillingOverview,
  billingPlans,
  type BillingPreview,
  employeePacks,
  extraMember,
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
}: {
  role?: 'owner' | 'specialist';
  subscription?: SubscriptionSummary | null;
  impersonating?: boolean;
} = {}) {
  return {
    user: { id: 'user-one', email: 'ana@protectconsult.test' },
    profile: { fullName: 'Ana Popescu', termsVersion: null, termsAcceptedAt: null },
    membership: { organization, role },
    impersonation: impersonating
      ? {
          targetMemberId: '0e0c1d36-5a4e-4b19-9d4b-8a1f1b6f9f10',
          targetOrganizationId: organization.id,
        }
      : null,
    subscription,
  };
}

const prices = (key: 'start' | 'profesional') => ({
  month: billingPlans[key].prices.month.unitAmount,
  year: billingPlans[key].prices.year.unitAmount,
});

export const catalogue: BillingOverview['catalogue'] = {
  currency: 'eur',
  vatPercent,
  plans: (['start', 'profesional'] as const).map((key) => ({
    key,
    name: billingPlans[key].name,
    prices: prices(key),
    includedEmployees: billingPlans[key].includedEmployees,
    includedMembers: billingPlans[key].includedMembers,
    maxMembers: billingPlans[key].maxMembers,
    monthlySms: billingPlans[key].monthlySms,
    employeePack: billingPlans[key].employeePack,
    maxEmployeePacks: billingPlans[key].maxEmployeePacks,
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

type Subscription = NonNullable<BillingOverview['subscription']>;
type Owner = NonNullable<BillingOverview['owner']>;

export const trialSubscription = (days = 12): Subscription => ({
  plan: 'profesional',
  planChosen: false,
  status: 'trialing',
  interval: null,
  employeePacks: 0,
  extraMembers: 0,
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
  employeePacks: 2,
  accessUntil: inDays(26),
  currentPeriodEnd: inDays(12),
});

export const activeSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  plan: 'profesional',
  planChosen: true,
  status: 'active',
  interval: 'year',
  employeePacks: 1,
  extraMembers: 1,
  trialEndsAt: null,
  currentPeriodEnd: inDays(126),
  accessUntil: null,
  access: 'full',
  deletesAt: null,
  cancelsAt: null,
  ...overrides,
});

export const noChoices: Owner['choices'] = {
  start: { minimums: { employeePacks: 2, extraMembers: 0 }, problems: [] },
  profesional: { minimums: { employeePacks: 0, extraMembers: 0 }, problems: [] },
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
  limits,
}: {
  subscription: Subscription | null;
  owner?: Owner | null;
  employees?: number;
  members?: number;
  limits?: { employees: number | null; members: number | null; sms: number | null };
}): BillingOverview {
  return {
    subscription,
    usage: {
      employees: { used: employees, limit: limits?.employees ?? 1500 },
      members: { used: members, limit: limits?.members ?? 3 },
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
    status: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    accessUntil: subscription.accessUntil,
    access: subscription.access,
    deletesAt: subscription.deletesAt,
  };

function cents(choice: BillingChoice) {
  const plan = billingPlans[choice.plan];
  const pack = employeePacks[plan.employeePack];
  return (
    plan.prices[choice.interval].unitAmount +
    pack.prices[choice.interval].unitAmount * choice.employeePacks +
    extraMember.prices[choice.interval].unitAmount * choice.extraMembers
  );
}

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
    minimums: { employeePacks: 0, extraMembers: 0 },
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
