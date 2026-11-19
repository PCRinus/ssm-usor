import {
  getGetDocumentsBehindSummaryQueryKey,
  useGetDocumentsBehindSummary,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useMe } from '@/features/account/use-me';

import { summaryPollMs } from './regenerations-context';

export const behindSummaryQueryKey = getGetDocumentsBehindSummaryQueryKey;

export function useBehindSummary() {
  const { request, key } = useApi();
  const member = Boolean(useMe().data?.membership);
  return useGetDocumentsBehindSummary({
    request,
    query: {
      queryKey: key(getGetDocumentsBehindSummaryQueryKey()),
      enabled: member,
      // One request follows every job of the organization, whoever started it.
      refetchInterval: (query) => (query.state.data?.running?.length ? summaryPollMs : false),
    },
  });
}

export const behindCountOf = (
  counts: { occupational_safety: number; fire_safety: number } | undefined
) => (counts ? counts.occupational_safety + counts.fire_safety : 0);
