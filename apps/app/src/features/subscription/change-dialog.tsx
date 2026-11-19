import {
  type BillingChoice,
  billingPlans,
  type BillingPreview,
  capitalized,
  planStep,
  vatPercent,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useState } from 'react';

import { changeSubscription } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useHoldOpen } from '@/components/close-guard';
import { FormDialog } from '@/components/form-dialog';
import { workerNoun } from '@/features/employees/employee-format';

import { billingErrorMessage, problemMessage } from './billing-errors';
import {
  choiceLines,
  choiceSummary,
  formatEuro,
  perInterval,
  shortPlanNames,
  stepLabel,
} from './billing-format';
import { type AmountRow, AmountRows } from './billing-ui';
import { creditsCount } from './credits-copy';
import { codesLabel } from './sms-copy';
import { roDate } from './subscription-copy';
import { refreshBilling } from './use-billing';
import { useBillingPreview } from './use-billing-preview';

type ChangeKind =
  'trial' | 'upgrade' | 'downgrade' | 'stepUp' | 'stepDown' | 'toAnnual' | 'toMonthly';

const stepOf = (choice: BillingChoice) => planStep(choice.plan, choice.step)!;

// The API's order: a higher monthly price applies at once, a lower one or annual to monthly at
// the renewal. Every Profesional step costs more than every Start step.
function changeKind(current: BillingChoice, target: BillingChoice, inTrial: boolean): ChangeKind {
  if (inTrial) return 'trial';
  const rank = (choice: BillingChoice) => stepOf(choice).prices.month.unitAmount;
  const otherPlan = target.plan !== current.plan;
  if (rank(target) < rank(current)) return otherPlan ? 'downgrade' : 'stepDown';
  if (current.interval === 'year' && target.interval === 'month') return 'toMonthly';
  if (rank(target) > rank(current)) return otherPlan ? 'upgrade' : 'stepUp';
  return 'toAnnual';
}

const proLosses = [
  `${billingPlans.profesional.members} utilizatori: Start are ${billingPlans.start.members}`,
  'fiecare coleg își vede doar clienții lui',
  'documente fără marca SSM Ușor',
  'suport în aceeași zi lucrătoare',
];

const includes = (choice: BillingChoice) => {
  const step = stepOf(choice);
  return `${codesLabel(step.monthlySms)} SMS și ${creditsCount(step.monthlyCredits)} pe lună`;
};

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
      label: `${capitalized(per)}, de pe ${from}`,
      value: formatEuro(preview.recurring.totalCents),
      strong: true,
    },
  ];
}

function copyFor(kind: ChangeKind, current: BillingChoice, preview: BillingPreview): Copy {
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
  const chargedBeforeRenewal =
    preview.dueToday.totalCents > 0 ||
    (preview.proration !== null && preview.proration.subtotalCents !== 0);
  const todayRows = (): AmountRow[] => {
    if (!chargedBeforeRenewal) return [];
    const rows: AmountRow[] = [];
    if (preview.dueToday.totalCents > 0) {
      rows.push({ label: 'Azi plătești, cu TVA', value: formatEuro(preview.dueToday.totalCents) });
    }
    if (preview.proration && !preview.proration.chargedNow) {
      rows.push({
        label: `Diferența pentru zilele rămase, pe factura din ${renewal}`,
        value: `${formatEuro(preview.proration.subtotalCents)} + TVA`,
      });
    }
    return rows;
  };
  const atRenewal = (from: string) => ({
    rows: [...todayRows(), ...recurringRows(preview, from)],
    note: chargedBeforeRenewal ? prorationNote : undefined,
  });

  switch (kind) {
    case 'trial':
      return {
        title: `Schimbi în ${choiceSummary(target)}?`,
        lead: `Schimbarea se aplică acum. Azi nu plătești nimic; prima plată, de ${formatEuro(preview.nextRenewal.totalCents)} cu TVA, se face pe ${roDate(preview.firstChargeAt)}, când se încheie perioada de probă.`,
        rows: recurringRows(preview, roDate(preview.firstChargeAt)),
        confirm: 'Schimbă planul',
        keep: 'Renunță',
      };
    case 'upgrade':
      return {
        title: `Treci la ${targetName}?`,
        lead: `${targetName} începe azi: ${stepLabel(target.step)}, ${billingPlans[target.plan].members} utilizatori, ${includes(target)}, fiecare coleg își vede clienții lui și documentele nu mai poartă marca SSM Ușor.`,
        rows: nowRows(),
        note: prorationNote,
        confirm: `Treci la ${targetName}`,
        keep: 'Renunță',
      };
    case 'stepUp':
      return {
        title: `Treci la treapta de ${workerNoun(target.step)}?`,
        lead: `Treapta nouă începe azi, cu ${includes(target)}. Diferența de coduri și de credite AI o primești pentru luna aceasta.`,
        rows: nowRows(),
        note: prorationNote,
        confirm: 'Treci pe treapta nouă',
        keep: 'Renunță',
      };
    case 'downgrade':
      return {
        title: `Treci la ${targetName} de pe ${applies}?`,
        lead: `Până pe ${applies} rămâi pe ${currentName}, iar perioada plătită nu se returnează. Apoi ai ${choiceSummary(target)}, cu ${includes(target)}.`,
        ...atRenewal(applies),
        losses: current.plan === 'profesional' ? proLosses : undefined,
        confirm: `Treci la ${targetName} pe ${applies}`,
        keep: `Rămân pe ${currentName}`,
      };
    case 'stepDown':
      return {
        title: `Treci la treapta de ${workerNoun(target.step)} de pe ${applies}?`,
        lead: `Până pe ${applies} rămâi pe treapta de acum, iar perioada plătită nu se returnează. Apoi ai ${includes(target)}.`,
        ...atRenewal(applies),
        confirm: `Schimbă treapta pe ${applies}`,
        keep: 'Rămân pe treapta de acum',
      };
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
        lead: `Anul plătit rămâne până pe ${applies}, iar banii nu se returnează. Apoi plătești în fiecare lună: ${choiceSummary(target)}.`,
        ...atRenewal(applies),
        confirm: 'Treci la plata lunară',
        keep: 'Rămân pe anual',
      };
  }
}

export function ChangeDialog({
  current,
  target,
  inTrial,
  onClose,
  onDone,
}: {
  current: BillingChoice;
  // Null while closed.
  target: BillingChoice | null;
  inTrial: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  return (
    <FormDialog open={target !== null} onClose={onClose}>
      {target && (
        <ChangeForm
          current={current}
          target={target}
          inTrial={inTrial}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </FormDialog>
  );
}

function ChangeForm({
  current,
  target,
  inTrial,
  onClose,
  onDone,
}: {
  current: BillingChoice;
  target: BillingChoice;
  inTrial: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { request, queryClient } = useApi();
  const { preview } = useBillingPreview(target);
  const [pending, setPending] = useState(false);
  useHoldOpen(pending);
  const [error, setError] = useState<string | null>(null);
  const kind = changeKind(current, target, inTrial);
  const data = preview.data;
  const copy = data ? copyFor(kind, current, data) : null;
  const blocked = data ? data.problems.length > 0 || data.unchanged : true;

  async function confirm() {
    setError(null);
    setPending(true);
    try {
      const result = await changeSubscription(
        data?.prorationDate ? { ...target, prorationDate: data.prorationDate } : target,
        request
      );
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
        kind === 'downgrade' || kind === 'toMonthly' || kind === 'stepDown'
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
    <DialogContent
      data-testid="change-dialog"
      className="sm:max-w-[560px]"
      showCloseButton={!pending}
    >
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
    </DialogContent>
  );
}
