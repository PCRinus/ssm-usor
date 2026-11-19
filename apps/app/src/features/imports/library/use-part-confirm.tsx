import { importErrorReasons } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

import {
  type ApiErrorResponse,
  confirmImportLibraryPart,
  type ConfirmImportLibraryPartResponse,
  getListImportLibraryPartsQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
  retryImportLibraryPart,
} from '@/api/generated/api';
import { apiErrorBody } from '@/api/http';
import { useApi } from '@/api/use-api';
import { useReturnToOpener } from '@/app/use-return-to-opener';

import { importErrorMessage } from '../import-format';
import { libraryDay } from './library-model';
import { type AnyPart, ClientPrerequisiteNote } from './part-task';

type ConfirmBody = Partial<ApiErrorResponse> | undefined;

export function usePartConfirm({
  detail,
  part,
  review,
  invalidate,
  doneText,
  reasons,
  failed,
  onRefused,
}: {
  detail: ImportDetail;
  part: AnyPart;
  review: {
    flush: () => Promise<{ version: number } | { error: string }>;
    forget: () => void;
  };
  invalidate: (queryClient: QueryClient) => Promise<unknown>;
  doneText: (result: ConfirmImportLibraryPartResponse) => string;
  reasons: Record<string, string>;
  failed: string;
  // Undefined leaves the sentence to `reasons` and `failed`.
  onRefused?: (reason: string | undefined, body: ConfirmBody) => string | undefined;
}) {
  const { request } = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const returnToImport = useReturnToOpener(`/clienti/import/${detail.id}`);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListImportLibraryPartsQueryKey(detail.id) });

  async function confirm() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const saved = await review.flush();
      if ('error' in saved) {
        setConfirmError(saved.error);
        return;
      }
      const result = await confirmImportLibraryPart(
        detail.id,
        part.part,
        { version: saved.version },
        request
      );
      await Promise.all([
        refresh(),
        invalidate(queryClient),
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
        detail.client &&
          queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              String(queryKey[0]).startsWith(`/clients/${detail.client!.id}`),
          }),
      ]);
      toast.success(doneText(result));
      if (!returnToImport()) {
        await navigate({ to: '/clienti/import/$importId', params: { importId: detail.id } });
      }
    } catch (cause) {
      const body = apiErrorBody(cause);
      const reason = body?.reason;
      setConfirmError(
        onRefused?.(reason, body) ??
          (reason && Object.hasOwn(reasons, reason)
            ? reasons[reason]!
            : importErrorMessage(cause, failed))
      );
    } finally {
      setConfirming(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await retryImportLibraryPart(detail.id, part.part, request);
      review.forget();
      await refresh();
    } catch (cause) {
      toast.error(importErrorMessage(cause, 'Nu am putut porni citirea. Încearcă din nou.'));
    } finally {
      setRetrying(false);
    }
  }

  return { confirming, confirmError, confirm, retrying, retry };
}

// `these` is the part's plural with its article, `one` a single item: „instrucțiunile”, „o instrucțiune”.
export function partConfirmReasons({ these, one }: { these: string; one: string }) {
  const These = `${these.charAt(0).toUpperCase()}${these.slice(1)}`;
  return {
    [importErrorReasons.clientUnconfirmed]: `Confirmă întâi clientul: ${these} se aplică la posturile lui.`,
    [importErrorReasons.partExpired]:
      'Propunerea a expirat la 14 zile după crearea clientului, așa că nu mai poate fi confirmată.',
    [importErrorReasons.partNotReady]: `${These} au fost confirmate sau citite din nou între timp. Reîncarcă pagina.`,
    [importErrorReasons.changed]: `Altcineva a modificat ${these} între timp. Reîncarcă pagina ca să vezi ce s-a schimbat.`,
    [importErrorReasons.outdated]: `Clientul sau biblioteca s-au schimbat între timp: un post sau ${one} nu mai există. Reîncarcă pagina și alege din nou.`,
  };
}

export function partConfirmNote({
  closed,
  reviewable,
  clientConfirmed,
  intoExistingClient,
  expiresAt,
}: {
  closed: string | null;
  reviewable: boolean;
  clientConfirmed: boolean;
  intoExistingClient: boolean;
  expiresAt: string | null;
}): ReactNode {
  if (closed) return 'Reîncarcă pagina pentru starea actuală.';
  if (!reviewable) return undefined;
  if (!clientConfirmed) return <ClientPrerequisiteNote intoExistingClient={intoExistingClient} />;
  return expiresAt ? `Poți confirma până pe ${libraryDay(expiresAt)}.` : undefined;
}
