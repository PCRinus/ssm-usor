import { type BillingOverview, billingPlans } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Gift } from 'lucide-react';

import {
  employeeLimitOf,
  formatCount,
  formatEuro,
  memberLimitOf,
  packOf,
  packsLabel,
  packsNeeded,
  shortPlanNames,
} from './billing-format';
import { BillingCard, UsageBar } from './billing-ui';
import {
  creditsExplained,
  creditsLabel,
  type CreditsMeter,
  creditsMeterFor,
  creditsReaderOf,
  type GiftPanel,
  giftPanelFor,
} from './credits-copy';
import { toneInks } from './meter-tones';
import { type MeterTone, type SmsMeter, smsMeterFor, stopOf } from './sms-copy';
import { roDate } from './subscription-copy';
import { currentChoice, hasLiveSubscription, type SubscriptionView } from './use-billing';

interface Meter {
  key: 'employees' | 'members' | 'sms' | 'credits';
  label: string;
  used: number | null;
  limit: number | null;
  value?: string;
  valueShort?: string | null;
  hintShort?: string | null;
  ticks?: number[];
  tone?: MeterTone;
  hint: string;
  action?: { label: string; search: { packs?: number; members?: number } };
  raiseCap?: boolean;
}

function periodLabel(overview: BillingOverview, view: SubscriptionView) {
  const subscription = overview.subscription;
  const choice = currentChoice(subscription);
  const end = subscription?.currentPeriodEnd;
  switch (view) {
    case 'none':
    case 'enterprise':
      return 'Fără limite';
    case 'trial':
      return 'În perioada de probă';
    case 'trialChosen':
      return choice && subscription?.trialEndsAt
        ? `Limitele ${shortPlanNames[choice.plan]}, de pe ${roDate(subscription.trialEndsAt)}`
        : 'În perioada de probă';
    case 'readOnly':
      return 'Ce ai în cont';
    default: {
      if (!end) return 'Luna aceasta';
      if (choice?.interval === 'year') return `Anul plătit, până pe ${roDate(end)}`;
      const start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      const last = new Date(new Date(end).getTime() - 86_400_000);
      return `Luna ${roDate(start.toISOString()).slice(0, 5)} – ${roDate(last.toISOString())}`;
    }
  }
}

export function UsageCard({
  overview,
  view,
  canAct,
  onRaiseCap,
}: {
  overview: BillingOverview;
  view: SubscriptionView;
  canAct: boolean;
  onRaiseCap: () => void;
}) {
  const subscription = overview.subscription;
  const choice = currentChoice(subscription);
  const owner = overview.owner !== null;
  const live = hasLiveSubscription(subscription) && view !== 'readOnly';
  const employees = overview.usage.employees.used ?? 0;
  const members = overview.usage.members.used ?? 0;

  // Until a trial ends the API counts against the trial's limits; once a plan is chosen, the
  // tab shows the limits that plan brings at the trial's end.
  const planLimits = choice && view === 'trialChosen';
  const employeeLimit = planLimits ? employeeLimitOf(choice) : overview.usage.employees.limit;
  const memberLimit = planLimits ? memberLimitOf(choice) : overview.usage.members.limit;

  let employeeHint: string;
  let ticks: number[] = [];
  if (!choice || view === 'trial') {
    const startPacks = packsNeeded('start', employees);
    employeeHint =
      employeeLimit === null
        ? 'Fără limită.'
        : employees <= billingPlans.start.includedEmployees
          ? 'Start include 250 de angajați, Profesional 1.500.'
          : startPacks <= (billingPlans.start.maxEmployeePacks ?? 0)
            ? `Start include 250; pentru ${formatCount(employees)} îți trebuie ${packsLabel('start', startPacks)}.`
            : 'Start acoperă cel mult 600 de angajați; Profesional include 1.500.';
  } else {
    const included = billingPlans[choice.plan].includedEmployees;
    const size = packOf(choice.plan).employees;
    const limit = employeeLimitOf(choice);
    const composition =
      choice.employeePacks > 0
        ? `${formatCount(included)} în plan și ${packsLabel(choice.plan, choice.employeePacks)}`
        : `${formatCount(included)} în plan`;
    employeeHint =
      view === 'readOnly'
        ? `Cât acoperea ${shortPlanNames[choice.plan]}: ${composition}.`
        : employees > limit
          ? `Cu ${formatCount(employees - limit)} peste limită. ${composition}.`
          : `${composition}.`;
    for (let boundary = included; boundary < limit; boundary += size) {
      ticks.push(boundary / limit);
    }
  }
  if (ticks.length > 8) ticks = [];

  let memberHint: string;
  if (view === 'readOnly') {
    memberHint = 'Colegii văd tot, dar nu pot schimba nimic.';
  } else if (!choice || view === 'trial') {
    memberHint = 'Start include un utilizator, Profesional trei.';
  } else {
    const included = billingPlans[choice.plan].includedMembers;
    const base =
      choice.extraMembers > 0
        ? `${included} în plan și ${choice.extraMembers} în plus.`
        : `${included} în plan.`;
    const full = memberLimit !== null && members >= memberLimit;
    const canAdd =
      billingPlans[choice.plan].maxMembers === null ||
      memberLimitOf(choice) < (billingPlans[choice.plan].maxMembers ?? 0);
    memberHint = !owner
      ? full
        ? `${base} Pentru un coleg nou, administratorul adaugă un utilizator.`
        : base
      : canAdd
        ? `${base} ${choice.plan === 'start' ? 'Al doilea utilizator' : 'Fiecare utilizator nou'} costă ${formatEuro(overview.catalogue.extraMember.prices[choice.interval])} ${choice.interval === 'year' ? 'pe an' : 'pe lună'}.`
        : `${base} Start are cel mult 2 utilizatori.`;
  }

  const sms = overview.usage.smsThisMonth;
  const smsMeter: SmsMeter =
    view === 'readOnly'
      ? {
          used: null,
          limit: null,
          value: null,
          tone: 'normal',
          hint: 'Cât contul e doar pentru citire, nu se mai trimit SMS-uri.',
          raiseCap: false,
        }
      : smsMeterFor(sms, { owner, stop: stopOf(sms, Boolean(subscription?.planChosen)) });

  const credits = overview.usage.creditsThisMonth;
  const creditsMeter: CreditsMeter =
    view === 'readOnly'
      ? {
          used: null,
          limit: null,
          value: '',
          valueShort: null,
          tone: 'normal',
          hint: 'Cât contul e doar pentru citire, nu se mai pornesc importuri.',
          hintShort: null,
        }
      : creditsMeterFor(
          credits,
          creditsReaderOf(credits, {
            planChosen: Boolean(subscription?.planChosen),
            nextMonthly: choice ? billingPlans[choice.plan].monthlyCredits : null,
          })
        );
  const paidPlan =
    choice && (view === 'active' || view === 'canceling' || view === 'pastDue')
      ? choice.plan
      : null;
  const gift =
    view === 'readOnly'
      ? null
      : giftPanelFor(credits, {
          paid: paidPlan !== null,
          welcomeCredits: paidPlan ? billingPlans[paidPlan].welcomeCredits : null,
        });

  const meters: Meter[] = [
    {
      key: 'employees',
      label: 'Angajați la clienți',
      used: employees,
      limit: employeeLimit,
      ticks,
      hint: employeeHint,
      action:
        canAct && live && choice && employeeLimit !== null && employees > employeeLimit
          ? {
              label: 'Adaugă un pachet',
              search: { packs: packsNeeded(choice.plan, employees) },
            }
          : undefined,
    },
    {
      key: 'members',
      label: 'Utilizatori',
      used: members,
      limit: memberLimit,
      hint: memberHint,
      action:
        canAct &&
        live &&
        choice &&
        memberLimit !== null &&
        members >= memberLimit &&
        (billingPlans[choice.plan].maxMembers === null ||
          memberLimitOf(choice) < (billingPlans[choice.plan].maxMembers ?? 0))
          ? { label: 'Adaugă un utilizator', search: { members: choice.extraMembers + 1 } }
          : undefined,
    },
    {
      key: 'sms',
      label: 'Coduri de semnare prin SMS',
      used: smsMeter.used,
      limit: smsMeter.limit,
      value: smsMeter.value ?? undefined,
      tone: smsMeter.tone,
      hint: smsMeter.hint,
      raiseCap: canAct && smsMeter.raiseCap,
    },
    {
      key: 'credits',
      label: creditsLabel,
      used: creditsMeter.used,
      limit: creditsMeter.limit,
      value: creditsMeter.value || undefined,
      valueShort: creditsMeter.valueShort,
      tone: creditsMeter.tone,
      hint: creditsMeter.hint,
      hintShort: creditsMeter.hintShort,
    },
  ];

  return (
    <BillingCard
      title="Cât folosești"
      help="organizatie.consum"
      aside={periodLabel(overview, view)}
      data-testid="usage-card"
      aria-label="Cât folosești"
    >
      <div className="grid gap-[18px]">
        {meters.map((meter) => {
          const bar = meter.used !== null && meter.limit !== null;
          const over = bar && meter.used! > meter.limit!;
          const ink = meter.tone ? toneInks[meter.tone] : over ? 'text-warning-foreground' : null;
          const value =
            meter.value ??
            (bar
              ? `${formatCount(meter.used!)} din ${formatCount(meter.limit!)}`
              : meter.used !== null && meter.key !== 'sms' && meter.key !== 'credits'
                ? formatCount(meter.used)
                : null);
          return (
            <div key={meter.key} data-testid={`meter-${meter.key}`} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{meter.label}</span>
                {value && (
                  <span className={cn('font-semibold whitespace-nowrap tabular-nums', ink)}>
                    {meter.valueShort ? (
                      <>
                        <span className="sm:hidden">{meter.valueShort}</span>
                        <span className="hidden sm:inline">{value}</span>
                      </>
                    ) : (
                      value
                    )}
                  </span>
                )}
              </div>
              {bar && (
                <UsageBar
                  used={meter.used!}
                  limit={meter.limit!}
                  ticks={meter.ticks}
                  label={meter.label}
                  tone={meter.tone}
                />
              )}
              <p
                data-testid={`meter-${meter.key}-hint`}
                className={cn(
                  'max-w-[68ch] text-[13px] leading-relaxed text-pretty',
                  ink ?? 'text-muted-foreground'
                )}
              >
                {meter.hintShort ? (
                  <>
                    <span className="sm:hidden">{meter.hintShort}</span>
                    <span className="hidden sm:inline">{meter.hint}</span>
                  </>
                ) : (
                  meter.hint
                )}
              </p>
              {meter.raiseCap && (
                <button
                  type="button"
                  onClick={onRaiseCap}
                  data-testid={`meter-${meter.key}-raise`}
                  className="inline-flex min-h-8 w-fit cursor-pointer items-center text-sm font-semibold underline-offset-2 hover:underline"
                >
                  Ridică limita
                </button>
              )}
              {meter.action && (
                <Link
                  to="/organization/subscription/choose"
                  search={meter.action.search}
                  data-testid={`meter-${meter.key}-action`}
                  className="inline-flex min-h-8 w-fit items-center text-sm font-semibold underline-offset-2 hover:underline"
                >
                  {meter.action.label}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {gift && <GiftPanelView gift={gift} />}
      {view !== 'readOnly' && credits.included !== null && (
        <p className="max-w-[68ch] border-t pt-3.5 text-[13px] leading-relaxed text-pretty text-muted-foreground">
          {creditsExplained}
        </p>
      )}
    </BillingCard>
  );
}

const giftLooks: Record<GiftPanel['look'], { panel: string; badge: string; value: string }> = {
  balance: {
    panel: 'border-success-border bg-success',
    badge: 'bg-brand-lime text-foreground',
    value: 'text-foreground',
  },
  promise: {
    panel: 'border-dashed border-success-foreground/45 bg-card',
    badge: 'bg-success text-success-foreground',
    value: 'text-foreground',
  },
  spent: {
    panel: 'border-border bg-muted/60',
    badge: 'bg-muted text-muted-foreground',
    value: 'text-muted-foreground',
  },
};

function GiftPanelView({ gift }: { gift: GiftPanel }) {
  const look = giftLooks[gift.look];
  return (
    <div
      data-testid="credits-gift"
      data-look={gift.look}
      className={cn(
        'flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl border px-3.5 py-3 sm:px-4 sm:py-3.5',
        look.panel
      )}
    >
      <span
        aria-hidden="true"
        className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', look.badge)}
      >
        <Gift className="size-[18px]" />
      </span>
      <div className="grid min-w-0 flex-[1_1_220px] gap-0.5">
        <span className="text-sm font-semibold">{gift.title}</span>
        <span className="text-[13px] leading-relaxed text-pretty text-muted-foreground">
          {gift.text}
        </span>
      </div>
      {gift.value !== null && (
        <strong
          className={cn('text-2xl leading-none font-bold tracking-tight tabular-nums', look.value)}
        >
          {gift.value}
        </strong>
      )}
    </div>
  );
}
