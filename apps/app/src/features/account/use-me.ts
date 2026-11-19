import { getGetMeQueryKey, useGetMe } from '@/api/generated/api';
import { useApi, withUserId } from '@/api/use-api';

export const meQueryKey = (userId: string | undefined) => withUserId(userId)(getGetMeQueryKey());

export function useMe() {
  const { request, ready, key } = useApi();
  return useGetMe({
    request,
    query: { queryKey: key(getGetMeQueryKey()), enabled: ready },
  });
}
