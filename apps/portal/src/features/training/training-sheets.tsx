import {
  type ApiErrorResponse,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { FileDown, FileText, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import type { PortalTrainingSheetsResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { openPreview, PreviewBlockedError, saveFile } from '@/lib/save-file';

import { missingSheetDataSentence } from './missing-sheet-data';

const failureOf = (cause: unknown) => {
  if (cause instanceof PreviewBlockedError) {
    return 'Browserul a blocat fereastra nouă. Permite ferestrele noi pentru portal sau descarcă fișa.';
  }
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'missing_sheet_data') {
    return 'Fișa nu poate fi întocmită încă: lipsesc date pe care le completează specialistul.';
  }
  if (body?.reason === 'pdf_unavailable') {
    return 'Fișa nu poate fi pregătită acum. Încearcă din nou peste câteva minute.';
  }
  return 'Nu am putut deschide fișa. Verifică conexiunea la internet și încearcă din nou.';
};

type TrainingSheetsProps = {
  sheets: PortalTrainingSheetsResponse | undefined;
  failed: boolean;
  loadSheet: (domain: TrainingDomain) => Promise<Blob>;
  // A sheet that turned out not ready when opened: the readiness shown was stale.
  onStale: () => void;
};

export function TrainingSheets({ sheets, failed, loadSheet, onStale }: TrainingSheetsProps) {
  return (
    <section aria-labelledby="training-sheets-title" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="training-sheets-title" className="text-lg font-semibold">
          Fișele individuale de instruire
        </h2>
        <p className="text-sm text-muted-foreground">
          Se întocmesc din instruirile înregistrate, de fiecare dată când le deschizi.
        </p>
      </div>
      {failed ? (
        <Notice variant="destructive" data-testid="training-sheets-error">
          Nu am putut verifica fișele. Reîncarcă pagina.
        </Notice>
      ) : (
        <ul className="grid gap-3">
          {trainingDomains.map((domain) => (
            <TrainingSheetRow
              key={domain}
              domain={domain}
              sheet={sheets?.[domain]}
              loadSheet={() => loadSheet(domain)}
              onStale={onStale}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TrainingSheetRow({
  domain,
  sheet,
  loadSheet,
  onStale,
}: {
  domain: TrainingDomain;
  sheet: PortalTrainingSheetsResponse[TrainingDomain] | undefined;
  loadSheet: () => Promise<Blob>;
  onStale: () => void;
}) {
  const [busy, setBusy] = useState<'open' | 'download' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const label = trainingDomainLabels[domain];

  async function run(kind: 'open' | 'download', action: () => Promise<void>) {
    setBusy(kind);
    setFailure(null);
    try {
      await action();
    } catch (cause) {
      setFailure(failureOf(cause));
      if (cause instanceof ApiHttpError && cause.status === 409) onStale();
    } finally {
      setBusy(null);
    }
  }

  const open = () => run('open', () => openPreview(loadSheet, `Fișa ${label}`));
  const download = () =>
    run('download', async () => {
      const file = await loadSheet();
      saveFile(file, file instanceof File ? file.name : `Fisa-${label}.pdf`);
    });

  return (
    <li
      data-testid={`training-sheet-${domain}`}
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <FileText aria-hidden="true" className="size-5 text-muted-foreground" />
        Fișa {label}
      </h3>
      {!sheet ? (
        <p role="status" className="text-sm text-muted-foreground">
          Se verifică…
        </p>
      ) : sheet.ready ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid={`training-sheet-${domain}-open`}
            className="h-12"
            disabled={busy !== null}
            onClick={() => void open()}
          >
            {busy === 'open' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FileText aria-hidden="true" />
            )}
            Deschide PDF
          </Button>
          <Button
            variant="outline"
            data-testid={`training-sheet-${domain}-download`}
            className="h-12"
            aria-label={`Descarcă fișa ${label}`}
            disabled={busy !== null}
            onClick={() => void download()}
          >
            {busy === 'download' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <FileDown aria-hidden="true" />
            )}
            Descarcă
          </Button>
        </div>
      ) : (
        <p data-testid={`training-sheet-${domain}-missing`} className="text-sm leading-relaxed">
          {missingSheetDataSentence(sheet.missing)}
        </p>
      )}
      {failure && (
        <Notice variant="destructive" data-testid={`training-sheet-${domain}-error`}>
          {failure}
        </Notice>
      )}
    </li>
  );
}
