import { useRouteContext } from '@tanstack/react-router';

import { getGetImportQueryKey, useGetImport } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

import { isRunning, isUploadUnderway } from './import-format';

const pollMs = 3000;

export function useImport(importId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  return useGetImport(importId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetImportQueryKey(importId), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      refetchInterval: (query) => {
        const detail = query.state.data?.import;
        return detail && (isRunning(detail.status) || isUploadUnderway(detail)) ? pollMs : false;
      },
    },
  });
}
