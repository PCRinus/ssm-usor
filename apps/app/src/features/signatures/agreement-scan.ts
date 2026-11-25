import { renewalMs } from '@ssm-usor/api-http/file-link';

import {
  getListClientFilesQueryKey,
  uploadClientFile,
  useListClientFiles,
} from '@/api/generated/api';
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

interface ScanOwner {
  id: string;
  clientId: string;
}

// Once uploaded, the scan is chosen as a file among the employee's, so a save refused after it
// neither uploads it again nor leaves it stored unseen.
export function useScanUpload(employee: ScanOwner, onUploaded: (scan: ScanChoice) => void) {
  const { request, queryClient } = useApi();
  return async (scan: ScanChoice) => {
    if (!scan.file) return scan.existingId || null;
    const { file } = await uploadClientFile(
      employee.clientId,
      scan.file,
      { fileName: scan.file.name, employeeId: employee.id },
      request
    );
    onUploaded({ file: null, existingId: file.id });
    await queryClient.invalidateQueries({
      queryKey: getListClientFilesQueryKey(employee.clientId),
    });
    return file.id;
  };
}
