import { type BillingChoice, type BillingOverview, trialDays } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { openedHere } from '@/app/opener';

import {
  choiceAmounts,
  choiceSummary,
  formatCount,
  formatEuro,
  perInterval,
  vatOf,
} from './billing-format';
import { type AmountRow, AmountRows, BillingCard, SealChip, StateChip } from './billing-ui';
import { extrasLines } from './extras-copy';
import {
  daysLeftLabel,
  daysUntil,
  endedSentence,
  monthlyRenewalDay,
  planNames,
  pricingUrl,
  roDate,
  type SealKind,
} from './subscription-copy';
import { currentChoice, hasLiveSubscription, type SubscriptionView } from './use-billing';

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
  let extraRows: AmountRow[] = [];
  let note: ReactNode = null;
  let foot: string | null = null;
  let trialShare: number | null = null;
  const buttons: ReactNode[] = [];

  const monthEnd =
    overview.usage.smsThisMonth.periodEnd ?? overview.usage.creditsThisMonth.periodEnd;

  const choiceRows = (shown: BillingChoice): AmountRow[] => {
    const shownAmounts = choiceAmounts(shown);
    return [
      ...shownAmounts.lines.map((line) => ({
        label: line.label,
        value: formatEuro(line.amountCents),
      })),
      { label: `TVA ${overview.catalogue.vatPercent} %`, value: formatEuro(shownAmounts.vatCents) },
      {
        label: `Total ${perInterval[shown.interval]}`,
        value: formatEuro(shownAmounts.totalCents),
        strong: true,
      },
    ];
  };
  const totalRows = (): AmountRow[] => (choice ? choiceRows(choice) : []);

  const extrasRows = (
    extras: ReturnType<typeof extrasLines>,
    billedAt: string | null
  ): AmountRow[] => {
    const cents = extras.reduce((sum, line) => sum + line.amountCents, 0);
    return [
      ...extras.map((line) => ({ label: line.label, value: formatEuro(line.amountCents) })),
      {
        label: billedAt ? `Extra cu TVA, pe factura din ${roDate(billedAt)}` : 'Extra cu TVA',
        value: formatEuro(cents + vatOf(cents)),
        strong: true,
      },
    ];
  };

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
        ? `Până pe ${roDate(end)} ai tot ce include Profesional. Alege un plan oricând: plătești atunci, iar perioada de probă se încheie.`
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
      const anchor = subscription!.billingAnchorAt ?? renews;
      status =
        choice?.interval === 'month' && anchor
          ? `Activ. Se reînnoiește ${monthlyRenewalDay(anchor)}.`
          : renews
            ? `Activ. Se reînnoiește pe ${roDate(renews)}.`
            : 'Activ.';
      if (owner && amounts && choice) {
        const renewal = owner.scheduledChange ?? choice;
        const plan = choiceAmounts(renewal);
        const extras = extrasLines(overview.extras);
        const extrasCents = extras.reduce((sum, line) => sum + line.amountCents, 0);
        if (choice.interval === 'year') {
          // Stripe's next invoice on an annual plan can be a month of extras, so the card shows the
          // renewal, at the choice a change set for it.
          amount = {
            label: renewal.interval === 'year' ? 'Următoarea plată anuală' : 'Următoarea plată',
            value: formatEuro(plan.totalCents),
            note: renews ? `pe ${roDate(renews)}, cu TVA` : 'cu TVA',
          };
          rows = choiceRows(renewal);
          if (extrasCents > 0) extraRows = extrasRows(extras, monthEnd);
        } else {
          const preview = owner.nextPayment;
          // Stripe's preview has the prorations and a change set for the renewal; its meters lag
          // behind the extras counted here, so the extras come from the count, never below the
          // preview's.
          const previewExtras = owner.extrasInPreviewCents ?? 0;
          const uncounted = Math.max(0, previewExtras - extrasCents);
          const other = preview ? preview.subtotalCents - previewExtras - plan.subtotalCents : 0;
          const subtotal = plan.subtotalCents + extrasCents + uncounted + other;
          const total = subtotal + vatOf(subtotal);
          rows = [
            ...plan.lines.map((line) => ({
              label: line.label,
              value: formatEuro(line.amountCents),
            })),
            ...extras.map((line) => ({ label: line.label, value: formatEuro(line.amountCents) })),
            ...(uncounted > 0 ? [{ label: 'Extra', value: formatEuro(uncounted) }] : []),
            ...(other !== 0
              ? [{ label: 'Diferența pentru schimbarea de plan', value: formatEuro(other) }]
              : []),
            { label: `TVA ${overview.catalogue.vatPercent} %`, value: formatEuro(vatOf(subtotal)) },
            {
              label:
                subtotal !== plan.subtotalCents
                  ? 'Total'
                  : `Total ${perInterval[renewal.interval]}`,
              value: formatEuro(total),
              strong: true,
            },
          ];
          amount = {
            label: 'Următoarea plată',
            value: formatEuro(total),
            note: `pe ${roDate(preview?.at ?? renews ?? monthEnd ?? now.toISOString())}, cu TVA${extrasCents + uncounted > 0 ? ', cu extra de până azi' : ''}`,
          };
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
        buttons.push(chooseLink('Schimbă planul sau treapta', 'outline'));
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
        problem.reason.endsWith('_over_plan')
      );
      if (subscription?.plan === 'profesional' && startProblem) {
        foot =
          startProblem.reason === 'employees_over_plan'
            ? `Start nu este disponibil: acoperă cel mult ${formatCount(startProblem.maximum ?? 750)} de lucrători, iar tu ai ${formatCount(overview.usage.employees.used ?? 0)}.`
            : `Start nu este disponibil: are cel mult ${startProblem.maximum ?? 3} utilizatori, iar voi sunteți ${overview.usage.members.used ?? 0}.`;
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
        // Extras stop while a payment is overdue, so nothing more is promised then.
        const extras = overdue ? [] : extrasLines(overview.extras);
        const extrasCents = extras.reduce((sum, line) => sum + line.amountCents, 0);
        const billedAt = monthEnd && new Date(monthEnd) < new Date(end) ? monthEnd : end;
        amount =
          extrasCents > 0
            ? {
                label: 'Următoarea plată',
                value: formatEuro(extrasCents + vatOf(extrasCents)),
                note: `pe ${roDate(billedAt)}, cu TVA, doar extra`,
              }
            : {
                label: 'Următoarea plată',
                value: 'Niciuna',
                note: overdue
                  ? `acces complet până pe ${roDate(end)}`
                  : `ai plătit până pe ${roDate(end)}`,
              };
        rows = overdue
          ? (amounts?.lines.map((line) => ({
              label: line.label,
              value: formatEuro(line.amountCents),
            })) ?? [])
          : choice
            ? [{ label: choiceSummary(choice), value: 'Nu se mai plătește' }]
            : [];
        if (extrasCents > 0) extraRows = extrasRows(extras, billedAt);
        const extrasOn = overview.extras.sms.enabled || overview.extras.credits.enabled;
        if (!overdue && extrasOn) {
          note =
            choice?.interval === 'year'
              ? `Extra rămâne pornit până pe ${roDate(end)} și se facturează lunar. Ce folosești în ultima lună vine pe o factură din ${roDate(end)}.`
              : `Extra rămâne pornit până pe ${roDate(end)}. Ce folosești până atunci vine pe o factură din ${roDate(end)}.`;
        }
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
      {extraRows.length > 0 && (
        <div data-testid="plan-extras" className="grid gap-2 border-t pt-3.5">
          <span className="text-[13px] font-medium">Extra, facturat lunar</span>
          <AmountRows rows={extraRows} />
        </div>
      )}

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
      <Link to="/organizatie/abonament/alege" state={openedHere} data-testid="subscription-choose">
        {label}
      </Link>
    </Button>
  );
}
