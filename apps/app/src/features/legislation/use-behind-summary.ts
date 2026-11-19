import { useRouteContext } from '@tanstack/react-router';

import {
  getGetDocumentsBehindSummaryQueryKey,
  useGetDocumentsBehindSummary,
} from '@/api/generated/api';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';

import { summaryPollMs } from './regenerations-context';

export const behindSummaryQueryKey = getGetDocumentsBehindSummaryQueryKey;

export function useBehindSummary() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const member = Boolean(useMe().data?.membership);
  return useGetDocumentsBehindSummary({
    request: apiRequest,
    query: {
      queryKey: [...getGetDocumentsBehindSummaryQueryKey(), session?.user.id],
      enabled: member,
      // One request follows every job of the organization, whoever started it.
      refetchInterval: (query) => (query.state.data?.running?.length ? summaryPollMs : false),
    },
  });
}

export const behindCountOf = (
  counts: { occupational_safety: number; fire_safety: number } | undefined
) => (counts ? counts.occupational_safety + counts.fire_safety : 0);
