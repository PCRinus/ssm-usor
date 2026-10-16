import {
  type ApiErrorResponse,
  missingSheetDataLabels,
  type TrainingDomain,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { FileDown, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import {
  getGetTrainingSheetsQueryKey,
  getTrainingSheet,
  useGetTrainingSheets,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { saveFile } from '@/lib/save-file';

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
  const readiness = useGetTrainingSheets(clientId, employeeId, { request: apiRequest });
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
    <div className="grid gap-3" data-testid={`training-sheet-${domain}`}>
      <Button
        className="w-fit"
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
      {sheet && !sheet.ready && (
        <Notice
          variant="warning"
          action={
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link
                to="/clients/$clientId/employees/$employeeId/edit"
                params={{ clientId, employeeId }}
              >
                Completează datele
              </Link>
            </Button>
          }
        >
          Fișa nu se poate întocmi până nu completezi:{' '}
          {sheet.missing.map((code) => missingSheetDataLabels[code]).join(', ')}.
        </Notice>
      )}
      {readiness.isError && (
        <Notice variant="destructive">
          Nu am putut verifica dacă fișa se poate întocmi. Reîncarcă pagina.
        </Notice>
      )}
    </div>
  );
}
