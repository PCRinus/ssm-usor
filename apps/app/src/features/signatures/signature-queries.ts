import type { QueryClient } from '@tanstack/react-query';

import {
  getListClientSignatureRequestsQueryKey,
  getListMySignatureRequestsQueryKey,
} from '@/api/generated/api';

// Saving, voiding or marking a slot changes the record's slots and every list of requests.
export function invalidateSignatures(queryClient: QueryClient, clientId: string) {
  const recordsPrefix = `/clients/${clientId}/training-records/`;
  const clientRequests = getListClientSignatureRequestsQueryKey(clientId)[0];
  const myRequests = getListMySignatureRequestsQueryKey()[0];
  return queryClient.invalidateQueries({
    predicate: ({ queryKey: [key] }) =>
      typeof key === 'string' &&
      ((key.startsWith(recordsPrefix) && key.endsWith('/signatures')) ||
        key === clientRequests ||
        key === myRequests),
  });
}
