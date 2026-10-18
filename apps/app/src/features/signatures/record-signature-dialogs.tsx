import { type SignerSlot, signerSlotLabels } from '@ssm-usor/contracts';
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
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useMarkPaperSignature, useVoidRecordSignatures } from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';

import { signingFailure } from './signature-format';
import { invalidateSignatures } from './signature-queries';

export type SlotPeople = Partial<Record<SignerSlot, { name: string; jobTitle: string } | null>>;

const manual = (message: string) => ({ type: 'manual', message });

export function PaperSignatureDialog({
  clientId,
  recordId,
  slots,
  people,
  open,
  onClose,
}: {
  clientId: string;
  recordId: string;
  // The slots that can still be marked: neither signed electronically nor on paper.
  slots: SignerSlot[];
  people: SlotPeople;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && slots.length > 0 && (
        <PaperSignatureForm
          clientId={clientId}
          recordId={recordId}
          slots={slots}
          people={people}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function PaperSignatureForm({
  clientId,
  recordId,
  slots,
  people,
  onClose,
}: {
  clientId: string;
  recordId: string;
  slots: SignerSlot[];
  people: SlotPeople;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const mark = useMarkPaperSignature({ request: apiRequest });
  const first = slots[0]!;
  const [slot, setSlot] = useState<SignerSlot>(first);
  const [name, setName] = useState(people[first]?.name ?? '');
  const [jobTitle, setJobTitle] = useState(people[first]?.jobTitle ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = mark.isPending;
  const nameMissing = submitted && !name.trim();

  function changeSlot(next: SignerSlot) {
    setSlot(next);
    setName(people[next]?.name ?? '');
    setJobTitle(people[next]?.jobTitle ?? '');
  }

  async function save() {
    setSubmitted(true);
    if (!name.trim()) return;
    setError(null);
    try {
      await mark.mutateAsync({
        clientId,
        recordId,
        data: { slot, signerName: name.trim(), signerJobTitle: jobTitle.trim() || null },
      });
      toast.success(`Rubrica „${signerSlotLabels[slot]}” este marcată semnată pe hârtie.`);
      onClose();
    } catch (cause) {
      setError(
        signingFailure(
          cause,
          'Nu am putut marca semnătura. Verifică conexiunea și încearcă din nou.'
        )
      );
    } finally {
      await invalidateSignatures(queryClient, clientId);
    }
  }

  return (
    <DialogContent data-testid="paper-signature-dialog" className="sm:max-w-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        aria-busy={busy}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>Marchează semnat pe hârtie</DialogTitle>
          <DialogDescription>
            Pentru o rubrică semnată de mână pe fișa tipărită. Numele și funcția apar pe fișă așa
            cum le scrii aici.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field id="paper-signature-slot" label="Rubrica" mark="required">
            <NativeSelect
              id="paper-signature-slot"
              data-testid="paper-signature-slot"
              value={slot}
              disabled={busy}
              onChange={(event) => changeSlot(event.target.value as SignerSlot)}
            >
              {slots.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {signerSlotLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="paper-signature-name"
            label="Numele celui care a semnat"
            mark="required"
            error={nameMissing ? manual('Completează numele celui care a semnat.') : undefined}
          >
            <Input
              id="paper-signature-name"
              data-testid="paper-signature-name"
              autoComplete="off"
              value={name}
              disabled={busy}
              aria-invalid={nameMissing}
              aria-describedby={nameMissing ? 'paper-signature-name-error' : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field id="paper-signature-job-title" label="Funcția" mark="optional">
            <Input
              id="paper-signature-job-title"
              data-testid="paper-signature-job-title"
              autoComplete="off"
              value={jobTitle}
              disabled={busy}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </Field>
        </DialogBody>
        {error && (
          <Notice variant="destructive" data-testid="paper-signature-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="paper-signature-submit" disabled={busy}>
            {busy ? 'Se salvează…' : 'Marchează semnat'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function VoidSignaturesDialog({
  clientId,
  recordId,
  open,
  onClose,
}: {
  clientId: string;
  recordId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <VoidSignaturesForm clientId={clientId} recordId={recordId} onClose={onClose} />}
    </Dialog>
  );
}

function VoidSignaturesForm({
  clientId,
  recordId,
  onClose,
}: {
  clientId: string;
  recordId: string;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const voiding = useVoidRecordSignatures({ request: apiRequest });
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = voiding.isPending;
  const reasonMissing = submitted && !reason.trim();

  async function confirm() {
    setSubmitted(true);
    if (!reason.trim()) return;
    setError(null);
    try {
      await voiding.mutateAsync({ clientId, recordId, data: { reason: reason.trim() } });
      toast.success('Semnăturile au fost anulate. Instruirea se poate modifica din nou.');
      onClose();
    } catch (cause) {
      setError(
        signingFailure(
          cause,
          'Nu am putut anula semnăturile. Verifică conexiunea și încearcă din nou.'
        )
      );
    } finally {
      await invalidateSignatures(queryClient, clientId);
    }
  }

  return (
    <DialogContent data-testid="void-signatures-dialog" className="sm:max-w-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
        aria-busy={busy}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>Anulezi semnăturile?</DialogTitle>
          <DialogDescription>
            Rândul rămâne pe fișă așa cum a fost semnat, marcat „anulat”, ca o rubrică tăiată pe
            hârtie. Cererile în așteptare se anulează și ele. După ce corectezi instruirea, cererile
            de semnare pleacă din nou.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field
            id="void-signatures-reason"
            label="Motivul"
            mark="required"
            hint="Rămâne în evidența semnăturilor anulate."
            error={reasonMissing ? manual('Scrie motivul anulării.') : undefined}
          >
            <Textarea
              id="void-signatures-reason"
              data-testid="void-signatures-reason"
              rows={3}
              maxLength={500}
              value={reason}
              disabled={busy}
              aria-invalid={reasonMissing}
              aria-describedby={
                reasonMissing ? 'void-signatures-reason-error' : 'void-signatures-reason-hint'
              }
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </DialogBody>
        {error && (
          <Notice variant="destructive" data-testid="void-signatures-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button
            type="submit"
            variant="destructive"
            data-testid="void-signatures-confirm"
            disabled={busy}
          >
            {busy ? 'Se anulează…' : 'Anulează semnăturile'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
