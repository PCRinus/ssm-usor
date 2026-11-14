import {
  type BillingOverview,
  billingPlans,
  type PaidPlan,
  selfServeLimits,
  stepFor,
} from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Gift } from 'lucide-react';

import { employeesLabel, formatCount, shortPlanNames, stepLabel } from './billing-format';
import { BillingCard, UsageBar } from './billing-ui';
import { nextStepAction, nextStepOf } from './checkout/checkout-choice';
import {
  creditsExplained,
  creditsLabel,
  type CreditsMeter,
  creditsMeterFor,
  creditsReaderOf,
  type GiftPanel,
  giftPanelFor,
} from './credits-copy';
import { creditsExtraMeter, smsExtraMeter } from './extras-copy';
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
  action?: { label: string; search: { step?: number; plan?: PaidPlan } };
  toExtra?: boolean;
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
    case 'trialChosen':
      return 'În perioada de probă';
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

  const inTrial = view === 'trial' || view === 'trialChosen';
  const employeeLimit = overview.usage.employees.limit;
  const memberLimit = overview.usage.members.limit;
  const next = choice ? nextStepOf(choice, employees) : null;
  const profesionalStep = stepFor('profesional', employees);

  let employeeHint: string;
  if (!choice || inTrial) {
    const startStep = stepFor('start', employees);
    employeeHint =
      employeeLimit === null
        ? 'Fără limită.'
        : startStep
          ? `Pentru ${employeesLabel(employees)}, treapta potrivită e de ${formatCount(startStep.employees)} pe Start sau de ${formatCount(stepFor('profesional', employees)!.employees)} pe Profesional.`
          : profesionalStep
            ? `Start acoperă cel mult 750 de lucrători; pe Profesional, treapta potrivită e de ${formatCount(profesionalStep.employees)}.`
            : `Peste ${employeesLabel(selfServeLimits.employees)}, scrie-ne pentru o ofertă.`;
  } else {
    const step = `Treapta ${stepLabel(choice.step)}`;
    employeeHint =
      view === 'readOnly'
        ? `Cât acoperea ${shortPlanNames[choice.plan]}: ${stepLabel(choice.step)}.`
        : employees > choice.step
          ? `Cu ${formatCount(employees - choice.step)} peste treaptă. Lucrezi mai departe cu tot ce ai.`
          : `${step}.`;
  }

  const invitations = overview.usage.invitations;
  const taken = members + invitations;
  const invited =
    invitations === 0 || view === 'readOnly'
      ? ''
      : invitations === 1
        ? 'O invitație în așteptare ține un loc. '
        : `${invitations} invitații în așteptare țin câte un loc. `;
  let memberHint: string;
  if (view === 'readOnly') {
    memberHint = 'Colegii văd tot, dar nu pot schimba nimic.';
  } else if (!choice || inTrial) {
    memberHint = `Start are ${billingPlans.start.members} utilizatori, Profesional ${billingPlans.profesional.members}.`;
  } else {
    const plan = billingPlans[choice.plan];
    const full = memberLimit !== null && taken >= memberLimit;
    memberHint = full
      ? choice.plan === 'start'
        ? `${shortPlanNames.start} are ${plan.members} utilizatori. Pentru un coleg nou, ${owner ? 'treci' : 'adminul trece'} pe Profesional, care are ${billingPlans.profesional.members}.`
        : `${shortPlanNames.profesional} are ${plan.members} utilizatori. Pentru mai mulți, scrie-ne pentru o ofertă.`
      : `${shortPlanNames[choice.plan]} are ${plan.members} utilizatori.`;
  }
  memberHint = invited + memberHint;

  const sms = overview.usage.smsThisMonth;
  const smsMeter: SmsMeter =
    view === 'readOnly'
      ? {
          used: null,
          limit: null,
          value: null,
          tone: 'normal',
          hint: 'Cât contul e doar pentru citire, nu se mai trimit SMS-uri.',
        }
      : smsMeterFor(sms, {
          owner,
          stop: stopOf(subscription),
          extrasOn: overview.extras.sms.enabled && overview.extras.unavailable === null,
        });

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
          creditsReaderOf(credits, { planChosen: Boolean(subscription?.planChosen) })
        );
  const paid = choice !== null && (view === 'active' || view === 'canceling' || view === 'pastDue');
  const gift = view === 'readOnly' ? null : giftPanelFor(credits, { paid });

  const smsExtra = view === 'readOnly' ? null : smsExtraMeter(sms, overview.extras, owner);
  const creditsExtra =
    view === 'readOnly' ? null : creditsExtraMeter(credits, overview.extras, owner);

  const meters: Meter[] = [
    {
      key: 'employees',
      label: 'Lucrători la clienți',
      used: employees,
      limit: employeeLimit,
      hint: employeeHint,
      action:
        canAct && live && choice && employeeLimit !== null && employees > employeeLimit && next
          ? nextStepAction(choice, next)
          : undefined,
    },
    {
      key: 'members',
      label: 'Utilizatori',
      used: members,
      limit: memberLimit,
      hint: memberHint,
      action:
        canAct && live && choice?.plan === 'start' && memberLimit !== null && taken >= memberLimit
          ? { label: 'Treci pe Profesional', search: { plan: 'profesional' as const } }
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
      ...(smsExtra && { ...smsExtra, value: smsExtra.value ?? undefined }),
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
      ...(creditsExtra && {
        ...creditsExtra,
        value: creditsExtra.value ?? undefined,
        valueShort: null,
        hintShort: null,
      }),
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
              {meter.toExtra && canAct && (
                <a
                  href="#extra"
                  data-testid={`meter-${meter.key}-extra`}
                  className="inline-flex min-h-8 w-fit items-center text-sm font-semibold underline-offset-2 hover:underline"
                >
                  Pornește Extra
                </a>
              )}
              {meter.action && (
                <Link
                  to="/organizatie/abonament/alege"
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
        'flex items-center gap-3 rounded-xl border px-3.5 py-3 sm:gap-3.5 sm:px-4 sm:py-3.5',
        look.panel
      )}
    >
      <span
        aria-hidden="true"
        className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', look.badge)}
      >
        <Gift className="size-[18px]" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-semibold">{gift.title}</span>
        <span className="text-[13px] leading-relaxed text-pretty text-muted-foreground">
          {gift.text}
        </span>
      </div>
      {gift.value !== null && (
        <strong
          className={cn(
            'shrink-0 text-xl leading-none font-bold tracking-tight tabular-nums sm:text-2xl',
            look.value
          )}
        >
          {gift.value}
        </strong>
      )}
    </div>
  );
}
