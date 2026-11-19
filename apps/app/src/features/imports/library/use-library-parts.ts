import { importErrorReasons, type ImportLibraryPart as PartName } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

import {
  getListImportLibraryPartsQueryKey,
  type ImportLibraryPartsResponse,
  saveImportLibraryPartChanges,
  type SaveImportLibraryPartChangesRequest,
  useListImportLibraryParts,
} from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';
import { useApi } from '@/api/use-api';

import {
  type ChangesStoreOptions,
  type Saved,
  useChangesSnapshot,
  useChangesStores,
  type VersionedChanges,
  VersionedChangesStore,
} from '../versioned-changes-store';
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
  const { request, ready, key } = useApi();
  return useListImportLibraryParts(importId, {
    request,
    query: {
      queryKey: key(getListImportLibraryPartsQueryKey(importId)),
      enabled: enabled && ready,
      refetchInterval: (query) =>
        query.state.data?.parts.some((part) => part.status === 'reading') ? pollMs : false,
    },
  });
}

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

function partOptions<C>(
  importId: string,
  part: PartName,
  initial: VersionedChanges<C>,
  clean: (changes: C) => C,
  texts: ReviewTexts,
  apiRequest: ApiRequestOptions,
  queryClient: QueryClient
): ChangesStoreOptions<C, Saved> {
  return {
    initial,
    clean,
    savedByOthers: texts.savedByOthers,
    closedBy: {
      [importErrorReasons.partNotReady]: texts.notReady,
      [importErrorReasons.partExpired]: texts.expired,
    },
    save: (version, changes) =>
      saveImportLibraryPartChanges(
        importId,
        part,
        { version, changes: changes as SaveImportLibraryPartChangesRequest['changes'] },
        apiRequest
      ),
    onSaved: (changes, saved) =>
      queryClient.setQueriesData<ImportLibraryPartsResponse>(
        { queryKey: getListImportLibraryPartsQueryKey(importId) },
        (old) =>
          old
            ? {
                ...old,
                parts: old.parts.map((each) =>
                  each.part === part
                    ? ({ ...each, version: saved.version, changes } as typeof each)
                    : each
                ),
              }
            : old
      ),
  };
}

const withoutEmpty = (changes: LibraryChanges): LibraryChanges => ({
  instructions: Object.fromEntries(
    Object.entries(changes.instructions).filter(([, change]) => Object.keys(change).length > 0)
  ),
});

export class LibraryReviewStore extends VersionedChangesStore<LibraryChanges> {
  constructor(
    importId: string,
    part: PartName,
    initial: Pick<LibraryPart, 'changes' | 'version'>,
    apiRequest: ApiRequestOptions,
    queryClient: QueryClient
  ) {
    super(
      partOptions(
        importId,
        part,
        { changes: changesOf(initial.changes), version: initial.version },
        withoutEmpty,
        instructionTexts,
        apiRequest,
        queryClient
      )
    );
  }

  setInstruction = (key: string, change: (current: InstructionChange) => InstructionChange) =>
    this.update((current) => ({
      instructions: { ...current.instructions, [key]: change(current.instructions[key] ?? {}) },
    }));
}

export class RiskReviewStore extends VersionedChangesStore<RiskChanges> {
  constructor(
    importId: string,
    initial: Pick<RisksPart, 'changes' | 'version'>,
    apiRequest: ApiRequestOptions,
    queryClient: QueryClient
  ) {
    super(
      partOptions(
        importId,
        'risk_evaluations',
        { changes: riskChangesOf(initial.changes), version: initial.version },
        cleanRiskChanges,
        riskTexts,
        apiRequest,
        queryClient
      )
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

// A part read again is a new proposal, so it gets a store of its own.
const partKey = (importId: string, part: PartKey) => `${importId}:${part.part}:${part.attempt}`;

export function useLibraryReview(importId: string, part: LibraryPart) {
  const stores = useChangesStores();
  const key = partKey(importId, part);
  const store = stores.storeFor(
    key,
    () => new LibraryReviewStore(importId, part.part, part, stores.apiRequest, stores.queryClient)
  );
  const { changes, conflict, closed, error, saving } = useChangesSnapshot(store);
  return {
    changes,
    conflict,
    closed,
    error,
    saving,
    setInstruction: store.setInstruction,
    retry: store.retry,
    flush: store.flush,
    forget: () => stores.forget(key),
  };
}

export type LibraryReview = ReturnType<typeof useLibraryReview>;

export function useRiskReview(importId: string, part: RisksPart) {
  const stores = useChangesStores();
  const key = partKey(importId, part);
  const store = stores.storeFor(
    key,
    () => new RiskReviewStore(importId, part, stores.apiRequest, stores.queryClient)
  );
  const { changes, conflict, closed, error, saving } = useChangesSnapshot(store);
  return {
    changes,
    conflict,
    closed,
    error,
    saving,
    setSheet: store.setSheet,
    setFactor: store.setFactor,
    retry: store.retry,
    flush: store.flush,
    forget: () => stores.forget(key),
  };
}

export type RiskReview = ReturnType<typeof useRiskReview>;
