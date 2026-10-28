import { type BillingChoice, billingPlans, extraMember, type PaidPlan } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, Minus, Plus } from 'lucide-react';

import { HelpLink } from '@/components/help-link';

import {
  employeeLimitOf,
  formatCount,
  formatEuro,
  packOf,
  shortPlanNames,
} from '../billing-format';
import { BillingCard } from '../billing-ui';
import { contactEmail } from '../subscription-copy';
import type { BillingOwner } from '../use-billing';
import { limitsFor, unavailableReason } from './checkout-choice';

const planCopy: Record<PaidPlan, { who: string; lines: string[] }> = {
  start: {
    who: 'Pentru specialistul care lucrează singur.',
    lines: [
      '250 de angajați, apoi pachete de 50, până la 600',
      'Un utilizator; al doilea costă 15 € pe lună',
      '50 SMS pe lună, apoi 0,10 € fiecare',
    ],
  },
  profesional: {
    who: 'Pentru firmele cu o echipă de specialiști.',
    lines: [
      '1.500 de angajați, apoi pachete de 500',
      '3 utilizatori, apoi 15 € pe lună fiecare',
      '300 SMS pe lună, apoi 0,10 € fiecare',
      'Fiecare coleg își vede clienții lui',
      'Documente fără marca SSM Ușor',
      'Suport prioritar',
    ],
  },
};

const plans: PaidPlan[] = ['start', 'profesional'];

export function PlanPicker({
  choice,
  owner,
  employees,
  members,
  onChange,
  disabled,
}: {
  choice: BillingChoice;
  owner: BillingOwner;
  employees: number;
  members: number;
  onChange: (choice: BillingChoice) => void;
  disabled: boolean;
}) {
  const annual = choice.interval === 'year';
  const limits = limitsFor(choice.plan, owner);
  const terms = billingPlans[choice.plan];
  const pack = packOf(choice.plan);
  const name = shortPlanNames[choice.plan];
  const covered = employeeLimitOf(choice);
  const memberPrice = extraMember.prices[choice.interval].unitAmount;

  const pickPlan = (plan: PaidPlan) => {
    if (plan === choice.plan) return;
    const next = limitsFor(plan, owner);
    onChange({
      ...choice,
      plan,
      employeePacks: next.minPacks,
      extraMembers: next.minMembers,
    });
  };

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
            {(['month', 'year'] as const).map((interval) => {
              const on = choice.interval === interval;
              return (
                <button
                  key={interval}
                  type="button"
                  aria-pressed={on}
                  data-testid={`interval-${interval}`}
                  disabled={disabled}
                  onClick={() => onChange({ ...choice, interval })}
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
                      2 luni gratuite
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => {
            const on = plan === choice.plan;
            const why = unavailableReason(plan, owner);
            const prices = billingPlans[plan].prices;
            const price = prices[choice.interval].unitAmount;
            return (
              <button
                key={plan}
                type="button"
                aria-pressed={on}
                data-testid={`plan-option-${plan}`}
                disabled={disabled || why !== null}
                onClick={() => pickPlan(plan)}
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
                    {formatEuro(price)}
                  </strong>
                  <span className="text-[13px] text-muted-foreground">
                    {annual
                      ? `pe an + TVA, adică ${formatEuro(Math.round(price / 12))} pe lună`
                      : 'pe lună + TVA'}
                  </span>
                </span>
                <span className="grid gap-1.5 border-t pt-2.5">
                  {planCopy[plan].lines.map((line) => (
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
          Peste 1.500 de angajați sau o echipă mare? Scrie-ne pentru o ofertă, la{' '}
          <a
            href={`mailto:${contactEmail}?subject=${encodeURIComponent('Ofertă Enterprise SSM Ușor')}`}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {contactEmail}
          </a>
          .
        </p>
      </BillingCard>

      <BillingCard aria-labelledby="pick-extras" data-testid="extras-picker">
        <div className="flex items-center gap-1">
          <h2 id="pick-extras" className="text-base font-semibold">
            Angajați și utilizatori
          </h2>
          <HelpLink topic="organizatie.pachete" label="Ajutor: Angajați și utilizatori" />
        </div>
        <Stepper
          name="packs"
          label={`Pachete de ${pack.employees} de angajați`}
          price={`${formatEuro(pack.prices[choice.interval].unitAmount)} ${annual ? 'pe an' : 'pe lună'} fiecare`}
          value={choice.employeePacks}
          min={limits.minPacks}
          max={limits.maxPacks}
          disabled={disabled}
          less="Un pachet mai puțin"
          more="Un pachet în plus"
          onChange={(employeePacks) => onChange({ ...choice, employeePacks })}
          hint={
            limits.minPacks > 0
              ? `Ai ${formatCount(employees)} de angajați, iar ${name} include ${formatCount(terms.includedEmployees)}: îți trebuie cel puțin ${limits.minPacks} ${limits.minPacks === 1 ? 'pachet' : 'pachete'}. Acum acoperi ${formatCount(covered)}.`
              : `${name} include ${formatCount(terms.includedEmployees)} de angajați, iar tu ai ${formatCount(employees)}. ${choice.employeePacks > 0 ? `Acum acoperi ${formatCount(covered)}.` : 'Nu ai nevoie de pachete acum.'}`
          }
        />
        <div className="border-t pt-3.5">
          <Stepper
            name="members"
            label="Utilizatori în plus"
            price={`${formatEuro(memberPrice)} ${annual ? 'pe an' : 'pe lună'} fiecare`}
            value={choice.extraMembers}
            min={limits.minMembers}
            max={limits.maxMembers}
            disabled={disabled}
            less="Un utilizator mai puțin"
            more="Un utilizator în plus"
            onChange={(extraMembers) => onChange({ ...choice, extraMembers })}
            hint={
              (choice.plan === 'start'
                ? 'Start include un utilizator și permite cel mult încă unul.'
                : 'Profesional include 3 utilizatori. Adaugi alții oricând.') +
              (limits.minMembers > 0
                ? ` Sunteți ${members}, deci îți trebuie cel puțin ${limits.minMembers} în plus.`
                : '')
            }
          />
        </div>
      </BillingCard>
    </>
  );
}

function Stepper({
  name,
  label,
  price,
  value,
  min,
  max,
  hint,
  less,
  more,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  price: string;
  value: number;
  min: number;
  max: number;
  hint: string;
  less: string;
  more: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const button =
    'grid size-10 cursor-pointer place-items-center rounded-[10px] border border-input bg-card disabled:cursor-not-allowed disabled:text-muted-foreground/50';
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid min-w-0 flex-[1_1_200px] gap-0.5">
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-[13px] text-muted-foreground">{price}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={less}
            data-testid={`${name}-less`}
            disabled={disabled || value <= min}
            onClick={() => onChange(value - 1)}
            className={button}
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <output
            aria-live="polite"
            data-testid={`${name}-value`}
            className="min-w-10 text-center text-lg font-bold tabular-nums"
          >
            {value}
          </output>
          <button
            type="button"
            aria-label={more}
            data-testid={`${name}-more`}
            disabled={disabled || value >= max}
            onClick={() => onChange(value + 1)}
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
