import { useRouteContext } from '@tanstack/react-router';

import { getListJobPositionsQueryKey, useListJobPositions } from '../api/generated/api';

/** The client's positions, as the employee form needs them. */
export function useJobPositionOptions(clientId: string, userId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId] },
  });
}
