import { importErrorReasons } from '@ssm-usor/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  getGetClientDocumentDetailsQueryKey,
  getGetClientFireSafetyQueryKey,
  getGetClientQueryKey,
  getGetImportQueryKey,
  type ImportDetail,
  type ImportDetailResponse,
  saveImportChanges,
  useGetClient,
  useGetClientDocumentDetails,
  useGetClientFireSafety,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

import { importErrorMessage } from './import-format';
import { type Changes, changesOf, type FieldChange, type ItemChange } from './review-model';

function withoutEmpty(changes: Changes): Changes {
  const fields = Object.fromEntries(
    Object.entries(changes.fields).filter(([, change]) => Object.keys(change).length > 0)
  );
  const items = Object.fromEntries(
    Object.entries(changes.items).filter(
      ([, change]) =>
        change.included !== undefined ||
        Object.keys(change.values ?? {}).length > 0 ||
        change.existingId !== undefined ||
        (change.replace ?? []).length > 0
    )
  );
  return { fields, items };
}

const isConflict = (cause: unknown) =>
  cause instanceof ApiHttpError &&
  (cause.body as Partial<ApiErrorResponse> | undefined)?.reason === importErrorReasons.changed;

// Saves go one after the other, each on the version the previous one answered: two saves sent
// together would both carry the same version and the second would be refused.
export function useImportReview(detail: ImportDetail) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [changes, setChanges] = useState<Changes>(() => changesOf(detail.changes));
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const latest = useRef<Changes>(changesOf(detail.changes));
  const version = useRef(detail.version);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const stopped = useRef(false);

  function update(mutate: (current: Changes) => Changes) {
    if (stopped.current) return;
    const next = withoutEmpty(mutate(latest.current));
    latest.current = next;
    setChanges(next);
    setError(null);
    setPending((count) => count + 1);
    queue.current = queue.current.then(async () => {
      try {
        if (stopped.current) return;
        const saved = await saveImportChanges(
          detail.id,
          { version: version.current, changes: next },
          apiRequest
        );
        version.current = saved.version;
        queryClient.setQueriesData<ImportDetailResponse>(
          { queryKey: getGetImportQueryKey(detail.id) },
          (old) =>
            old ? { import: { ...old.import, version: saved.version, changes: next } } : old
        );
        await queryClient.invalidateQueries({ queryKey: getGetImportQueryKey(detail.id) });
      } catch (cause) {
        if (isConflict(cause)) {
          stopped.current = true;
          setConflict(true);
        } else {
          setError(importErrorMessage(cause, 'Nu am putut salva schimbarea. Încearcă din nou.'));
        }
      } finally {
        setPending((count) => count - 1);
      }
    });
  }

  const setField = (path: string, change: FieldChange | null) =>
    update((current) => {
      const fields = { ...current.fields };
      if (change === null) delete fields[path];
      else fields[path] = change;
      return { ...current, fields };
    });

  const setItem = (id: string, change: (current: ItemChange) => ItemChange) =>
    update((current) => ({
      ...current,
      items: { ...current.items, [id]: change(current.items[id] ?? {}) },
    }));

  async function reload() {
    await queryClient.refetchQueries({ queryKey: getGetImportQueryKey(detail.id) });
    const fresh = queryClient
      .getQueriesData<ImportDetailResponse>({ queryKey: getGetImportQueryKey(detail.id) })
      .find(([, data]) => data)?.[1];
    if (!fresh) return;
    const reloaded = changesOf(fresh.import.changes);
    latest.current = reloaded;
    version.current = fresh.import.version;
    stopped.current = false;
    setChanges(reloaded);
    setConflict(false);
  }

  return {
    changes,
    setField,
    setItem,
    saving: pending > 0,
    conflict,
    error,
    reload,
    settled: () => queue.current,
  };
}

export type ImportReview = ReturnType<typeof useImportReview>;

export function useExistingValues(detail: ImportDetail) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const clientId = detail.intoExistingClient ? (detail.client?.id ?? '') : '';
  const enabled = clientId !== '';
  const client = useGetClient(clientId, {
    request: apiRequest,
    query: { queryKey: getGetClientQueryKey(clientId), enabled },
  });
  const details = useGetClientDocumentDetails(clientId, {
    request: apiRequest,
    query: { queryKey: getGetClientDocumentDetailsQueryKey(clientId), enabled },
  });
  const fireSafety = useGetClientFireSafety(clientId, {
    request: apiRequest,
    query: { queryKey: getGetClientFireSafetyQueryKey(clientId), enabled },
  });
  if (!enabled) return { ready: true, valueAt: () => undefined };
  const record = (value: unknown) => (value ?? {}) as Record<string, string | number | null>;
  const clientRow = record(client.data?.client);
  const detailsRow = record(details.data?.documentDetails);
  const fireRow = record(fireSafety.data?.fireSafety);
  return {
    ready: client.isSuccess && details.isSuccess && !fireSafety.isPending,
    valueAt: (path: string): string | number | null | undefined => {
      const [group, name] = path.split('.') as [string, string];
      if (group === 'client') {
        return name.startsWith('legalRepresentative')
          ? (detailsRow[name] ?? null)
          : (clientRow[name] ?? null);
      }
      if (group === 'trainingSchedule') return detailsRow[name] ?? null;
      if (group === 'fireSafety') return fireRow[name] ?? null;
      return undefined;
    },
  };
}
