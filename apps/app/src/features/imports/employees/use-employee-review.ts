import {
  getGetImportQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
  type ImportDetailResponse,
  saveEmployeeImportChanges,
} from '@/api/generated/api';

import {
  type ChangesStores,
  refetchImport,
  useChangesSnapshot,
  useChangesStores,
  VersionedChangesStore,
} from '../versioned-changes-store';
import { type Changes, changesOf, type Proposal, statesOf } from './employee-review-model';

const savedByOthers =
  'Altcineva a modificat importul între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă pagina și fă-o din nou.';

function employeeReviewStore(detail: ImportDetail, { apiRequest, queryClient }: ChangesStores) {
  const importId = detail.id;
  return new VersionedChangesStore<Changes>({
    initial: { changes: changesOf(detail.employees?.changes), version: detail.version },
    savedByOthers,
    save: (version, changes) =>
      saveEmployeeImportChanges(importId, { version, changes }, apiRequest),
    onSaved: (changes, { version }) => {
      queryClient.setQueriesData<ImportDetailResponse>(
        { queryKey: getGetImportQueryKey(importId) },
        (old) =>
          old?.import.employees
            ? {
                import: {
                  ...old.import,
                  version,
                  employees: {
                    ...old.import.employees,
                    changes,
                    states: statesOf(old.import.employees.proposal as Proposal, changes),
                  },
                },
              }
            : old
      );
      void queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
    },
    reload: async () => {
      const fresh = await refetchImport(queryClient, importId);
      return fresh
        ? { changes: changesOf(fresh.employees?.changes), version: fresh.version }
        : null;
    },
  });
}

export function useEmployeeReview(detail: ImportDetail) {
  const stores = useChangesStores();
  const store = stores.storeFor(`employees:${detail.id}`, () =>
    employeeReviewStore(detail, stores)
  );
  const { changes, saving, conflict, error } = useChangesSnapshot(store);
  return {
    changes,
    update: store.update,
    saving,
    conflict,
    error,
    retry: store.retry,
    reload: store.reload,
    flush: store.flush,
  };
}

export type EmployeeReview = ReturnType<typeof useEmployeeReview>;
