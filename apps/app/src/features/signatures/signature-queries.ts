import { signatureFileLinkKinds } from '@ssm-usor/api-http/file-link';
import type { QueryClient, QueryFilters } from '@tanstack/react-query';

import {
  getListClientSignatureRequestsQueryKey,
  getListMySignatureRequestsQueryKey,
} from '@/api/generated/api';

// Saving, voiding or marking a slot changes the record's slots and every list of requests; a
// test sheet's slots are on its employee's tests.
export async function invalidateSignatures(queryClient: QueryClient, clientId: string) {
  const recordsPrefix = `/clients/${clientId}/training-records/`;
  const employeesPrefix = `/clients/${clientId}/employees/`;
  const clientRequests = getListClientSignatureRequestsQueryKey(clientId)[0];
  const myRequests = getListMySignatureRequestsQueryKey()[0];
  const queries: QueryFilters = {
    predicate: ({ queryKey: [key, scope] }) =>
      typeof key === 'string' &&
      ((scope === clientId && signatureFileLinkKinds.includes(key)) ||
        (key.startsWith(recordsPrefix) && key.endsWith('/signatures')) ||
        (key.startsWith(employeesPrefix) && key.endsWith('/tests')) ||
        key === clientRequests ||
        key === myRequests),
  };
  await queryClient.cancelQueries(queries);
  return queryClient.invalidateQueries(queries);
}
