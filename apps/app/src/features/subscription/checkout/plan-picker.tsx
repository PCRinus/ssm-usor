import { billingPlans, type PaidPlan, stepFor } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { HelpLink } from '@/components/help-link';

import { employeesLabel, formatCount, formatEuro, shortPlanNames } from '../billing-format';
import { BillingCard } from '../billing-ui';
import { creditsCount } from '../credits-copy';
import { codesLabel } from '../sms-copy';
import { contactEmail } from '../subscription-copy';
import type { BillingOwner } from '../use-billing';
import { employeeStops, minimumStop, type Pick, unavailableReason } from './checkout-choice';

const planCopy: Record<PaidPlan, { who: string; lines: string[] }> = {
  start: {
    who: 'Tot ce îți trebuie ca să ții la zi SSM și SU pentru toți clienții tăi.',
    lines: ['Oricâți clienți', '3 utilizatori'],
  },
  profesional: {
    who: 'Pentru firma care crește: clienți noi, munca împărțită, ajutor mai repede.',
    lines: [
      '10 utilizatori',
      'Fiecare coleg își vede clienții lui',
      'Documente fără marca SSM Ușor',
      'Suport în aceeași zi lucrătoare',
    ],
  },
};

const plans: PaidPlan[] = ['start', 'profesional'];

export function PlanPicker({
  pick,
  owner,
  employees,
  onChange,
  disabled,
  welcomeAhead,
}: {
  pick: Pick;
  owner: BillingOwner;
  employees: number;
  onChange: (pick: Pick) => void;
  disabled: boolean;
  // The welcome credits come once, with the first payment: none on a later change or return.
  welcomeAhead: boolean;
}) {
  const annual = pick.interval === 'year';
  const at = employeeStops.indexOf(pick.stop);
  const floor = minimumStop(employees);
  const floorAt = floor === null ? employeeStops.length - 1 : employeeStops.indexOf(floor);
  const moveTo = (index: number) => onChange({ ...pick, stop: employeeStops[index]! });

  return (
    <>
      <BillingCard aria-labelledby="pick-plan" data-testid="plan-picker">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pick-plan" className="text-base font-semibold">
            Planul
          </h2>
          <div
            role="group"
            aria-label="Perioada de plată"
            className="inline-flex gap-0.5 rounded-xl bg-muted p-[3px]"
          >
            {(['year', 'month'] as const).map((interval) => {
              const on = pick.interval === interval;
              return (
                <button
                  key={interval}
                  type="button"
                  aria-pressed={on}
                  data-testid={`interval-${interval}`}
                  disabled={disabled}
                  onClick={() => onChange({ ...pick, interval })}
                  className={cn(
                    'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[9px] px-3.5 text-sm',
                    on
                      ? 'bg-card font-semibold shadow-[0_1px_2px_rgba(24,52,46,0.12)]'
                      : 'font-medium text-muted-foreground'
                  )}
                >
                  {interval === 'month' ? 'Lunar' : 'Anual'}
                  {interval === 'year' && (
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-xs font-semibold text-success-foreground',
                        on ? 'bg-success' : 'bg-card'
                      )}
                    >
                      două luni gratuite
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Stepper
          name="step"
          label="Lucrători la clienții tăi"
          value={formatCount(pick.stop)}
          canLess={!disabled && at > floorAt}
          canMore={!disabled && at < employeeStops.length - 1}
          less="Mai puțini lucrători"
          more="Mai mulți lucrători"
          onLess={() => moveTo(at - 1)}
          onMore={() => moveTo(at + 1)}
          hint={
            floor === null
              ? `Ai ${employeesLabel(employees)}, peste ce acoperă planurile din aplicație.`
              : `Ai ${employeesLabel(employees)} la clienții activi, așa că treapta nu poate fi sub ${formatCount(floor)}.`
          }
          help={<HelpLink topic="organizatie.trepte" label="Ajutor: Treptele de lucrători" />}
        />

        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => {
            const on = plan === pick.plan;
            const why = unavailableReason(plan, owner, pick.stop);
            const planAt = stepFor(plan, pick.stop) ?? billingPlans[plan].steps.at(-1)!;
            const price = planAt.prices[pick.interval].unitAmount;
            return (
              <button
                key={plan}
                type="button"
                aria-pressed={on}
                data-testid={`plan-option-${plan}`}
                disabled={disabled || why !== null}
                onClick={() => !on && onChange({ ...pick, plan })}
                className={cn(
                  'flex cursor-pointer flex-col gap-2.5 rounded-xl bg-card p-4 text-left disabled:cursor-not-allowed',
                  on ? 'border-2 border-primary' : 'm-px border',
                  why && 'opacity-60'
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg font-bold">{shortPlanNames[plan]}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-5 place-items-center rounded-full',
                      on ? 'bg-primary text-primary-foreground' : 'border-[1.5px] border-input'
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </span>
                <span className="text-[13px] leading-snug text-muted-foreground">
                  {planCopy[plan].who}
                </span>
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <strong className="text-[26px] font-bold tracking-tight tabular-nums">
                    {formatEuro(annual ? price / 12 : price)}
                  </strong>
                  <span className="text-[13px] text-muted-foreground">
                    {annual
                      ? `+ TVA pe lună, plătit anual: ${formatEuro(price)} + TVA`
                      : '+ TVA pe lună'}
                  </span>
                </span>
                <span className="grid gap-1.5 border-t pt-2.5">
                  {[
                    `Până la ${employeesLabel(planAt.employees)}`,
                    ...planCopy[plan].lines,
                    `${codesLabel(planAt.monthlySms)} SMS și ${creditsCount(planAt.monthlyCredits)} pe lună`,
                    ...(welcomeAhead
                      ? [`${creditsCount(planAt.welcomeCredits)} de bun venit, la prima plată`]
                      : []),
                  ].map((line) => (
                    <span key={line} className="flex gap-2 text-[13px] leading-snug">
                      <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ring" />
                      {line}
                    </span>
                  ))}
                </span>
                {why && (
                  <span className="text-[13px] font-semibold text-warning-foreground">{why}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Peste {employeesLabel(employeeStops.at(-1)!)} sau peste {billingPlans.profesional.members}{' '}
          utilizatori? Scrie-ne pentru o ofertă, la{' '}
          <a
            href={`mailto:${contactEmail}?subject=${encodeURIComponent('Ofertă Enterprise SSM Ușor')}`}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {contactEmail}
          </a>
          .
        </p>
      </BillingCard>
    </>
  );
}

function Stepper({
  name,
  label,
  value,
  hint,
  help,
  less,
  more,
  canLess,
  canMore,
  onLess,
  onMore,
}: {
  name: string;
  label: string;
  value: string;
  hint: string;
  help: ReactNode;
  less: string;
  more: string;
  canLess: boolean;
  canMore: boolean;
  onLess: () => void;
  onMore: () => void;
}) {
  const button =
    'grid size-10 cursor-pointer place-items-center rounded-[10px] border border-input bg-card disabled:cursor-not-allowed disabled:text-muted-foreground/50';
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_200px] items-center gap-1">
          <span className="text-sm font-semibold">{label}</span>
          {help}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={less}
            data-testid={`${name}-less`}
            disabled={!canLess}
            onClick={onLess}
            className={button}
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <output
            aria-live="polite"
            data-testid={`${name}-value`}
            className="min-w-16 text-center text-lg font-bold tabular-nums"
          >
            {value}
          </output>
          <button
            type="button"
            aria-label={more}
            data-testid={`${name}-more`}
            disabled={!canMore}
            onClick={onMore}
            className={button}
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}
