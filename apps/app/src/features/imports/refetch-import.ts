import type { QueryClient } from '@tanstack/react-query';

import { getGetImportQueryKey, type ImportDetailResponse } from '@/api/generated/api';

export async function refetchImport(queryClient: QueryClient, importId: string) {
  await queryClient.refetchQueries({ queryKey: getGetImportQueryKey(importId) });
  return queryClient
    .getQueriesData<ImportDetailResponse>({ queryKey: getGetImportQueryKey(importId) })
    .find(([, data]) => data)?.[1]?.import;
}
