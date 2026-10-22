import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { ApiErrorResponse, TrainingDomain } from '@ssm-usor/contracts';
import { useState } from 'react';

import type { PortalTrainingSheetsResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { type Disposition, type FileLink, useFileLink } from '@/lib/file-link';
import { trainingDomainMessages } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';
import { openPreview, PreviewBlockedError, saveFile } from '@/lib/save-file';

function failureOf(cause: unknown): MessageDescriptor {
  if (cause instanceof PreviewBlockedError) {
    return msg`Browserul a blocat fereastra nouă. Permite ferestrele noi pentru portal sau descarcă fișa.`;
  }
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'missing_sheet_data') {
    return msg`Fișa nu poate fi întocmită încă: lipsesc date pe care le completează specialistul.`;
  }
  if (body?.reason === 'pdf_unavailable') {
    return msg`Fișa nu poate fi pregătită acum. Încearcă din nou peste câteva minute.`;
  }
  return msg`Nu am putut deschide fișa. Verifică conexiunea la internet și încearcă din nou.`;
}

// Without a sequence, a sheet with continuation sheets comes as one merged copy to read.
export type LoadSheet = (domain: TrainingDomain, sequence?: number) => Promise<Blob>;

// Only a stored sheet has a link; a sheet drawn up on the spot and the merged reading copy come
// through `LoadSheet`.
export type LoadSheetLink = (
  domain: TrainingDomain,
  sequence: number,
  signal: AbortSignal
) => Promise<FileLink>;

// The query cache outlives a page: an administrator sees several employees' sheets, and without
// whose sheet it is in the key, one employee's link would stand in for another's.
export type SheetLinks = { loadLink: LoadSheetLink; linkScope: readonly string[] };

export type SheetAccess = SheetLinks & {
  sheets: PortalTrainingSheetsResponse | undefined;
  loadSheet: LoadSheet;
  onStale: () => void;
};

export const storedSequenceOf = (
  sheet: PortalTrainingSheetsResponse[TrainingDomain] | undefined
) => (sheet?.stored && sheet.sequences.length === 1 ? sheet.sequences[0]! : null);

export function useStoredSheetLink(
  domain: TrainingDomain,
  sequence: number | null,
  { loadLink, linkScope }: SheetLinks,
  disposition: Disposition
) {
  const apiRequest = useApiRequest();
  return useFileLink({
    queryKey: ['training-sheet-link', ...linkScope, domain, sequence],
    load: (signal) => loadLink(domain, sequence ?? 0, signal),
    enabled: sequence !== null,
    apiRequest,
    disposition,
  });
}

type Busy = 'open' | 'download' | `original-${number}`;

export function useSheetActions(
  domain: TrainingDomain,
  loadSheet: LoadSheet,
  // A sheet that turned out not ready when opened: the readiness shown was stale.
  onStale: () => void
) {
  const { t, i18n } = useLingui();
  const [busy, setBusy] = useState<Busy | null>(null);
  const [failure, setFailure] = useState<MessageDescriptor | null>(null);
  const label = i18n._(trainingDomainMessages[domain]);

  async function run(kind: Busy, action: () => Promise<void>) {
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

  return {
    busy,
    failure: failure && i18n._(failure),
    open: () =>
      run('open', () =>
        openPreview(() => loadSheet(domain), {
          title: t`Fișa individuală ${label}`,
          pending: t`Se pregătește fișa…`,
        })
      ),
    download: () =>
      run('download', async () => {
        const file = await loadSheet(domain);
        saveFile(file, file instanceof File ? file.name : t`Fisa-individuala-${label}.pdf`);
      }),
    downloadOriginal: (sequence: number) =>
      run(`original-${sequence}`, async () => {
        const file = await loadSheet(domain, sequence);
        saveFile(
          file,
          file instanceof File ? file.name : t`Fisa-individuala-${label}-${sequence}.pdf`
        );
      }),
  };
}
