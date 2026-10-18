import type { QueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import {
  getGetSigningAgreementStateQueryKey,
  useGetSigningAgreementState,
} from '@/api/generated/api';

import { invalidateSignatures } from './signature-queries';

export function useSigningAgreement(clientId: string, employeeId: string, userId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetSigningAgreementState(clientId, employeeId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetSigningAgreementStateQueryKey(clientId, employeeId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
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
