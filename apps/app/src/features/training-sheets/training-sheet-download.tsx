import {
  type ApiErrorResponse,
  type TrainingDomain,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronDown, Eye, FileDown, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import {
  getGetTrainingSheetsQueryKey,
  getTrainingSheet,
  getTrainingSheetLink,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { FileLinkButton } from '@/components/file-link-button';
import { FileMenuItem } from '@/components/file-menu-item';
import { useFileLink } from '@/lib/file-link';
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
  // Several sheets are served merged into a copy whose signatures no longer verify.
  const originals = sheet && sheet.sequences.length > 1 ? sheet.sequences : [];
  // One stored sheet is a file with a link of its own; a sheet drawn up on the spot and the
  // merged reading copy are built when asked for, so they come through the page.
  const storedSequence = sheet?.stored && sheet.sequences.length === 1 ? sheet.sequences[0]! : null;

  const linkOf = (sequence: number) => ({
    queryKey: ['training-sheet-link', clientId, employeeId, domain, sequence],
    load: (signal: AbortSignal) =>
      getTrainingSheetLink(clientId, employeeId, { domain, sequence }, { ...apiRequest, signal }),
  });
  const stored = { ...linkOf(storedSequence ?? 0), enabled: storedSequence !== null, apiRequest };
  const storedDownload = useFileLink({ ...stored, disposition: 'attachment' });
  const storedPreview = useFileLink({ ...stored, disposition: 'inline' });

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

  const downloadLabel =
    originals.length > 0
      ? `Descarcă fișa ${domainLabel} (copie de citire)`
      : `Descarcă fișa ${domainLabel}`;

  return (
    <>
      {storedSequence !== null ? (
        <FileLinkButton
          data-testid={`training-sheet-${domain}`}
          variant="outline"
          link={storedDownload}
        >
          <FileDown aria-hidden="true" />
          {downloadLabel}
        </FileLinkButton>
      ) : (
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
          {downloadLabel}
        </Button>
      )}
      {originals.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid={`training-sheet-${domain}-originals`}
              disabled={busy !== null}
            >
              <ShieldCheck aria-hidden="true" />
              Originalele
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Fișele semnate, fiecare cu semnăturile ei verificabile
            </DropdownMenuLabel>
            {originals.map((sequence) => (
              <FileMenuItem
                key={sequence}
                testId={`training-sheet-${domain}-original`}
                apiRequest={apiRequest}
                disposition="attachment"
                {...linkOf(sequence)}
              >
                <FileDown aria-hidden="true" />
                {sequence === 1 ? 'Fișa 1' : `Fișa ${sequence} (continuare)`}
              </FileMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {storedSequence !== null ? (
        <FileLinkButton
          data-testid={`training-sheet-${domain}-preview`}
          variant="outline"
          aria-label={`Previzualizează fișa ${domainLabel}`}
          link={storedPreview}
        >
          <Eye aria-hidden="true" />
          Previzualizează
        </FileLinkButton>
      ) : (
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
      )}
    </>
  );
}
