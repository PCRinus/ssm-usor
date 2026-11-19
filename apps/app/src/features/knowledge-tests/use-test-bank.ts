import { getGetTestBankQueryKey, useGetTestBank } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

// The whole bank in one read: the page's header and its three tabs share it.
export function useTestBank() {
  const { request, ready, key } = useApi();
  return useGetTestBank(undefined, {
    request,
    query: {
      queryKey: key(getGetTestBankQueryKey()),
      enabled: ready,
    },
  });
}
