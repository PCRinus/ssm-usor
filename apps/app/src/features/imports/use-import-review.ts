import { importErrorReasons } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { createContext, use, useSyncExternalStore } from 'react';

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
import { ApiHttpError, type ApiRequestOptions } from '@/api/http';

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

const saveFailed = 'Nu am putut salva ultima schimbare. Salvează din nou ca să nu se piardă.';
const savedByOthers =
  'Altcineva a modificat propunerea între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă propunerea și fă-o din nou.';

type ReviewSnapshot = {
  changes: Changes;
  conflict: boolean;
  error: string | null;
  pending: number;
};

// Saves go one after the other, each on the version the previous one answered: two saves sent
// together would both carry the same version and the second would be refused.
export class ReviewStore {
  private snapshot: ReviewSnapshot;
  private version: number;
  private sent: Changes;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly importId: string,
    detail: ImportDetail,
    private readonly apiRequest: ApiRequestOptions,
    private readonly queryClient: QueryClient
  ) {
    const changes = changesOf(detail.changes);
    this.snapshot = { changes, conflict: false, error: null, pending: 0 };
    this.version = detail.version;
    this.sent = changes;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(next: Partial<ReviewSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  update = (mutate: (current: Changes) => Changes) => {
    if (this.snapshot.conflict) return;
    const next = withoutEmpty(mutate(this.snapshot.changes));
    this.set({ changes: next, error: null });
    this.save(next);
  };

  retry = () => {
    if (this.snapshot.conflict) return;
    this.set({ error: null });
    this.save(this.snapshot.changes);
  };

  private save(changes: Changes) {
    this.set({ pending: this.snapshot.pending + 1 });
    this.queue = this.queue.then(async () => {
      try {
        if (this.snapshot.conflict) return;
        const saved = await saveImportChanges(
          this.importId,
          { version: this.version, changes },
          this.apiRequest
        );
        this.version = saved.version;
        this.sent = changes;
        if (changes === this.snapshot.changes) this.set({ error: null });
        this.queryClient.setQueriesData<ImportDetailResponse>(
          { queryKey: getGetImportQueryKey(this.importId) },
          (old) => (old ? { import: { ...old.import, version: saved.version, changes } } : old)
        );
        await this.queryClient.invalidateQueries({
          queryKey: getGetImportQueryKey(this.importId),
        });
      } catch (cause) {
        if (isConflict(cause)) this.set({ conflict: true });
        else this.set({ error: importErrorMessage(cause, saveFailed) });
      } finally {
        this.set({ pending: this.snapshot.pending - 1 });
      }
    });
  }

  private get unsaved() {
    return this.sent !== this.snapshot.changes;
  }

  flush = async (): Promise<{ version: number } | { error: string }> => {
    await this.queue;
    if (this.unsaved && !this.snapshot.conflict) {
      this.retry();
      await this.queue;
    }
    if (this.snapshot.conflict) return { error: savedByOthers };
    if (this.unsaved) return { error: this.snapshot.error ?? saveFailed };
    return { version: this.version };
  };

  reload = async () => {
    await this.queryClient.refetchQueries({ queryKey: getGetImportQueryKey(this.importId) });
    const fresh = this.queryClient
      .getQueriesData<ImportDetailResponse>({ queryKey: getGetImportQueryKey(this.importId) })
      .find(([, data]) => data)?.[1];
    if (!fresh) return;
    const reloaded = changesOf(fresh.import.changes);
    this.version = fresh.import.version;
    this.sent = reloaded;
    this.set({ changes: reloaded, conflict: false, error: null });
  };
}

export class ReviewStores {
  private stores = new Map<string, ReviewStore>();

  constructor(
    private readonly apiRequest: ApiRequestOptions,
    private readonly queryClient: QueryClient
  ) {}

  storeFor(detail: ImportDetail) {
    let store = this.stores.get(detail.id);
    if (!store) {
      store = new ReviewStore(detail.id, detail, this.apiRequest, this.queryClient);
      this.stores.set(detail.id, store);
    }
    return store;
  }
}

export const ReviewStoresContext = createContext<ReviewStores | null>(null);

export function useImportReview(detail: ImportDetail) {
  const stores = use(ReviewStoresContext);
  if (!stores) throw new Error('useImportReview needs ImportReviewScope around it');
  const store = stores.storeFor(detail);
  const { changes, conflict, error, pending } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  const { update } = store;

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

  return {
    changes,
    setField,
    setItem,
    saving: pending > 0,
    conflict,
    error,
    retry: store.retry,
    reload: store.reload,
    flush: store.flush,
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
      if (group === 'trainingSchedule') {
        if (!name.endsWith('NotApplicable')) return detailsRow[name] ?? null;
        // Without an interval, a category not declared "not applicable" is still undecided.
        const interval = detailsRow[name.replace('NotApplicable', 'IntervalMonths')] ?? null;
        const declared = (detailsRow[name] as unknown) === true;
        return declared ? 'true' : interval === null ? null : 'false';
      }
      if (group === 'fireSafety') {
        const value = fireRow[name] as unknown;
        // The card's defaults stand in for a row the client does not have yet.
        if (!fireSafety.data?.exists) return null;
        if (Array.isArray(value)) return value.length > 0 ? value.join('; ') : null;
        if (typeof value === 'boolean') return String(value);
        return fireRow[name] ?? null;
      }
      return undefined;
    },
  };
}
