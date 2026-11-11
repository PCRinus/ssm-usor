import { useRouteContext } from '@tanstack/react-router';

import { getGetMeQueryKey, useGetMe } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';
import { isPlatformAdmin } from '@/features/impersonation/platform-admin';

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
      // A platform admin starts, switches and ends acting as a member in the admin app, in
      // another tab; coming back to this one must find out at once (watchEffectiveIdentity).
      ...(isPlatformAdmin(session) && { refetchOnWindowFocus: 'always' as const }),
    },
  });
}
