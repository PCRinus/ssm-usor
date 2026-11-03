import { importErrorReasons, type ImportLibraryPart as PartName } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { createContext, use, useSyncExternalStore } from 'react';

import {
  type ApiErrorResponse,
  getListImportLibraryPartsQueryKey,
  type ImportLibraryPartsResponse,
  saveImportLibraryPartChanges,
  type SaveImportLibraryPartChangesRequest,
  useListImportLibraryParts,
} from '@/api/generated/api';
import { ApiHttpError, type ApiRequestOptions } from '@/api/http';
import { useAuth } from '@/features/auth/auth-context';

import { importErrorMessage } from '../import-format';
import {
  changesOf,
  type InstructionChange,
  type LibraryChanges,
  type LibraryPart,
} from './library-model';
import {
  cleanRiskChanges,
  type FactorChange,
  type RiskChanges,
  riskChangesOf,
  type RisksPart,
  type SheetChange,
} from './risks-model';

const pollMs = 3000;

export function useLibraryParts(importId: string, enabled = true) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  return useListImportLibraryParts(importId, {
    request: apiRequest,
    query: {
      queryKey: [...getListImportLibraryPartsQueryKey(importId), session?.user.id],
      enabled: enabled && Boolean(session && apiRequest.baseUrl),
      refetchInterval: (query) =>
        query.state.data?.parts.some((part) => part.status === 'reading') ? pollMs : false,
    },
  });
}

const reasonOf = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? (cause.body as Partial<ApiErrorResponse> | undefined)?.reason
    : undefined;

const saveFailed = 'Nu am putut salva ultima schimbare. Salvează din nou ca să nu se piardă.';

type ReviewTexts = { savedByOthers: string; notReady: string; expired: string };

const instructionTexts: ReviewTexts = {
  savedByOthers:
    'Altcineva a modificat instrucțiunile între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă pagina și fă-o din nou.',
  notReady:
    'Instrucțiunile nu mai pot fi modificate: au fost confirmate sau citite din nou între timp. Reîncarcă pagina.',
  expired:
    'Propunerea a expirat la 14 zile după crearea clientului, așa că schimbarea ta nu a mai fost salvată, iar instrucțiunile nu mai pot fi confirmate.',
};

const riskTexts: ReviewTexts = {
  savedByOthers:
    'Altcineva a modificat evaluările de risc între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă pagina și fă-o din nou.',
  notReady:
    'Evaluările de risc nu mai pot fi modificate: au fost confirmate sau citite din nou între timp. Reîncarcă pagina.',
  expired:
    'Propunerea a expirat la 14 zile după crearea clientului, așa că schimbarea ta nu a mai fost salvată, iar evaluările de risc nu mai pot fi confirmate.',
};

type Snapshot<C> = {
  changes: C;
  conflict: boolean;
  // Why no save can succeed any more, so none is offered again.
  closed: string | null;
  error: string | null;
  pending: number;
};

// As the client review's store: saves go one after the other, each on the version the previous
// one answered.
export class PartReviewStore<C> {
  private snapshot: Snapshot<C>;
  private version: number;
  private sent: C;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly importId: string,
    private readonly part: PartName,
    initial: { changes: C; version: number },
    private readonly clean: (changes: C) => C,
    private readonly texts: ReviewTexts,
    private readonly apiRequest: ApiRequestOptions,
    private readonly queryClient: QueryClient
  ) {
    this.snapshot = {
      changes: initial.changes,
      conflict: false,
      closed: null,
      error: null,
      pending: 0,
    };
    this.version = initial.version;
    this.sent = initial.changes;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(next: Partial<Snapshot<C>>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  update = (change: (current: C) => C) => {
    if (this.snapshot.conflict || this.snapshot.closed) return;
    const next = this.clean(change(this.snapshot.changes));
    this.set({ changes: next, error: null });
    this.save(next);
  };

  retry = () => {
    if (this.snapshot.conflict || this.snapshot.closed) return;
    this.set({ error: null });
    this.save(this.snapshot.changes);
  };

  private save(changes: C) {
    this.set({ pending: this.snapshot.pending + 1 });
    this.queue = this.queue.then(async () => {
      try {
        if (this.snapshot.conflict || this.snapshot.closed) return;
        const saved = await saveImportLibraryPartChanges(
          this.importId,
          this.part,
          {
            version: this.version,
            changes: changes as SaveImportLibraryPartChangesRequest['changes'],
          },
          this.apiRequest
        );
        this.version = saved.version;
        this.sent = changes;
        if (changes === this.snapshot.changes) this.set({ error: null });
        this.queryClient.setQueriesData<ImportLibraryPartsResponse>(
          { queryKey: getListImportLibraryPartsQueryKey(this.importId) },
          (old) =>
            old
              ? {
                  ...old,
                  parts: old.parts.map((part) =>
                    part.part === this.part
                      ? ({ ...part, version: saved.version, changes } as typeof part)
                      : part
                  ),
                }
              : old
        );
      } catch (cause) {
        const reason = reasonOf(cause);
        if (reason === importErrorReasons.changed) this.set({ conflict: true });
        else if (reason === importErrorReasons.partNotReady) {
          this.set({ closed: this.texts.notReady });
        } else if (reason === importErrorReasons.partExpired) {
          this.set({ closed: this.texts.expired });
        } else this.set({ error: importErrorMessage(cause, saveFailed) });
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
    if (this.unsaved && !this.snapshot.conflict && !this.snapshot.closed) {
      this.retry();
      await this.queue;
    }
    if (this.snapshot.conflict) return { error: this.texts.savedByOthers };
    if (this.snapshot.closed) return { error: this.snapshot.closed };
    if (this.unsaved) return { error: this.snapshot.error ?? saveFailed };
    return { version: this.version };
  };
}

const withoutEmpty = (changes: LibraryChanges): LibraryChanges => ({
  instructions: Object.fromEntries(
    Object.entries(changes.instructions).filter(([, change]) => Object.keys(change).length > 0)
  ),
});

export class LibraryReviewStore extends PartReviewStore<LibraryChanges> {
  constructor(
    importId: string,
    part: PartName,
    initial: Pick<LibraryPart, 'changes' | 'version'>,
    apiRequest: ApiRequestOptions,
    queryClient: QueryClient
  ) {
    super(
      importId,
      part,
      { changes: changesOf(initial.changes), version: initial.version },
      withoutEmpty,
      instructionTexts,
      apiRequest,
      queryClient
    );
  }

  setInstruction = (key: string, change: (current: InstructionChange) => InstructionChange) =>
    this.update((current) => ({
      instructions: { ...current.instructions, [key]: change(current.instructions[key] ?? {}) },
    }));
}

export class RiskReviewStore extends PartReviewStore<RiskChanges> {
  constructor(
    importId: string,
    initial: Pick<RisksPart, 'changes' | 'version'>,
    apiRequest: ApiRequestOptions,
    queryClient: QueryClient
  ) {
    super(
      importId,
      'risk_evaluations',
      { changes: riskChangesOf(initial.changes), version: initial.version },
      cleanRiskChanges,
      riskTexts,
      apiRequest,
      queryClient
    );
  }

  setSheet = (key: string, change: (current: SheetChange) => SheetChange) =>
    this.update((current) => ({
      sheets: { ...current.sheets, [key]: change(current.sheets[key] ?? {}) },
    }));

  setFactor = (sheet: string, key: string, change: (current: FactorChange) => FactorChange) =>
    this.setSheet(sheet, (current) => ({
      ...current,
      factors: { ...current.factors, [key]: change(current.factors?.[key] ?? {}) },
    }));
}

type PartKey = { part: PartName; attempt: number };

export class LibraryReviewStores {
  private stores = new Map<string, unknown>();

  constructor(
    readonly apiRequest: ApiRequestOptions,
    readonly queryClient: QueryClient
  ) {}

  // A part read again is a new proposal, so it gets a store of its own.
  storeFor<S>(importId: string, part: PartKey, make: () => S): S {
    const key = `${importId}:${part.part}:${part.attempt}`;
    let store = this.stores.get(key) as S | undefined;
    if (!store) {
      store = make();
      this.stores.set(key, store);
    }
    return store;
  }

  forget(importId: string, part: PartKey) {
    this.stores.delete(`${importId}:${part.part}:${part.attempt}`);
  }
}

export const LibraryReviewStoresContext = createContext<LibraryReviewStores | null>(null);

function useStores() {
  const stores = use(LibraryReviewStoresContext);
  if (!stores) throw new Error('An import review task needs ImportReviewScope around it');
  return stores;
}

export function useLibraryReview(importId: string, part: LibraryPart) {
  const stores = useStores();
  const store = stores.storeFor(
    importId,
    part,
    () => new LibraryReviewStore(importId, part.part, part, stores.apiRequest, stores.queryClient)
  );
  const { changes, conflict, closed, error, pending } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  return {
    changes,
    conflict,
    closed,
    error,
    saving: pending > 0,
    setInstruction: store.setInstruction,
    retry: store.retry,
    flush: store.flush,
    forget: () => stores.forget(importId, part),
  };
}

export type LibraryReview = ReturnType<typeof useLibraryReview>;

export function useRiskReview(importId: string, part: RisksPart) {
  const stores = useStores();
  const store = stores.storeFor(
    importId,
    part,
    () => new RiskReviewStore(importId, part, stores.apiRequest, stores.queryClient)
  );
  const { changes, conflict, closed, error, pending } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  return {
    changes,
    conflict,
    closed,
    error,
    saving: pending > 0,
    setSheet: store.setSheet,
    setFactor: store.setFactor,
    retry: store.retry,
    flush: store.flush,
    forget: () => stores.forget(importId, part),
  };
}

export type RiskReview = ReturnType<typeof useRiskReview>;
