import { useRouteContext } from '@tanstack/react-router';

import { getGetMeQueryKey, useGetMe } from '../api/generated/api';
import { useAuth } from '../auth/auth-context';

// Private data is keyed by the user, so one account never reads another's cache.
export const meQueryKey = (userId: string | undefined) => [...getGetMeQueryKey(), userId];

export function useMe() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetMe({
    request: apiRequest,
    query: {
      queryKey: meQueryKey(session?.user.id),
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
}
