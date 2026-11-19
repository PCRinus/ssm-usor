import { getGetEmployeeQueryKey, useGetEmployee } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useEmployee(clientId: string, employeeId: string) {
  const { request, ready, key } = useApi();
  return useGetEmployee(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetEmployeeQueryKey(clientId, employeeId)),
      enabled: ready,
    },
  });
}
