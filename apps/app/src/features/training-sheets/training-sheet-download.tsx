import {
  type ApiErrorResponse,
  type TrainingDomain,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Eye, FileDown, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { getGetTrainingSheetsQueryKey, getTrainingSheet } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { openPreview, PreviewBlockedError, saveFile } from '@/lib/save-file';

import { useTrainingSheets } from './use-training-sheets';

type TrainingSheetDownloadProps = {
  clientId: string;
  employeeId: string;
  domain: TrainingDomain;
};

const failureOf = (cause: unknown) => {
  if (cause instanceof PreviewBlockedError) {
    return 'Browserul a blocat fereastra nouă. Permite ferestrele noi pentru această pagină.';
  }
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'pdf_unavailable') {
    return 'Convertorul PDF nu este disponibil. Încearcă din nou peste câteva minute.';
  }
  if (body?.reason === 'missing_sheet_data') {
    return 'Fișa nu se poate întocmi încă: lipsesc date ale angajatului.';
  }
  return 'Nu am putut descărca fișa. Verifică conexiunea și încearcă din nou.';
};

export function TrainingSheetDownload({
  clientId,
  employeeId,
  domain,
}: TrainingSheetDownloadProps) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const readiness = useTrainingSheets(clientId, employeeId);
  const [busy, setBusy] = useState<'download' | 'preview' | null>(null);
  const sheet = readiness.data?.[domain];
  const domainLabel = trainingDomainLabels[domain];
  const disabled = !sheet?.ready || busy !== null;

  const loadSheet = () => getTrainingSheet(clientId, employeeId, { domain }, apiRequest);

  async function run(kind: 'download' | 'preview', action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (cause) {
      toast.error(failureOf(cause));
      if (cause instanceof ApiHttpError && cause.status === 409) {
        void queryClient.invalidateQueries({
          queryKey: getGetTrainingSheetsQueryKey(clientId, employeeId),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const download = () =>
    run('download', async () => {
      const file = await loadSheet();
      saveFile(file, file instanceof File ? file.name : `Fisa-${domainLabel}.pdf`);
    });

  const preview = () => run('preview', () => openPreview(loadSheet, `Fișa ${domainLabel}`));

  return (
    <>
      <Button
        data-testid={`training-sheet-${domain}`}
        variant="outline"
        disabled={disabled}
        onClick={() => void download()}
      >
        {busy === 'download' ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <FileDown aria-hidden="true" />
        )}
        {`Descarcă fișa ${domainLabel}`}
      </Button>
      <Button
        data-testid={`training-sheet-${domain}-preview`}
        variant="outline"
        aria-label={`Previzualizează fișa ${domainLabel}`}
        disabled={disabled}
        onClick={() => void preview()}
      >
        {busy === 'preview' ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Eye aria-hidden="true" />
        )}
        Previzualizează
      </Button>
    </>
  );
}
