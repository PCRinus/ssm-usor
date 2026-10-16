import {
  type ApiErrorResponse,
  type TrainingDomain,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { FileDown, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { getGetTrainingSheetsQueryKey, getTrainingSheet } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { saveFile } from '@/lib/save-file';

import { useTrainingSheets } from './use-training-sheets';

type TrainingSheetDownloadProps = {
  clientId: string;
  employeeId: string;
  domain: TrainingDomain;
};

const failureOf = (cause: unknown) => {
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
  const [downloading, setDownloading] = useState(false);
  const sheet = readiness.data?.[domain];
  const label = `Descarcă fișa ${trainingDomainLabels[domain]}`;

  async function download() {
    setDownloading(true);
    try {
      const file = await getTrainingSheet(clientId, employeeId, { domain }, apiRequest);
      saveFile(file, file instanceof File ? file.name : `Fisa-${trainingDomainLabels[domain]}.pdf`);
    } catch (cause) {
      toast.error(failureOf(cause));
      if (cause instanceof ApiHttpError && cause.status === 409) {
        void queryClient.invalidateQueries({
          queryKey: getGetTrainingSheetsQueryKey(clientId, employeeId),
        });
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      data-testid={`training-sheet-${domain}`}
      variant="outline"
      disabled={!sheet?.ready || downloading}
      onClick={() => void download()}
    >
      {downloading ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <FileDown aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
