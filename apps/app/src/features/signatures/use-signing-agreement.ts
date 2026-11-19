import type { QueryClient } from '@tanstack/react-query';

import {
  getGetSigningAgreementStateQueryKey,
  useGetSigningAgreementState,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import { invalidateSignatures } from './signature-queries';

export function useSigningAgreement(clientId: string, employeeId: string) {
  const { request, ready, key } = useApi();
  return useGetSigningAgreementState(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetSigningAgreementStateQueryKey(clientId, employeeId)),
      enabled: ready,
    },
  });
}

// The request lists carry each employee's agreement state.
export function invalidateSigningAgreement(
  queryClient: QueryClient,
  clientId: string,
  employeeId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: getGetSigningAgreementStateQueryKey(clientId, employeeId),
    }),
    invalidateSignatures(queryClient, clientId),
  ]);
}
