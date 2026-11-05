import { useRouteContext } from '@tanstack/react-router';

import { getListImportsQueryKey, useListImports } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

export function useConfirmedClientImports(clientId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const params = { clientId, kind: 'client' as const, status: 'confirmed' as const };
  return useListImports(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListImportsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
}
