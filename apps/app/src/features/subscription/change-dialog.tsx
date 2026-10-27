import {
  type BillingChoice,
  billingPlans,
  type BillingPreview,
  vatPercent,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { changeSubscription } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { billingErrorMessage, problemMessage } from './billing-errors';
import {
  choiceLines,
  choiceSummary,
  formatCount,
  formatEuro,
  packsLabel,
  perInterval,
  shortPlanNames,
} from './billing-format';
import { type AmountRow, AmountRows } from './billing-ui';
import { roDate } from './subscription-copy';
import { refreshBilling } from './use-billing';
import { useBillingPreview } from './use-billing-preview';

const planRank = { start: 0, profesional: 1 } as const;

type ChangeKind = 'trial' | 'upgrade' | 'downgrade' | 'toAnnual' | 'toMonthly' | 'add' | 'remove';

function changeKind(current: BillingChoice, target: BillingChoice, inTrial: boolean) {
  if (inTrial) return 'trial';
  if (planRank[target.plan] > planRank[current.plan]) return 'upgrade';
  if (planRank[target.plan] < planRank[current.plan]) return 'downgrade';
  if (current.interval !== target.interval)
    return target.interval === 'year' ? 'toAnnual' : 'toMonthly';
  const removes =
    target.employeePacks < current.employeePacks || target.extraMembers < current.extraMembers;
  return removes ? 'remove' : 'add';
}

const proLosses = [
  'fiecare coleg își vede doar clienții lui',
  'documente fără marca SSM Ușor',
  'suport prioritar',
  `${billingPlans.profesional.monthlySms - billingPlans.start.monthlySms} de SMS pe lună: Start are ${billingPlans.start.monthlySms}`,
];

interface Copy {
  title: string;
  lead: string;
  rows: AmountRow[];
  losses?: string[];
  note?: string;
  confirm: string;
  keep: string;
}

function recurringRows(preview: BillingPreview, from: string): AmountRow[] {
  const per = perInterval[preview.choice.interval];
  return [
    ...choiceLines(preview.choice).map((line) => ({
      label: line.label,
      value: formatEuro(line.amountCents),
    })),
    { label: `TVA ${vatPercent} %`, value: formatEuro(preview.recurring.vatCents) },
    {
      label: `${per.charAt(0).toUpperCase()}${per.slice(1)}, de pe ${from}`,
      value: formatEuro(preview.recurring.totalCents),
      strong: true,
    },
  ];
}

function copyFor(
  kind: ChangeKind,
  current: BillingChoice,
  preview: BillingPreview,
  usage: { employees: number; members: number }
): Copy {
  const target = preview.choice;
  const targetName = shortPlanNames[target.plan];
  const currentName = shortPlanNames[current.plan];
  const renewal = roDate(preview.nextRenewal.at);
  const applies = roDate(preview.appliesAt);
  const per = perInterval[target.interval];
  const nowRows = (): AmountRow[] => {
    const rows: AmountRow[] = [
      { label: 'Azi plătești, cu TVA', value: formatEuro(preview.dueToday.totalCents) },
    ];
    if (preview.proration && !preview.proration.chargedNow) {
      rows.push({
        label: `Diferența pentru zilele rămase, până pe ${renewal}`,
        value: `${formatEuro(preview.proration.subtotalCents)} + TVA`,
      });
    }
    rows.push(
      {
        label: `${choiceSummary(target)}, de pe ${renewal}`,
        value: `${formatEuro(preview.recurring.subtotalCents)} + TVA ${per}`,
      },
      {
        label: `Pe ${renewal} plătești, cu TVA`,
        value: formatEuro(preview.nextRenewal.totalCents),
        strong: true,
      }
    );
    return rows;
  };
  const prorationNote =
    preview.proration?.chargedNow || preview.dueToday.totalCents > 0
      ? 'Diferența se plătește azi cu cardul salvat; partea nefolosită din ce ai acum se scade din ea.'
      : `Diferența apare pe factura din ${renewal}, alături de perioada următoare.`;

  switch (kind) {
    case 'trial':
      return {
        title: `Schimbi în ${choiceSummary(target)}?`,
        lead: `Schimbarea se aplică acum. Azi nu plătești nimic; prima plată, de ${formatEuro(preview.nextRenewal.totalCents)} cu TVA, se face pe ${roDate(preview.firstChargeAt)}, când se încheie perioada de probă.`,
        rows: recurringRows(preview, roDate(preview.firstChargeAt)),
        confirm: 'Schimbă planul',
        keep: 'Renunță',
      };
    case 'upgrade': {
      const terms = billingPlans[target.plan];
      const dropsPacks = current.employeePacks > 0 && target.employeePacks === 0;
      return {
        title: `Treci la ${targetName}?`,
        lead: `${targetName} începe azi: ${formatCount(terms.includedEmployees)} de angajați, ${terms.includedMembers} utilizatori, ${terms.monthlySms} de SMS pe lună, fiecare coleg își vede clienții lui și documentele nu mai poartă marca SSM Ușor.${dropsPacks ? ` ${current.employeePacks === 1 ? 'Pachetul' : `Cele ${current.employeePacks} pachete`} de angajați nu mai ${current.employeePacks === 1 ? 'este necesar și se oprește' : 'sunt necesare și se opresc'}.` : ''}`,
        rows: nowRows(),
        note: prorationNote,
        confirm: `Treci la ${targetName}`,
        keep: 'Renunță',
      };
    }
    case 'downgrade': {
      const needs = [
        target.employeePacks > 0 ? packsLabel(target.plan, target.employeePacks) : null,
        target.extraMembers > 0 ? 'al doilea utilizator' : null,
      ].filter(Boolean);
      return {
        title: `Treci la ${targetName} de pe ${applies}?`,
        lead: `Până pe ${applies} rămâi pe ${currentName}, iar perioada plătită nu se returnează.${needs.length ? ` Pentru cei ${formatCount(usage.employees)} angajați și cei ${usage.members} utilizatori de azi, ${targetName} are nevoie de ${needs.join(' și de ')}.` : ''}`,
        rows: recurringRows(preview, applies),
        losses: current.plan === 'profesional' ? proLosses : undefined,
        confirm: `Treci la ${targetName} pe ${applies}`,
        keep: `Rămân pe ${currentName}`,
      };
    }
    case 'toAnnual':
      return {
        title: 'Treci la plata anuală?',
        lead: 'Plata anuală începe azi: plătești un an întreg, din care se scade partea nefolosită din luna aceasta. Pe an plătești 10 luni din 12.',
        rows: [
          {
            label: 'Azi plătești, cu TVA',
            value: formatEuro(preview.dueToday.totalCents),
            strong: true,
          },
          {
            label: `Apoi, de pe ${renewal}`,
            value: `${formatEuro(preview.recurring.totalCents)} pe an, cu TVA`,
          },
        ],
        confirm: 'Treci la plata anuală',
        keep: 'Rămân pe lunar',
      };
    case 'toMonthly':
      return {
        title: `Treci la plata lunară de pe ${applies}?`,
        lead: `Anul plătit rămâne până pe ${applies}, iar banii nu se returnează. Apoi plătești în fiecare lună.`,
        rows: recurringRows(preview, applies),
        confirm: 'Treci la plata lunară',
        keep: 'Rămân pe anual',
      };
    case 'add':
      return {
        title: 'Adaugi la abonament?',
        lead: `Se aplică azi: ${choiceSummary(target)}.`,
        rows: nowRows(),
        note: prorationNote,
        confirm: 'Adaugă',
        keep: 'Renunță',
      };
    case 'remove':
      return {
        title: `Schimbi abonamentul de pe ${applies}?`,
        lead: `Până pe ${applies} păstrezi ce ai acum, iar perioada plătită nu se returnează. Apoi rămâi cu ${choiceSummary(target)}.`,
        rows: recurringRows(preview, applies),
        confirm: `Schimbă de pe ${applies}`,
        keep: 'Renunță',
      };
  }
}

export function ChangeDialog({
  current,
  target,
  inTrial,
  usage,
  onClose,
  onDone,
}: {
  current: BillingChoice;
  // Null while closed.
  target: BillingChoice | null;
  inTrial: boolean;
  usage: { employees: number; members: number };
  onClose: () => void;
  onDone?: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="change-dialog" className="sm:max-w-[560px]">
        {target && (
          <ChangeForm
            current={current}
            target={target}
            inTrial={inTrial}
            usage={usage}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangeForm({
  current,
  target,
  inTrial,
  usage,
  onClose,
  onDone,
}: {
  current: BillingChoice;
  target: BillingChoice;
  inTrial: boolean;
  usage: { employees: number; members: number };
  onClose: () => void;
  onDone?: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { preview } = useBillingPreview(target);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = changeKind(current, target, inTrial);
  const data = preview.data;
  const copy = data ? copyFor(kind, current, data, usage) : null;
  const blocked = data ? data.problems.length > 0 || data.unchanged : true;

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      const result = await changeSubscription(target, apiRequest);
      if (result.clientSecret && result.intent === 'payment') {
        const { confirmSavedCardPayment } = await import('./checkout/stripe');
        const outcome = await confirmSavedCardPayment(result.clientSecret);
        if (!outcome.ok) {
          setError(
            outcome.message ??
              'Plata nu s-a confirmat. Schimbarea se aplică după ce plata reușește; poți încerca din nou sau schimba cardul.'
          );
          await refreshBilling(queryClient);
          return;
        }
      }
      toast.success(
        kind === 'downgrade' || kind === 'toMonthly' || kind === 'remove'
          ? `Gata. De pe ${roDate(data!.appliesAt)} treci la ${choiceSummary(target)}.`
          : `Gata. Abonamentul este acum ${choiceSummary(target)}.`
      );
      await refreshBilling(queryClient);
      onClose();
      onDone?.();
    } catch (cause) {
      setError(billingErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl leading-snug font-bold text-balance">
          {copy?.title ?? 'Se calculează schimbarea…'}
        </DialogTitle>
        <DialogDescription className="leading-relaxed text-pretty">
          {copy?.lead ?? 'Aflăm cât costă și de când se aplică.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {preview.isError ? (
          <Notice variant="destructive">{billingErrorMessage(preview.error)}</Notice>
        ) : !copy ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <AmountRows rows={copy.rows} className="rounded-xl bg-muted/70 px-4 py-3.5" />
            {copy.losses && (
              <div className="grid gap-1.5">
                <strong className="text-sm font-semibold">Pe Start nu mai ai:</strong>
                <ul className="grid list-disc gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                  {copy.losses.map((loss) => (
                    <li key={loss}>{loss}</li>
                  ))}
                </ul>
              </div>
            )}
            {copy.note && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">{copy.note}</p>
            )}
            {data!.problems.map((problem) => (
              <Notice key={problem.reason} variant="warning">
                {problemMessage(problem)}
              </Notice>
            ))}
            {data!.unchanged && (
              <Notice variant="info">Abonamentul are deja această alegere.</Notice>
            )}
          </>
        )}
        {error && <Notice variant="destructive">{error}</Notice>}
      </DialogBody>
      <DialogFooter className="mt-2">
        <Button
          variant="outline"
          className="h-11 font-semibold"
          disabled={pending}
          onClick={onClose}
        >
          {copy?.keep ?? 'Renunță'}
        </Button>
        <Button
          className="h-11 font-semibold"
          data-testid="change-confirm"
          disabled={pending || blocked || preview.isFetching}
          onClick={() => void confirm()}
        >
          {pending ? 'Se aplică…' : (copy?.confirm ?? 'Confirmă')}
        </Button>
      </DialogFooter>
    </>
  );
}
