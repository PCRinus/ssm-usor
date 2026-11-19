import { keepPreviousData } from '@tanstack/react-query';

import {
  type ClientListResponseItemsItem,
  getListClientsQueryKey,
  type ListClientsParams,
  useListClients,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export type PickedClient = Pick<
  ClientListResponseItemsItem,
  'id' | 'legalName' | 'cui' | 'vatPayer'
>;

const shownClients = 50;

const activeClientsParams = (q?: string, pageSize = shownClients): ListClientsParams => ({
  stage: 'client',
  sort: 'legalName',
  order: 'asc',
  page: 1,
  pageSize,
  ...(q ? { q } : {}),
});

export function useActiveClients(q?: string, pageSize?: number, enabled = true) {
  const { request, ready, key } = useApi();
  const params = activeClientsParams(q, pageSize);
  return useListClients(params, {
    request,
    query: {
      queryKey: key(getListClientsQueryKey(params)),
      enabled: ready && enabled,
      placeholderData: keepPreviousData,
    },
  });
}
