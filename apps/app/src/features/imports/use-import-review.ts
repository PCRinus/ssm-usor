import { substancesStatePath } from '@ssm-usor/contracts';

import {
  getGetClientDocumentDetailsQueryKey,
  getGetClientFireSafetyQueryKey,
  getGetClientQueryKey,
  getGetImportQueryKey,
  getListFireSubstancesQueryKey,
  getListJobPositionsQueryKey,
  getListWorkplacesQueryKey,
  type ImportDetail,
  type ImportDetailResponse,
  type SaveClientImportChangesResponse,
  saveImportChanges,
  useGetClient,
  useGetClientDocumentDetails,
  useGetClientFireSafety,
  useListFireSubstances,
  useListJobPositions,
  useListWorkplaces,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import { refetchImport } from './refetch-import';
import {
  type Changes,
  changesOf,
  type ExistingWorkplace,
  type FieldChange,
  type ItemChange,
} from './review-model';
import { blockerLinks, fieldStates, reviewName, sectionStatuses } from './review-summary';
import { keptPosts, withoutAbsentCategories } from './training-category';
import {
  type ChangesStores,
  useChangesSnapshot,
  useChangesStores,
  VersionedChangesStore,
} from './versioned-changes-store';

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

const savedByOthers =
  'Altcineva a modificat propunerea între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă propunerea și fă-o din nou.';

function clientReviewStore(detail: ImportDetail, { apiRequest, queryClient }: ChangesStores) {
  const importId = detail.id;
  return new VersionedChangesStore<Changes, SaveClientImportChangesResponse>({
    initial: { changes: changesOf(detail.changes), version: detail.version },
    clean: withoutEmpty,
    savedByOthers,
    save: (version, changes) => saveImportChanges(importId, { version, changes }, apiRequest),
    onSaved: (changes, saved) =>
      queryClient.setQueriesData<ImportDetailResponse>(
        { queryKey: getGetImportQueryKey(importId) },
        (old) =>
          old
            ? {
                import: {
                  ...old.import,
                  version: saved.version,
                  changes,
                  blockers: saved.blockers,
                },
              }
            : old
      ),
    reload: async () => {
      const fresh = await refetchImport(queryClient, importId);
      return fresh ? { changes: changesOf(fresh.changes), version: fresh.version } : null;
    },
  });
}

export function useImportReview(detail: ImportDetail) {
  const stores = useChangesStores();
  const store = stores.storeFor(`client:${detail.id}`, () => clientReviewStore(detail, stores));
  const { changes, conflict, error, saving } = useChangesSnapshot(store);
  const { update } = store;

  const setField = (path: string, change: FieldChange | null) =>
    update((current) => {
      const fields = { ...current.fields };
      if (change === null) delete fields[path];
      else fields[path] = change;
      return { ...current, fields };
    });

  const setFields = (changed: Record<string, FieldChange | null>) =>
    update((current) => {
      const fields = { ...current.fields };
      for (const [path, change] of Object.entries(changed)) {
        if (change === null) delete fields[path];
        else fields[path] = change;
      }
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
    setFields,
    setItem,
    saving,
    conflict,
    error,
    retry: store.retry,
    reload: store.reload,
    flush: store.flush,
  };
}

export type ImportReview = ReturnType<typeof useImportReview>;

export function useClientReview(detail: ImportDetail) {
  const proposal = detail.proposal!;
  const review = useImportReview(detail);
  const existing = useExistingValues(detail);
  const blockers = detail.blockers;
  const registered = detail.registeredCompany;
  const states = fieldStates(
    proposal,
    review.changes,
    existing.valueAt,
    detail.intoExistingClient ? null : registered
  );
  const applying = withoutAbsentCategories(
    states,
    keptPosts(proposal, review.changes, existing.positions)
  );
  return {
    proposal,
    review,
    existing,
    blockers,
    states,
    applying,
    statuses: sectionStatuses(proposal, review.changes, blockers, applying, registered),
    links: blockerLinks(proposal, review.changes, blockers),
    name: reviewName(detail, proposal, review.changes),
  };
}

export function useExistingValues(detail: ImportDetail) {
  const { request, key } = useApi();
  const clientId = detail.intoExistingClient ? (detail.client?.id ?? '') : '';
  const enabled = clientId !== '';
  const client = useGetClient(clientId, {
    request,
    query: { queryKey: key(getGetClientQueryKey(clientId)), enabled },
  });
  const details = useGetClientDocumentDetails(clientId, {
    request,
    query: { queryKey: key(getGetClientDocumentDetailsQueryKey(clientId)), enabled },
  });
  const fireSafety = useGetClientFireSafety(clientId, {
    request,
    query: { queryKey: key(getGetClientFireSafetyQueryKey(clientId)), enabled },
  });
  const positions = useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)), enabled },
  });
  const substances = useListFireSubstances(clientId, {
    request,
    query: { queryKey: key(getListFireSubstancesQueryKey(clientId)), enabled },
  });
  const workplaces = useListWorkplaces(clientId, {
    request,
    query: { queryKey: key(getListWorkplacesQueryKey(clientId)), enabled },
  });
  if (!enabled) {
    return {
      ready: true,
      valueAt: () => undefined,
      positions: [],
      substanceNames: [],
      workplaces: [] as ExistingWorkplace[],
      positionsFailed: false,
      positionsError: null,
      positionsRetrying: false,
      retryPositions: () => undefined,
    };
  }
  const record = (value: unknown) => (value ?? {}) as Record<string, string | number | null>;
  const clientRow = record(client.data?.client);
  const detailsRow = record(details.data?.documentDetails);
  const fireRow = record(fireSafety.data?.fireSafety);
  return {
    ready:
      client.isSuccess &&
      details.isSuccess &&
      !fireSafety.isPending &&
      positions.isSuccess &&
      !substances.isPending &&
      !workplaces.isPending,
    positionsFailed: positions.isError,
    positionsError: positions.error,
    positionsRetrying: positions.isFetching,
    retryPositions: () => void positions.refetch(),
    positions: (positions.data?.items ?? []).map((position) => ({
      id: position.id,
      name: position.name,
      staffCategory: position.staffCategory,
    })),
    substanceNames: (substances.data?.items ?? []).map((substance) => substance.name),
    workplaces: (workplaces.data?.items ?? []).map((workplace): ExistingWorkplace => ({
      id: workplace.id,
      name: workplace.name,
      addressLine: workplace.addressLine,
      isRegisteredOffice: workplace.isRegisteredOffice,
      officeHasActivity: workplace.officeHasActivity,
    })),
    valueAt: (path: string): string | number | null | undefined => {
      const [group, name] = path.split('.') as [string, string];
      if (group === 'client') {
        return name.startsWith('legalRepresentative')
          ? (detailsRow[name] ?? null)
          : (clientRow[name] ?? null);
      }
      if (group === 'trainingSchedule') return detailsRow[name] ?? null;
      // Undecided is no answer yet, which the import fills like an empty value.
      if (path === substancesStatePath) {
        const state = substances.data?.state;
        return state === 'none' || state === 'listed' ? state : null;
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
