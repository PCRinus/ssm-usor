import { signatureFileLinkKinds } from '@ssm-usor/api-http/file-link';
import type { QueryClient, QueryFilters } from '@tanstack/react-query';

import {
  getListClientSignatureRequestsQueryKey,
  getListMySignaturesQueryKey,
} from '@/api/generated/api';

// Saving, voiding or marking a slot changes the record's slots, every list of requests and the
// signing state the trainings lists show: the client's, an employee's, and the open training; a
// test sheet's slots are on its employee's tests.
export async function invalidateSignatures(queryClient: QueryClient, clientId: string) {
  const recordsPrefix = `/clients/${clientId}/training-records/`;
  const employeesPrefix = `/clients/${clientId}/employees/`;
  const trainings = `/clients/${clientId}/trainings`;
  const clientRequests = getListClientSignatureRequestsQueryKey(clientId)[0];
  const myRequests = getListMySignaturesQueryKey()[0];
  const queries: QueryFilters = {
    predicate: ({ queryKey: [key, scope] }) =>
      typeof key === 'string' &&
      ((scope === clientId && signatureFileLinkKinds.includes(key)) ||
        (key.startsWith(recordsPrefix) && key.endsWith('/signatures')) ||
        (key.startsWith(employeesPrefix) &&
          (key.endsWith('/tests') || key.endsWith('/training-records'))) ||
        key === trainings ||
        (key.startsWith(`${trainings}/`) && key !== `${trainings}/proposal`) ||
        key === clientRequests ||
        key === myRequests),
  };
  await queryClient.cancelQueries(queries);
  return queryClient.invalidateQueries(queries);
}
