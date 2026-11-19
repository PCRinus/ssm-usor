import type { QueryClient } from '@tanstack/react-query';

import {
  type ClientResponse,
  getGetClientQueryKey,
  getListClientsQueryKey,
} from '@/api/generated/api';

// The client and lead pages read the record through loaders, which keep whatever is cached, so
// the saved record is written in rather than only invalidated.
export function storeClient(queryClient: QueryClient, saved: ClientResponse) {
  queryClient.setQueriesData({ queryKey: getGetClientQueryKey(saved.client.id) }, saved);
  return queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
}
