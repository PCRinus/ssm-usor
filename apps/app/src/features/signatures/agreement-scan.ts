import { renewalMs } from '@ssm-usor/api-http/file-link';

import { getListClientFilesQueryKey, useListClientFiles } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export interface ScanChoice {
  file: File | null;
  existingId: string;
}

export const noScan: ScanChoice = { file: null, existingId: '' };

export function useEmployeeFiles(clientId: string, employeeId: string) {
  const { request, ready, key } = useApi();
  const params = { employeeId };
  return useListClientFiles(clientId, params, {
    request,
    query: {
      queryKey: key(getListClientFilesQueryKey(clientId, params)),
      enabled: ready,
      staleTime: (current) => renewalMs(current.state.data?.items[0]?.link.expiresInSeconds),
      refetchInterval: (current) => renewalMs(current.state.data?.items[0]?.link.expiresInSeconds),
    },
  });
}
