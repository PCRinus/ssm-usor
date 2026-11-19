import { useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';

import { useAuth } from '@/features/auth/auth-context';

// Private data is keyed by the user, so one account never reads another's cache.
export const withUserId =
  (userId: string | undefined) =>
  <const K extends readonly unknown[]>(key: K): [...K, string | undefined] => [...key, userId];

export function useApi() {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id;
  const key = useMemo(() => withUserId(userId), [userId]);
  return {
    request: apiRequest,
    queryClient,
    ready: Boolean(session && apiRequest.baseUrl),
    key,
  };
}
