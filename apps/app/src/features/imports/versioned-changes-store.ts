import { importErrorReasons } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { createContext, use, useSyncExternalStore } from 'react';

import { getGetImportQueryKey, type ImportDetailResponse } from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';

import { importErrorMessage, importErrorReason } from './import-format';

export type Saved = { version: number };

export type VersionedChanges<C> = { changes: C; version: number };

export type ChangesStoreOptions<C, R extends Saved> = {
  initial: VersionedChanges<C>;
  save: (version: number, changes: C) => Promise<R>;
  onSaved?: (changes: C, saved: R) => void;
  clean?: (changes: C) => C;
  savedByOthers: string;
  // The refusals after which no save can succeed any more, each with the sentence that says why.
  closedBy?: Partial<Record<string, string>>;
  reload?: () => Promise<VersionedChanges<C> | null>;
};

export type ChangesSnapshot<C> = {
  changes: C;
  conflict: boolean;
  closed: string | null;
  error: string | null;
  saving: boolean;
};

const saveFailed = 'Nu am putut salva ultima schimbare. Salvează din nou ca să nu se piardă.';

// Each save replaces the whole changes on the version the previous one answered, so saves go one
// at a time and a change made while one is on its way is sent once it returns, the latest only:
// the changes in between would only be overwritten.
export class VersionedChangesStore<C, R extends Saved = Saved> {
  private snapshot: ChangesSnapshot<C>;
  private version: number;
  private sent: C;
  private running: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly options: ChangesStoreOptions<C, R>) {
    this.snapshot = {
      changes: options.initial.changes,
      conflict: false,
      closed: null,
      error: null,
      saving: false,
    };
    this.version = options.initial.version;
    this.sent = options.initial.changes;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(next: Partial<ChangesSnapshot<C>>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  private get stopped() {
    return this.snapshot.conflict || this.snapshot.closed !== null;
  }

  private get unsaved() {
    return this.sent !== this.snapshot.changes;
  }

  update = (mutate: (current: C) => C) => {
    if (this.stopped) return;
    const current = this.snapshot.changes;
    const next = this.options.clean ? this.options.clean(mutate(current)) : mutate(current);
    if (next === current) return;
    this.set({ changes: next, error: null });
    this.schedule();
  };

  retry = () => {
    if (this.stopped) return;
    this.set({ error: null });
    this.schedule();
  };

  private schedule() {
    if (this.running) return;
    this.set({ saving: true });
    this.running = this.drain().finally(() => {
      this.running = null;
      // A change made after the last check of the loop, before this ran, still goes out.
      if (this.unsaved && !this.stopped && !this.snapshot.error) this.schedule();
      else this.set({ saving: false });
    });
  }

  private async drain() {
    while (this.unsaved && !this.stopped) {
      const changes = this.snapshot.changes;
      try {
        const saved = await this.options.save(this.version, changes);
        this.version = saved.version;
        this.sent = changes;
        this.options.onSaved?.(changes, saved);
      } catch (cause) {
        this.refused(cause);
        return;
      }
    }
    if (!this.unsaved) this.set({ error: null });
  }

  private refused(cause: unknown) {
    const reason = importErrorReason(cause);
    const closed = reason ? this.options.closedBy?.[reason] : undefined;
    if (reason === importErrorReasons.changed) this.set({ conflict: true });
    else if (closed) this.set({ closed });
    else this.set({ error: importErrorMessage(cause, saveFailed) });
  }

  flush = async (): Promise<{ version: number } | { error: string }> => {
    await this.running;
    if (this.unsaved && !this.stopped) {
      this.retry();
      await this.running;
    }
    if (this.snapshot.conflict) return { error: this.options.savedByOthers };
    if (this.snapshot.closed) return { error: this.snapshot.closed };
    if (this.unsaved) return { error: this.snapshot.error ?? saveFailed };
    return { version: this.version };
  };

  reload = async () => {
    const fresh = await this.options.reload?.();
    if (!fresh) return;
    this.version = fresh.version;
    this.sent = fresh.changes;
    this.set({ changes: fresh.changes, conflict: false, closed: null, error: null });
  };
}

export class ChangesStores {
  private stores = new Map<string, unknown>();

  constructor(
    readonly apiRequest: ApiRequestOptions,
    readonly queryClient: QueryClient
  ) {}

  storeFor<S>(key: string, make: () => S): S {
    let store = this.stores.get(key) as S | undefined;
    if (!store) {
      store = make();
      this.stores.set(key, store);
    }
    return store;
  }

  forget(key: string) {
    this.stores.delete(key);
  }
}

export const ChangesStoresContext = createContext<ChangesStores | null>(null);

export function useChangesStores() {
  const stores = use(ChangesStoresContext);
  if (!stores) throw new Error('An import review needs its import scope around it');
  return stores;
}

export function useChangesSnapshot<C, R extends Saved>(store: VersionedChangesStore<C, R>) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export async function refetchImport(queryClient: QueryClient, importId: string) {
  await queryClient.refetchQueries({ queryKey: getGetImportQueryKey(importId) });
  return queryClient
    .getQueriesData<ImportDetailResponse>({ queryKey: getGetImportQueryKey(importId) })
    .find(([, data]) => data)?.[1]?.import;
}
