import type { QueryClient } from '@tanstack/react-query';

import {
  getGetDutiesAcknowledgementQueryKey,
  getListEmployeesQueryKey,
  getListOrganizationEmployeesQueryKey,
  useGetDutiesAcknowledgement,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useDutiesAcknowledgement(clientId: string, employeeId: string) {
  const { request, ready, key } = useApi();
  return useGetDutiesAcknowledgement(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetDutiesAcknowledgementQueryKey(clientId, employeeId)),
      enabled: ready,
    },
  });
}

// Both workers lists carry each worker's acknowledgement state.
export function invalidateDutiesAcknowledgement(
  queryClient: QueryClient,
  clientId: string,
  employeeId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: getGetDutiesAcknowledgementQueryKey(clientId, employeeId),
    }),
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) }),
    queryClient.invalidateQueries({ queryKey: getListOrganizationEmployeesQueryKey() }),
  ]);
}

// Issuing document 13 moves every worker's sheet; the per-worker keys share no prefix.
export function invalidateClientDutiesAcknowledgements(queryClient: QueryClient, clientId: string) {
  const prefix = `/clients/${clientId}/employees/`;
  return Promise.all([
    queryClient.invalidateQueries({
      predicate: ({ queryKey: [path] }) =>
        typeof path === 'string' &&
        path.startsWith(prefix) &&
        path.endsWith('/duties-acknowledgement'),
    }),
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) }),
    queryClient.invalidateQueries({ queryKey: getListOrganizationEmployeesQueryKey() }),
  ]);
}
