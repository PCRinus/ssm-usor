import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
  choiceAmounts,
  choiceSummary,
  formatCount,
  formatEuro,
  perInterval,
} from './billing-format';
import { type AmountRow, AmountRows, BillingCard, SealChip, StateChip } from './billing-ui';
import {
  daysLeftLabel,
  daysUntil,
  endedSentence,
  planNames,
  pricingUrl,
  roDate,
  type SealKind,
} from './subscription-copy';
import { currentChoice, hasLiveSubscription, type SubscriptionView } from './use-billing';

const trialDays = 30;

export type ActionsMode = 'enabled' | 'disabled' | 'hidden';

export interface PlanActions {
  cancel: () => void;
  resume: () => void;
  switchInterval: (target: BillingChoice) => void;
  withdrawScheduled: () => void;
  changeCard: () => void;
  busy: boolean;
}

const intervalChip = { month: 'Lunar', year: 'Anual' } as const;

export function PlanCard({
  overview,
  view,
  actionsMode,
  actions,
  now = new Date(),
}: {
  overview: BillingOverview;
  view: SubscriptionView;
  actionsMode: ActionsMode;
  actions: PlanActions;
  now?: Date;
}) {
  const subscription = overview.subscription;
  const owner = overview.owner;
  const choice = currentChoice(subscription);
  const amounts = choice ? choiceAmounts(choice) : null;
  const disabled = actionsMode === 'disabled' || actions.busy;
  const showActions = actionsMode !== 'hidden';

  let seal: { kind: SealKind; label: string } = {
    kind: subscription?.plan ?? 'profesional',
    label: subscription ? planNames[subscription.plan] : 'Fără abonament',
  };
  let chip: { label: string; tone: 'plain' | 'warning' } | null =
    choice && view !== 'readOnly' ? { label: intervalChip[choice.interval], tone: 'plain' } : null;
  let name = subscription ? planNames[subscription.plan] : 'Fără abonament';
  let status = '';
  let amount: { label: string; value: string; note?: string } | null = null;
  let rows: AmountRow[] = [];
  let note: ReactNode = null;
  let foot: string | null = null;
  let trialShare: number | null = null;
  const buttons: ReactNode[] = [];

  const totalRows = (): AmountRow[] =>
    amounts && choice
      ? [
          ...amounts.lines.map((line) => ({
            label: line.label,
            value: formatEuro(line.amountCents),
          })),
          { label: `TVA ${overview.catalogue.vatPercent} %`, value: formatEuro(amounts.vatCents) },
          {
            label: `Total ${perInterval[choice.interval]}`,
            value: formatEuro(amounts.totalCents),
            strong: true,
          },
        ]
      : [];

  const chooseLink = (label: string, variant: 'default' | 'outline' = 'default') => (
    <ActionLink key="choose" label={label} variant={variant} disabled={disabled} />
  );
  const cancelButton = (
    <Button
      key="cancel"
      variant="ghost"
      className="h-10 px-3 font-semibold text-destructive hover:text-destructive"
      disabled={disabled}
      data-testid="subscription-cancel"
      onClick={actions.cancel}
    >
      Anulează abonamentul
    </Button>
  );
  const cardButton = (
    <Button
      key="card"
      className="h-10 font-semibold"
      disabled={disabled}
      data-testid="subscription-change-card"
      onClick={actions.changeCard}
    >
      Schimbă cardul
    </Button>
  );

  switch (view) {
    case 'none':
      seal = { kind: 'profesional', label: 'Acces complet' };
      name = 'Fără abonament';
      status = 'Organizația are acces complet, fără o dată de încheiere.';
      break;
    case 'enterprise':
      status = 'Abonament după oferta primită. Pentru schimbări, scrie-ne la contact@ssmusor.ro.';
      break;
    case 'trial': {
      const end = subscription!.trialEndsAt!;
      const days = daysUntil(end, now);
      seal = { kind: 'trial', label: `Probă · ${daysLeftLabel(days)}` };
      name = 'Perioada de probă';
      status = owner
        ? `Până pe ${roDate(end)} ai tot ce include Profesional. Alege un plan oricând: zilele rămase nu se pierd, iar prima plată e abia pe ${roDate(end)}.`
        : `Până pe ${roDate(end)} organizația are tot ce include Profesional.`;
      amount = { label: 'Mai ai', value: daysLeftLabel(days), note: `până pe ${roDate(end)}` };
      if (days <= 1)
        amount = { label: 'Se încheie', value: daysLeftLabel(days), note: roDate(end) };
      trialShare = Math.max(0, Math.min(1, 1 - days / trialDays));
      buttons.push(chooseLink('Alege un plan'));
      buttons.push(
        <Button key="compare" variant="ghost" asChild className="h-10 px-3 font-semibold">
          <a href={pricingUrl} target="_blank" rel="noreferrer">
            Compară planurile
          </a>
        </Button>
      );
      foot = `Dacă nu alegi un plan până pe ${roDate(end)}, contul rămâne 30 de zile doar pentru citire, apoi datele se șterg.`;
      break;
    }
    case 'trialChosen': {
      const end = subscription!.trialEndsAt!;
      seal = { kind: 'trial', label: `Probă · ${daysLeftLabel(daysUntil(end, now))}` };
      status = `Începe pe ${roDate(end)}. Până atunci continuă perioada de probă.`;
      if (owner && amounts) {
        const first = owner.nextPayment;
        amount = {
          label: 'Prima plată',
          value: formatEuro(first?.totalCents ?? amounts.totalCents),
          note: `pe ${roDate(first?.at ?? end)}, cu TVA`,
        };
        rows = totalRows();
      }
      buttons.push(chooseLink('Schimbă planul', 'outline'), cancelButton);
      break;
    }
    case 'active': {
      const renews = subscription!.currentPeriodEnd;
      status =
        choice?.interval === 'month' && renews
          ? `Activ. Se reînnoiește în fiecare lună, pe ${new Date(renews).getDate()}.`
          : renews
            ? `Activ. Se reînnoiește pe ${roDate(renews)}.`
            : 'Activ.';
      if (owner && amounts && choice) {
        // On an annual plan the next invoice is the month's extra SMS, so the renewal is shown,
        // at the choice a change set for it.
        const renewal = owner.scheduledChange ?? choice;
        amount =
          choice.interval === 'year'
            ? {
                label: renewal.interval === 'year' ? 'Următoarea plată anuală' : 'Următoarea plată',
                value: formatEuro(choiceAmounts(renewal).totalCents),
                note: renews ? `pe ${roDate(renews)}, cu TVA` : 'cu TVA',
              }
            : {
                label: 'Următoarea plată',
                value: formatEuro(owner.nextPayment?.totalCents ?? amounts.totalCents),
                note: `pe ${roDate(owner.nextPayment?.at ?? renews ?? now.toISOString())}, cu TVA`,
              };
        rows = totalRows();
        if (owner.smsOverageCents) {
          note = `SMS-urile peste plan se plătesc lunar: luna aceasta, până acum, ${formatEuro(owner.smsOverageCents)} + TVA${owner.nextPayment ? `, pe factura din ${roDate(owner.nextPayment.at)}` : ''}.`;
        }
      }
      if (owner?.scheduledChange) {
        note = (
          <>
            <span>
              De pe {roDate(owner.scheduledChange.at)} treci la{' '}
              {choiceSummary(owner.scheduledChange)}.
            </span>{' '}
            {showActions && (
              <button
                type="button"
                disabled={disabled}
                onClick={actions.withdrawScheduled}
                className="cursor-pointer font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Renunță la schimbare
              </button>
            )}
          </>
        );
      }
      if (choice) {
        buttons.push(chooseLink('Schimbă planul sau pachetele', 'outline'));
        const toAnnual = choice.interval === 'month';
        buttons.push(
          <Button
            key="interval"
            variant="ghost"
            className="h-10 px-3 font-semibold"
            disabled={disabled}
            data-testid="subscription-switch-interval"
            onClick={() =>
              actions.switchInterval({ ...choice, interval: toAnnual ? 'year' : 'month' })
            }
          >
            {toAnnual ? 'Treci la plata anuală' : 'Treci la plata lunară'}
          </Button>
        );
      }
      buttons.push(cancelButton);
      const startProblem = owner?.choices.start.problems.find((problem) =>
        problem.reason.startsWith('start_')
      );
      if (subscription?.plan === 'profesional' && startProblem) {
        foot =
          startProblem.reason === 'start_employee_ceiling'
            ? `Start nu este disponibil: acoperă cel mult 600 de angajați, iar tu ai ${formatCount(overview.usage.employees.used ?? 0)}.`
            : `Start nu este disponibil: are cel mult 2 utilizatori, iar voi sunteți ${overview.usage.members.used ?? 0}.`;
      }
      break;
    }
    case 'canceling': {
      const end = subscription!.cancelsAt ?? subscription!.accessUntil ?? now.toISOString();
      const overdue = subscription!.status === 'past_due';
      chip = { label: 'Anulat', tone: 'warning' };
      status = overdue
        ? `Nu se mai reînnoiește, iar ultima plată nu a reușit. Ai acces complet până pe ${roDate(end)}.`
        : `Nu se mai reînnoiește. Ai acces complet până pe ${roDate(end)}.`;
      if (owner) {
        amount = {
          label: 'Următoarea plată',
          value: 'Niciuna',
          note: overdue
            ? `acces complet până pe ${roDate(end)}`
            : `ai plătit până pe ${roDate(end)}`,
        };
        rows =
          amounts?.lines.map((line) => ({
            label: line.label,
            value: formatEuro(line.amountCents),
          })) ?? [];
      }
      buttons.push(
        <Button
          key="resume"
          className="h-10 font-semibold"
          disabled={disabled}
          data-testid="subscription-resume"
          onClick={actions.resume}
        >
          Reactivează
        </Button>
      );
      if (overdue) buttons.push(cardButton);
      break;
    }
    case 'pastDue': {
      const until = subscription!.accessUntil;
      status = `Plata e restantă.${until ? ` Ai acces complet până pe ${roDate(until)}.` : ''}`;
      if (owner && amounts) {
        amount = { label: 'De plată', value: formatEuro(amounts.totalCents), note: 'cu TVA' };
        rows = totalRows();
      }
      buttons.push(cardButton, cancelButton);
      break;
    }
    case 'readOnly': {
      const deletes = subscription!.deletesAt;
      seal = { kind: 'readOnly', label: 'Doar citire' };
      chip = { label: 'Încheiat', tone: 'warning' };
      const trialEnded = subscription!.status === 'trialing' && !subscription!.planChosen;
      name = trialEnded ? 'Perioada de probă' : planNames[subscription!.plan];
      const live = hasLiveSubscription(subscription);
      status = live
        ? `${endedSentence(subscription!)} Când plata reușește, contul revine la acces complet.`
        : `${endedSentence(subscription!)} Nu se mai face nicio plată.`;
      if (deletes) {
        const left = daysUntil(deletes, now);
        amount = {
          label: 'Datele se șterg pe',
          value: roDate(deletes),
          note: left > 1 ? `peste ${daysLeftLabel(left)}` : left === 1 ? 'mâine' : 'azi',
        };
      }
      buttons.push(
        live
          ? cardButton
          : chooseLink(trialEnded ? 'Alege un plan' : 'Reactivează abonamentul', 'default')
      );
      break;
    }
  }

  return (
    <BillingCard aria-labelledby="plan-title" data-testid="plan-card" data-view={view}>
      <div className="flex flex-wrap items-center gap-2">
        <SealChip kind={seal.kind} label={seal.label} />
        {chip && <StateChip tone={chip.tone}>{chip.label}</StateChip>}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="grid min-w-0 flex-[1_1_260px] gap-1.5">
          <h2 id="plan-title" className="text-[28px] leading-tight font-bold tracking-tight">
            {name}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{status}</p>
        </div>
        {amount && (
          <div data-testid="plan-amount" className="grid gap-0.5 sm:text-right">
            <span className="text-[13px] text-muted-foreground">{amount.label}</span>
            <strong className="text-[26px] leading-tight font-bold tracking-tight tabular-nums">
              {amount.value}
            </strong>
            {amount.note && (
              <span className="text-[13px] text-muted-foreground">{amount.note}</span>
            )}
          </div>
        )}
      </div>

      {trialShare !== null && subscription?.trialEndsAt && (
        <div className="grid gap-1.5">
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-2 bg-accent" style={{ width: `${trialShare * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>Azi</span>
            <span>{roDate(subscription.trialEndsAt)}</span>
          </div>
        </div>
      )}

      {rows.length > 0 && <AmountRows rows={rows} className="border-t pt-3.5" />}

      {note && (
        <p
          data-testid="plan-note"
          className="rounded-lg bg-muted/70 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground"
        >
          {note}
        </p>
      )}

      {showActions && buttons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">{buttons}</div>
      )}

      {foot && (
        <p className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{foot}</p>
      )}
    </BillingCard>
  );
}

function ActionLink({
  label,
  variant,
  disabled,
}: {
  label: string;
  variant: 'default' | 'outline';
  disabled: boolean;
}) {
  const className = cn('h-10 font-semibold', variant === 'outline' && 'bg-card');
  if (disabled) {
    return (
      <Button variant={variant} className={className} disabled>
        {label}
      </Button>
    );
  }
  return (
    <Button variant={variant} className={className} asChild>
      <Link to="/organization/subscription/choose" data-testid="subscription-choose">
        {label}
      </Link>
    </Button>
  );
}
