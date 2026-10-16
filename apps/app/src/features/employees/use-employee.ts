import { useRouteContext } from '@tanstack/react-router';

import { getGetEmployeeQueryKey, useGetEmployee } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

export function useEmployee(clientId: string, employeeId: string) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetEmployee(clientId, employeeId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEmployeeQueryKey(clientId, employeeId), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
}
