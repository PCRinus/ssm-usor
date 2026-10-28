import {
  type CancellationReason,
  cancellationReasonSchema,
  readOnlyDays,
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
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useCancelSubscription } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { billingErrorMessage } from './billing-errors';
import { addDays, cancellationReasons, choiceSummary, shortPlanNames } from './billing-format';
import { roDate } from './subscription-copy';
import { type BillingOwner, type BillingSubscription, refreshBilling } from './use-billing';

const noteLimit = 500;

export function CancelDialog({
  subscription,
  scheduledChange,
  open,
  onClose,
}: {
  subscription: BillingSubscription;
  scheduledChange: BillingOwner['scheduledChange'];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="cancel-dialog" className="sm:max-w-[560px]">
        {open && (
          <CancelForm
            subscription={subscription}
            scheduledChange={scheduledChange}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({
  subscription,
  scheduledChange,
  onClose,
}: {
  subscription: BillingSubscription;
  scheduledChange: BillingOwner['scheduledChange'];
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const cancel = useCancelSubscription({ request: apiRequest });
  const [reason, setReason] = useState<CancellationReason | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const plan =
    subscription.plan === 'enterprise' ? 'Enterprise' : shortPlanNames[subscription.plan];
  const inTrial = subscription.status === 'trialing';
  // A failed renewal has already moved the period on; access ends with the retries instead.
  const end =
    subscription.status === 'past_due'
      ? (subscription.accessUntil ?? subscription.currentPeriodEnd)
      : (subscription.currentPeriodEnd ?? subscription.accessUntil);
  const deletes = end ? addDays(end, readOnlyDays) : null;

  async function confirm() {
    setError(null);
    try {
      await cancel.mutateAsync({
        data: {
          ...(reason ? { reason } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast.success(
        inTrial
          ? 'Ai renunțat la plan. Perioada de probă continuă.'
          : `Abonamentul nu se mai reînnoiește. Lucrezi ca acum până pe ${end ? roDate(end) : 'capătul perioadei plătite'}.`
      );
      await refreshBilling(queryClient);
      onClose();
    } catch (cause) {
      setError(billingErrorMessage(cause));
    }
  }

  const steps =
    end && deletes
      ? [
          { when: `Până pe ${roDate(end)}`, what: 'Lucrezi ca acum.', tone: 'bg-ring' },
          {
            when: `${roDate(end).slice(0, 5)} – ${roDate(deletes)}`,
            what: 'Doar citire: tu, colegii și clienții vedeți și descărcați tot, fără să schimbați nimic.',
            tone: 'bg-warning-border',
          },
          {
            when: `După ${roDate(deletes)}`,
            what: 'Datele organizației se șterg definitiv.',
            tone: 'bg-destructive',
          },
        ]
      : [];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl leading-snug font-bold">
          {inTrial ? 'Renunți la planul ales?' : 'Anulezi abonamentul?'}
        </DialogTitle>
        <DialogDescription className="leading-relaxed text-pretty">
          {inTrial
            ? `Nu ai plătit nimic și nu se plătește nimic. Perioada de probă continuă${subscription.trialEndsAt ? ` până pe ${roDate(subscription.trialEndsAt)}` : ''}, cu tot ce include Profesional; apoi, fără un plan, contul rămâne 30 de zile doar pentru citire.`
            : `${plan} nu se mai reînnoiește. Ce ai plătit nu se returnează.${end ? ` Te poți răzgândi până pe ${roDate(end)}, din această pagină.` : ''}`}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        {!inTrial && steps.length > 0 && (
          <ol data-testid="cancel-timeline" className="grid">
            {steps.map((step, index) => (
              <li key={step.when} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3">
                <span aria-hidden="true" className="flex flex-col items-center">
                  <span className={cn('mt-1 size-3 shrink-0 rounded-full', step.tone)} />
                  {index < steps.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
                </span>
                <span className="grid gap-0.5 pb-3.5">
                  <strong className="text-sm font-semibold tabular-nums">{step.when}</strong>
                  <span className="text-sm leading-relaxed text-muted-foreground">{step.what}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="grid gap-2">
          <Label htmlFor="cancel-reason">
            De ce pleci? <span className="font-normal text-muted-foreground">(opțional)</span>
          </Label>
          <NativeSelect
            id="cancel-reason"
            data-testid="cancel-reason"
            value={reason}
            disabled={cancel.isPending}
            onChange={(event) => {
              const parsed = cancellationReasonSchema.safeParse(event.target.value);
              setReason(parsed.success ? parsed.data : '');
            }}
          >
            <NativeSelectOption value="">Alege un motiv</NativeSelectOption>
            {cancellationReasonSchema.options.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {cancellationReasons[option]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cancel-note">
            Vrei să ne spui mai multe?{' '}
            <span className="font-normal text-muted-foreground">(opțional)</span>
          </Label>
          <Textarea
            id="cancel-note"
            data-testid="cancel-note"
            rows={3}
            maxLength={noteLimit}
            value={note}
            disabled={cancel.isPending}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {scheduledChange && (
          <Notice variant="info" data-testid="cancel-drops-scheduled">
            Schimbarea programată pentru {roDate(scheduledChange.at)}, la{' '}
            {choiceSummary(scheduledChange)}, se anulează și ea. Dacă reactivezi abonamentul, o
            alegi din nou.
          </Notice>
        )}
        {!inTrial && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Până atunci poți descărca documentele emise de la fiecare client.
          </p>
        )}
        {error && <Notice variant="destructive">{error}</Notice>}
      </DialogBody>
      <DialogFooter className="mt-2">
        <Button
          variant="outline"
          className="h-11 font-semibold"
          disabled={cancel.isPending}
          onClick={onClose}
        >
          {inTrial ? 'Păstrează planul' : 'Păstrează abonamentul'}
        </Button>
        <Button
          variant="destructive"
          className="h-11 font-semibold"
          data-testid="cancel-confirm"
          disabled={cancel.isPending}
          onClick={() => void confirm()}
        >
          {cancel.isPending ? 'Se anulează…' : inTrial ? 'Renunță la plan' : 'Anulează abonamentul'}
        </Button>
      </DialogFooter>
    </>
  );
}
