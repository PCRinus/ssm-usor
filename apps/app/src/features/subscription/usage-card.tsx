import { type BillingOverview, billingPlans } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

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
import { roDate } from './subscription-copy';
import { currentChoice, hasLiveSubscription, type SubscriptionView } from './use-billing';

interface Meter {
  key: 'employees' | 'members' | 'sms';
  label: string;
  used: number | null;
  limit: number | null;
  value?: string;
  ticks?: number[];
  hint: string;
  action?: { label: string; search: { packs?: number; members?: number } };
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
}: {
  overview: BillingOverview;
  view: SubscriptionView;
  canAct: boolean;
}) {
  const subscription = overview.subscription;
  const choice = currentChoice(subscription);
  const owner = overview.owner !== null;
  const live = hasLiveSubscription(subscription) && view !== 'readOnly';
  const employees = overview.usage.employees.used ?? 0;
  const members = overview.usage.members.used ?? 0;
  const smsPrice = formatEuro(overview.catalogue.smsOverageCents);

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
  const smsLimit = planLimits ? billingPlans[choice.plan].monthlySms : sms.included;
  const smsUsed = sms.used;
  let smsHint: string;
  if (view === 'readOnly') {
    smsHint = 'Cât contul e doar pentru citire, nu se mai trimit SMS-uri.';
  } else if (smsLimit === null) {
    smsHint = 'Fără limită.';
  } else if (smsLimit === 0) {
    smsHint =
      'Codurile de conectare și de semnare pleacă pe email. SMS-urile pornesc când alegi un plan.';
  } else {
    const after =
      sms.cap === null
        ? `Se numără doar codurile de semnare. Peste ${formatCount(smsLimit)}, codul pleacă pe email, iar cine nu are email îl cere specialistului.`
        : `Se numără doar codurile de semnare. Peste ${formatCount(smsLimit)}, fiecare costă ${smsPrice} și apare pe factura următoare, până la ${formatCount(sms.cap)} pe lună.`;
    smsHint =
      view === 'trialChosen' ? `SMS-urile au pornit odată cu alegerea planului. ${after}` : after;
  }

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
      used: view === 'readOnly' || smsLimit === 0 ? null : smsUsed,
      limit: view === 'readOnly' || smsLimit === 0 ? null : smsLimit,
      hint: smsHint,
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
          const value =
            meter.value ??
            (bar
              ? `${formatCount(meter.used!)} din ${formatCount(meter.limit!)}`
              : meter.used !== null && meter.key !== 'sms'
                ? formatCount(meter.used)
                : null);
          return (
            <div key={meter.key} data-testid={`meter-${meter.key}`} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{meter.label}</span>
                {value && (
                  <span
                    className={
                      over
                        ? 'font-semibold whitespace-nowrap text-warning-foreground tabular-nums'
                        : 'font-semibold whitespace-nowrap tabular-nums'
                    }
                  >
                    {value}
                  </span>
                )}
              </div>
              {bar && (
                <UsageBar
                  used={meter.used!}
                  limit={meter.limit!}
                  ticks={meter.ticks}
                  label={meter.label}
                />
              )}
              <p
                className={
                  over
                    ? 'text-[13px] leading-relaxed text-warning-foreground'
                    : 'text-[13px] leading-relaxed text-muted-foreground'
                }
              >
                {meter.hint}
              </p>
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
    </BillingCard>
  );
}
