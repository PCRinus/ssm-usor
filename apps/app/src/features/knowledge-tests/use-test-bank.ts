import { useRouteContext } from '@tanstack/react-router';

import { getGetTestBankQueryKey, useGetTestBank } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

// The whole bank in one read: the page's header and its three tabs share it.
export function useTestBank() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  return useGetTestBank(undefined, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTestBankQueryKey(), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
}
