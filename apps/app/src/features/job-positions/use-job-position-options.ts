import { getListJobPositionsQueryKey, useListJobPositions } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

/** The client's positions, as the employee form needs them. */
export function useJobPositionOptions(clientId: string) {
  const { request, key } = useApi();
  return useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)) },
  });
}
