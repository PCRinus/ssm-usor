import { useState } from 'react';

import { getListImportsQueryKey, useListImports } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import { isOpenPart } from './library-model';

export function useConfirmedClientImports(clientId: string) {
  const { request, ready, key } = useApi();
  const params = { clientId, kind: 'client' as const, status: 'confirmed' as const };
  return useListImports(params, {
    request,
    query: {
      queryKey: key(getListImportsQueryKey(params)),
      enabled: ready,
    },
  });
}

export function useClientImportGroups(clientId: string) {
  const confirmed = useConfirmedClientImports(clientId);
  const [now] = useState(() => Date.now());
  const items = confirmed.data?.items ?? [];
  const waiting = items.flatMap((item) => {
    const open = item.libraryParts.filter((part) => isOpenPart(part, now));
    return open.length > 0 ? [{ item, open }] : [];
  });
  const past = items.filter((item) => !waiting.some((group) => group.item === item));
  return { waiting, past, now };
}
