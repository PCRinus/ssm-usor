import { useFileLink } from '@ssm-usor/api-http/file-link';
import {
  signatureErrorReasons,
  type SignatureSlotState,
  signerSlotLabels,
  testErrorReasons,
  type TestSheetSignerSlot,
  testSheetSignerSlots,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Eye, LoaderCircle, PenLine } from 'lucide-react';
import { useState } from 'react';

import {
  getTestSheet,
  getTestSheetLink,
  useMarkTestSheetPaperSignature,
} from '@/api/generated/api';
import { apiErrorReason } from '@/api/http';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FileLinkButton } from '@/components/file-link-button';
import { maskPeople } from '@/components/mask-people';
import {
  signingFailure,
  slotStateBadgeClasses,
  slotStateLabels,
} from '@/features/signatures/signature-format';
import { invalidateSignatures } from '@/features/signatures/signature-queries';
import { openPreview, PreviewBlockedError } from '@/lib/save-file';

import { invalidateEmployeeTests } from './test-format';
import type { TestResult } from './test-result-dialog';

const markable = (state: SignatureSlotState) => state === 'unassigned' || state === 'pending';

function previewFailure(cause: unknown) {
  if (cause instanceof PreviewBlockedError) {
    return 'Browserul a blocat fereastra nouă. Permite ferestrele noi pentru această pagină.';
  }
  const reason = apiErrorReason(cause);
  if (reason === testErrorReasons.testSheetNotAvailable || reason === 'pdf_unavailable') {
    return 'Fișa de test nu a putut fi întocmită acum. Încearcă din nou peste câteva minute.';
  }
  return 'Nu am putut deschide fișa de test. Verifică conexiunea și încearcă din nou.';
}

export function TestSheetLine({
  clientId,
  employeeId,
  result,
  readOnly,
}: {
  clientId: string;
  employeeId: string;
  result: TestResult;
  readOnly: boolean;
}) {
  const { request, queryClient } = useApi();
  const [previewing, setPreviewing] = useState(false);
  const [marking, setMarking] = useState<TestSheetSignerSlot | null>(null);
  const { signed } = result.sheet;
  // A signature writes a new version of the sheet: the slots in the key fetch its link anew.
  const link = useFileLink({
    queryKey: ['test-sheet-link', clientId, employeeId, result.id, signed.trainee, signed.examiner],
    load: (signal) => getTestSheetLink(clientId, employeeId, result.id, { ...request, signal }),
    enabled: result.sheet.available,
    apiRequest: request,
    disposition: 'inline',
  });

  async function preview() {
    setPreviewing(true);
    try {
      await openPreview(
        () => getTestSheet(clientId, employeeId, result.id, request),
        'Fișa de test'
      );
      // Opening draws up the sheet the pass could not, and requests its signatures.
      await Promise.all([
        invalidateEmployeeTests(queryClient, clientId, employeeId),
        invalidateSignatures(queryClient, clientId),
      ]);
    } catch (cause) {
      toast.error(previewFailure(cause));
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div data-testid="tests-sheet" className="grid gap-2 border-t pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Fișa de test</p>
        {result.sheet.available ? (
          <FileLinkButton variant="ghost" size="sm" data-testid="tests-sheet-preview" link={link}>
            <Eye aria-hidden="true" />
            Previzualizează
          </FileLinkButton>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            data-testid="tests-sheet-preview"
            disabled={previewing}
            onClick={() => void preview()}
          >
            {previewing ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Eye aria-hidden="true" />
            )}
            Previzualizează
          </Button>
        )}
      </div>
      {!result.sheet.available && (
        <p data-testid="tests-sheet-pending" className="text-sm text-muted-foreground">
          Fișa nu a putut fi întocmită la promovare. Previzualizarea o întocmește și cere
          semnăturile.
        </p>
      )}
      <ul className="grid gap-1.5 text-sm">
        {testSheetSignerSlots.map((slot) => (
          <li
            key={slot}
            data-testid="tests-sheet-slot"
            data-slot={slot}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="w-24 text-muted-foreground">{signerSlotLabels[slot]}</span>
            <Badge
              variant="outline"
              data-testid="signature-slot-state"
              data-state={signed[slot]}
              className={slotStateBadgeClasses[signed[slot]]}
            >
              {slotStateLabels[signed[slot]]}
            </Badge>
            {!readOnly && markable(signed[slot]) && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="tests-sheet-paper"
                onClick={() => setMarking(slot)}
              >
                <PenLine aria-hidden="true" />
                Marchează semnat pe hârtie
              </Button>
            )}
          </li>
        ))}
      </ul>
      <PaperSlotDialog
        clientId={clientId}
        employeeId={employeeId}
        result={result}
        slot={marking}
        onClose={() => setMarking(null)}
      />
    </div>
  );
}

function PaperSlotDialog({
  clientId,
  employeeId,
  result,
  slot,
  onClose,
}: {
  clientId: string;
  employeeId: string;
  result: TestResult;
  slot: TestSheetSignerSlot | null;
  onClose: () => void;
}) {
  const { request, queryClient } = useApi();
  const mark = useMarkTestSheetPaperSignature({ request });
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm(target: TestSheetSignerSlot) {
    setError(null);
    try {
      await mark.mutateAsync({ clientId, employeeId, resultId: result.id, data: { slot: target } });
    } catch (cause) {
      setError(
        apiErrorReason(cause) === signatureErrorReasons.examinerRequired
          ? 'Rezultatul nu are examinator. Numește-l întâi, ca fișa să-l tipărească în rubrică.'
          : signingFailure(
              cause,
              'Nu am putut marca semnătura. Verifică conexiunea și încearcă din nou.'
            )
      );
      return;
    }
    toast.success('Rubrica a fost marcată semnată pe hârtie.');
    await Promise.all([
      invalidateEmployeeTests(queryClient, clientId, employeeId),
      invalidateSignatures(queryClient, clientId),
    ]);
    close();
  }

  return (
    slot && (
      <ConfirmDialog
        open
        error={error}
        destructive={false}
        testId="tests-sheet-paper"
        title={`Marchezi „${signerSlotLabels[slot]}” semnat pe hârtie?`}
        confirmLabel="Marchează semnat pe hârtie"
        pendingLabel="Se salvează…"
        onConfirm={() => confirm(slot)}
        onClose={close}
      >
        Pentru fișa de test tipărită și semnată de mână
        {slot === 'examiner' && result.examiner && maskPeople` de ${result.examiner.name}`}. O
        cerere de semnare electronică în așteptare pentru această rubrică se anulează.
      </ConfirmDialog>
    )
  );
}
