import { getGetImportQueryKey, useGetImport } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import { isRunning, isUploadUnderway } from './import-format';

const pollMs = 3000;

export function useImport(importId: string) {
  const { request, ready, key } = useApi();
  return useGetImport(importId, {
    request,
    query: {
      queryKey: key(getGetImportQueryKey(importId)),
      enabled: ready,
      refetchInterval: (query) => {
        const detail = query.state.data?.import;
        return detail && (isRunning(detail.status) || isUploadUnderway(detail)) ? pollMs : false;
      },
    },
  });
}
