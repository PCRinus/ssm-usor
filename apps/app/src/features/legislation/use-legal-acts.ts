import { getListLegalActsQueryKey, useListLegalActs } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export function useLegalActs() {
  const { request, key } = useApi();
  return useListLegalActs({
    request,
    query: { queryKey: key(getListLegalActsQueryKey()) },
  });
}
