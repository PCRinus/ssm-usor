import {
  type ApiErrorResponse,
  type TrainingDomain,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronDown, Eye, FileDown, LoaderCircle, ShieldCheck } from 'lucide-react';
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
  const [busy, setBusy] = useState<'download' | 'preview' | 'original' | null>(null);
  const sheet = readiness.data?.[domain];
  const domainLabel = trainingDomainLabels[domain];
  const disabled = !sheet?.ready || busy !== null;
  // Several sheets are served merged into a copy whose signatures no longer verify.
  const originals = sheet && sheet.sequences.length > 1 ? sheet.sequences : [];

  const loadSheet = (sequence?: number) =>
    getTrainingSheet(
      clientId,
      employeeId,
      sequence ? { domain, sequence } : { domain },
      apiRequest
    );

  async function run(kind: 'download' | 'preview' | 'original', action: () => Promise<void>) {
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

  const preview = () => run('preview', () => openPreview(() => loadSheet(), `Fișa ${domainLabel}`));

  const downloadOriginal = (sequence: number) =>
    run('original', async () => {
      const file = await loadSheet(sequence);
      saveFile(file, file instanceof File ? file.name : `Fisa-${domainLabel}-${sequence}.pdf`);
    });

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
        {originals.length > 0
          ? `Descarcă fișa ${domainLabel} (copie de citire)`
          : `Descarcă fișa ${domainLabel}`}
      </Button>
      {originals.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid={`training-sheet-${domain}-originals`}
              disabled={busy !== null}
            >
              {busy === 'original' ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              Originalele
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Fișele semnate, fiecare cu semnăturile ei verificabile
            </DropdownMenuLabel>
            {originals.map((sequence) => (
              <DropdownMenuItem
                key={sequence}
                data-testid={`training-sheet-${domain}-original`}
                onSelect={() => void downloadOriginal(sequence)}
              >
                <FileDown aria-hidden="true" />
                {sequence === 1 ? 'Fișa 1' : `Fișa ${sequence} (continuare)`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
