import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { type SignatureSlotState, testErrorReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { LoaderCircle, PenLine } from 'lucide-react';
import { useState } from 'react';

import { getPortalTestSheet, type PortalTestsResponse } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { testSheetTitleMessage } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';
import { openPreview, PreviewBlockedError } from '@/lib/save-file';

import { reasonOf } from './test-errors';

type TestResult = PortalTestsResponse['ssm']['results'][number];

const slotStateMessages: Record<SignatureSlotState, MessageDescriptor> = {
  unassigned: msg`necerută`,
  pending: msg`de semnat`,
  signed: msg`semnată`,
  paper: msg`semnată pe hârtie`,
  void: msg`anulată`,
};

function failureOf(cause: unknown): MessageDescriptor {
  if (cause instanceof PreviewBlockedError) {
    return msg`Browserul a blocat fereastra nouă. Permite ferestrele noi pentru portal.`;
  }
  if (reasonOf(cause) === testErrorReasons.testSheetNotAvailable) {
    return msg`Fișa de test nu este gata încă. Încearcă din nou peste câteva minute.`;
  }
  return msg`Nu am putut deschide fișa de test. Verifică conexiunea la internet și încearcă din nou.`;
}

export function TestSheetLine({
  participantId,
  result,
}: {
  participantId: string;
  result: TestResult;
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MessageDescriptor | null>(null);
  const trainee = i18n._(slotStateMessages[result.sheet.signed.trainee]);
  const examiner = i18n._(slotStateMessages[result.sheet.signed.examiner]);

  async function open() {
    setBusy(true);
    setFailure(null);
    try {
      await openPreview(() => getPortalTestSheet(participantId, result.id, apiRequest), {
        title: i18n._(testSheetTitleMessage(result.domain, result.test)),
        pending: t`Se pregătește fișa…`,
      });
    } catch (cause) {
      setFailure(failureOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="training-test-sheet" className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="grid gap-0.5 text-[0.8125rem]">
          <span className="font-medium">
            <Trans>Fișa de test</Trans>
          </span>
          <span
            data-testid="training-test-sheet-slots"
            data-trainee={result.sheet.signed.trainee}
            data-examiner={result.sheet.signed.examiner}
            className="text-muted-foreground"
          >
            {t`Semnătura ta: ${trainee}. Examinatorul: ${examiner}.`}
          </span>
        </p>
        <Button
          variant="outline"
          data-testid="training-test-sheet-open"
          className="h-10 shrink-0 px-3.5"
          disabled={busy}
          onClick={() => void open()}
        >
          {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          <Trans>Deschide PDF</Trans>
        </Button>
      </div>
      {result.sheet.signed.trainee === 'pending' && (
        <p
          data-testid="training-test-sheet-sign-hint"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warning px-2.5 py-1.5 text-[0.8125rem] text-warning-foreground"
        >
          <PenLine aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <Trans>Fișa de test așteaptă semnătura ta, la Semnături.</Trans>
          </span>
          <Link
            to="/semneaza"
            data-testid="training-test-sheet-sign"
            className="font-semibold underline underline-offset-4"
          >
            <Trans>Semnează</Trans>
          </Link>
        </p>
      )}
      {failure && (
        <Notice variant="destructive" data-testid="training-test-sheet-error">
          {i18n._(failure)}
        </Notice>
      )}
    </div>
  );
}
