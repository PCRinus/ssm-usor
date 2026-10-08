import { useRouteContext } from '@tanstack/react-router';

import { getListLegalActsQueryKey, useListLegalActs } from '@/api/generated/api';

export function useLegalActs(userId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useListLegalActs({
    request: apiRequest,
    query: { queryKey: [...getListLegalActsQueryKey(), userId] },
  });
}
