import { importErrorReasons } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { createContext, use, useSyncExternalStore } from 'react';

import {
  type ApiErrorResponse,
  getGetImportQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
  type ImportDetailResponse,
  saveEmployeeImportChanges,
} from '@/api/generated/api';
import { ApiHttpError, type ApiRequestOptions } from '@/api/http';

import { importErrorMessage } from '../import-format';
import { type Changes, changesOf } from './employee-review-model';

type Snapshot = { changes: Changes; conflict: boolean; error: string | null; pending: number };

const saveFailed = 'Nu am putut salva ultima schimbare. Salvează din nou ca să nu se piardă.';
const savedByOthers =
  'Altcineva a modificat importul între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă pagina și fă-o din nou.';

const isConflict = (cause: unknown) =>
  cause instanceof ApiHttpError &&
  (cause.body as Partial<ApiErrorResponse> | undefined)?.reason === importErrorReasons.changed;

// Saves go one after the other, each on the version the previous one answered; a change made
// while one is on its way is sent once it returns, the latest only.
export class EmployeeReviewStore {
  private snapshot: Snapshot;
  private version: number;
  private sent: Changes;
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly importId: string,
    detail: ImportDetail,
    private readonly apiRequest: ApiRequestOptions,
    private readonly queryClient: QueryClient
  ) {
    const changes = changesOf(detail.employees?.changes);
    this.snapshot = { changes, conflict: false, error: null, pending: 0 };
    this.version = detail.version;
    this.sent = changes;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  update = (mutate: (current: Changes) => Changes) => {
    if (this.snapshot.conflict) return;
    const next = mutate(this.snapshot.changes);
    if (next === this.snapshot.changes) return;
    this.set({ changes: next, error: null });
    this.schedule();
  };

  retry = () => {
    if (this.snapshot.conflict) return;
    this.set({ error: null });
    this.schedule();
  };

  private schedule() {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
  }

  private async drain() {
    this.set({ pending: this.snapshot.pending + 1 });
    try {
      while (this.sent !== this.snapshot.changes && !this.snapshot.conflict) {
        const changes = this.snapshot.changes;
        try {
          const saved = await saveEmployeeImportChanges(
            this.importId,
            { version: this.version, changes },
            this.apiRequest
          );
          this.version = saved.version;
          this.sent = changes;
          this.patchCache(changes, saved.version);
        } catch (cause) {
          if (isConflict(cause)) this.set({ conflict: true });
          else this.set({ error: importErrorMessage(cause, saveFailed) });
          return;
        }
      }
      if (this.sent === this.snapshot.changes) this.set({ error: null });
    } finally {
      this.set({ pending: this.snapshot.pending - 1 });
    }
  }

  private patchCache(changes: Changes, version: number) {
    this.queryClient.setQueriesData<ImportDetailResponse>(
      { queryKey: getGetImportQueryKey(this.importId) },
      (old) =>
        old?.import.employees
          ? {
              import: {
                ...old.import,
                version,
                employees: { ...old.import.employees, changes, states: statesOf(old, changes) },
              },
            }
          : old
    );
    void this.queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
  }

  flush = async (): Promise<{ version: number } | { error: string }> => {
    await this.running;
    if (this.sent !== this.snapshot.changes && !this.snapshot.conflict) {
      this.schedule();
      await this.running;
    }
    if (this.snapshot.conflict) return { error: savedByOthers };
    if (this.sent !== this.snapshot.changes) return { error: this.snapshot.error ?? saveFailed };
    return { version: this.version };
  };

  reload = async () => {
    await this.queryClient.refetchQueries({ queryKey: getGetImportQueryKey(this.importId) });
    const fresh = this.queryClient
      .getQueriesData<ImportDetailResponse>({ queryKey: getGetImportQueryKey(this.importId) })
      .find(([, data]) => data)?.[1];
    if (!fresh) return;
    const reloaded = changesOf(fresh.import.employees?.changes);
    this.version = fresh.import.version;
    this.sent = reloaded;
    this.set({ changes: reloaded, conflict: false, error: null });
  };
}

function statesOf(old: ImportDetailResponse, changes: Changes) {
  const people = old.import.employees?.proposal.people ?? [];
  return Object.fromEntries(
    people.map((person) => [person.id, changes.people[person.id]?.state ?? 'to_check'])
  ) as Record<string, 'to_check' | 'checked' | 'set_aside'>;
}

export class EmployeeReviewStores {
  private stores = new Map<string, EmployeeReviewStore>();

  constructor(
    private readonly apiRequest: ApiRequestOptions,
    private readonly queryClient: QueryClient
  ) {}

  storeFor(detail: ImportDetail) {
    let store = this.stores.get(detail.id);
    if (!store) {
      store = new EmployeeReviewStore(detail.id, detail, this.apiRequest, this.queryClient);
      this.stores.set(detail.id, store);
    }
    return store;
  }
}

export const EmployeeReviewStoresContext = createContext<EmployeeReviewStores | null>(null);

export function useEmployeeReview(detail: ImportDetail) {
  const stores = use(EmployeeReviewStoresContext);
  if (!stores) throw new Error('useEmployeeReview needs EmployeeImportScope around it');
  const store = stores.storeFor(detail);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return {
    changes: snapshot.changes,
    update: store.update,
    saving: snapshot.pending > 0,
    conflict: snapshot.conflict,
    error: snapshot.error,
    retry: store.retry,
    reload: store.reload,
    flush: store.flush,
  };
}

export type EmployeeReview = ReturnType<typeof useEmployeeReview>;
