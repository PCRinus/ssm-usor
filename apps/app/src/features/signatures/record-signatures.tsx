import { type SignerSlot, signerSlotLabels } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Ban, PenLine } from 'lucide-react';
import { useState } from 'react';

import type { RecordSignaturesResponseSlotsItem } from '@/api/generated/api';
import { formatDay } from '@/features/participants/participant-format';

import {
  PaperSignatureDialog,
  type SlotPeople,
  VoidSignaturesDialog,
} from './record-signature-dialogs';
import { slotStateBadgeClasses, slotStateLabels, voidReasonLabel } from './signature-format';
import type { useRecordSignatures } from './use-record-signatures';

type Slot = RecordSignaturesResponseSlotsItem;

function SlotDetail({ slot }: { slot: Slot }) {
  switch (slot.state) {
    case 'pending':
      return <>{slot.signer?.name ?? 'Semnatar care nu mai are acces'}</>;
    case 'signed':
      return (
        <>
          {slot.signerName}
          {slot.signedAt && <span className="tabular-nums"> · {formatDay(slot.signedAt)}</span>}
        </>
      );
    case 'paper':
      return <>{slot.signerName}</>;
    case 'void':
      return slot.voidReason ? <>Motiv: {voidReasonLabel(slot.voidReason)}</> : null;
    case 'unassigned':
      return null;
  }
}

export function SignatureSlotBadge({ slot }: { slot: Slot }) {
  return (
    <Badge
      variant="outline"
      data-testid="signature-slot-state"
      data-state={slot.state}
      className={slotStateBadgeClasses[slot.state]}
    >
      {slotStateLabels[slot.state]}
    </Badge>
  );
}

export function RecordSignatures({
  clientId,
  recordId,
  query,
  people,
  readOnly,
}: {
  clientId: string;
  recordId: string;
  query: ReturnType<typeof useRecordSignatures>;
  people: SlotPeople;
  readOnly: boolean;
}) {
  const [marking, setMarking] = useState(false);
  const [voiding, setVoiding] = useState(false);
  if (query.isPending) return <Skeleton className="h-16 w-full" />;
  if (query.isError) {
    return (
      <p data-testid="record-signatures-error" className="text-sm text-muted-foreground">
        Nu am putut încărca semnăturile.{' '}
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          onClick={() => void query.refetch()}
        >
          Încearcă din nou
        </button>
      </p>
    );
  }
  const slots = query.data.slots;
  const markable = slots
    .filter((slot) => slot.state !== 'signed' && slot.state !== 'paper')
    .map((slot) => slot.slot as SignerSlot);
  const voidable = slots.some((slot) => ['signed', 'paper', 'pending'].includes(slot.state));

  return (
    <div data-testid="record-signatures" className="grid gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Semnături</p>
        {!readOnly && (markable.length > 0 || voidable) && (
          <div className="flex flex-wrap gap-1">
            {markable.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="record-signatures-paper"
                onClick={() => setMarking(true)}
              >
                <PenLine aria-hidden="true" />
                Marchează semnat pe hârtie
              </Button>
            )}
            {voidable && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="record-signatures-void"
                onClick={() => setVoiding(true)}
              >
                <Ban aria-hidden="true" />
                Anulează semnăturile
              </Button>
            )}
          </div>
        )}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {slots.map((slot) => (
          <li
            key={slot.slot}
            data-testid="signature-slot"
            data-slot={slot.slot}
            className="grid grid-cols-[7.5rem_1fr] items-baseline gap-x-3 gap-y-1 sm:grid-cols-[8.5rem_auto_1fr]"
          >
            <span className="text-muted-foreground">{signerSlotLabels[slot.slot]}</span>
            <span>
              <SignatureSlotBadge slot={slot} />
            </span>
            <span
              className={cn(
                'col-start-2 min-w-0 break-words sm:col-start-auto',
                slot.state === 'void' && 'text-muted-foreground'
              )}
            >
              <SlotDetail slot={slot} />
            </span>
          </li>
        ))}
      </ul>
      <PaperSignatureDialog
        clientId={clientId}
        recordId={recordId}
        slots={markable}
        people={people}
        open={marking}
        onClose={() => setMarking(false)}
      />
      <VoidSignaturesDialog
        clientId={clientId}
        recordId={recordId}
        open={voiding}
        onClose={() => setVoiding(false)}
      />
    </div>
  );
}
