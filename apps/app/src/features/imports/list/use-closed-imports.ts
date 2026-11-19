import { countOf, type ImportKind } from '@ssm-usor/contracts';
import { keepPreviousData } from '@tanstack/react-query';

import {
  getListClosedImportsQueryKey,
  type ListClosedImportsParams,
  useListClosedImports,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useClosedImports(params: ListClosedImportsParams, enabled = true) {
  const { request, ready, key } = useApi();
  return useListClosedImports(params, {
    request,
    query: {
      queryKey: key(getListClosedImportsQueryKey(params)),
      enabled: ready && enabled,
      placeholderData: keepPreviousData,
    },
  });
}

// `settled` once the list answered or failed; a failed list leaves the total unknown.
export function useClosedTotal(kind: ImportKind) {
  const closed = useClosedImports({ kind, page: 1, pageSize: 1 });
  return { total: closed.data?.total, settled: closed.isSuccess || closed.isError };
}

export const importNoun = ['import', 'importuri'] as const;

export const closedCountLabel = (total: number) => countOf(total, ...importNoun);
