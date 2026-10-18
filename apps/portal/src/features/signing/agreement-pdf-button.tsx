import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { FileText, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { getPortalEmployeeSigningAgreement, getPortalSigningAgreement } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import {
  isAdministrator,
  type Participation,
} from '@/features/participation/participation-context';
import { useApiRequest } from '@/lib/request';
import { openPreview, PreviewBlockedError } from '@/lib/save-file';

export function AgreementPdfButton({
  participation,
  employeeId,
  className,
}: {
  participation: Participation;
  employeeId: string;
  className?: string;
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MessageDescriptor | null>(null);
  const load = () =>
    isAdministrator(participation)
      ? getPortalEmployeeSigningAgreement(participation.participantId, employeeId, apiRequest)
      : getPortalSigningAgreement(participation.participantId, apiRequest);

  async function open() {
    setBusy(true);
    setFailure(null);
    try {
      await openPreview(load, {
        title: t`Actul adițional privind semnarea electronică`,
        pending: t`Se pregătește documentul…`,
      });
    } catch (cause) {
      setFailure(
        cause instanceof PreviewBlockedError
          ? msg`Browserul a blocat fereastra nouă. Permite ferestrele noi pentru portal.`
          : msg`Nu am putut deschide documentul. Încearcă din nou.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Button
        type="button"
        variant="outline"
        data-testid="agreement-pdf"
        className="h-10 w-fit"
        disabled={busy}
        onClick={() => void open()}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <FileText aria-hidden="true" />
        )}
        <Trans>Deschide PDF</Trans>
      </Button>
      {failure && <Notice variant="destructive">{i18n._(failure)}</Notice>}
    </div>
  );
}
