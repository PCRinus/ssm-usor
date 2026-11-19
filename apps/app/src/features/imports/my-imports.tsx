import { type ReactNode, useMemo } from 'react';

import { getListImportsQueryKey, useListImports } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useAuth } from '@/features/auth/auth-context';

import { importListPollMs } from './import-format';
import { isAnyMoving, waitingCounts } from './open-imports';
import { MyImportsContext } from './use-my-imports';

const params = { kind: 'all', withOpenParts: 'true' } as const;

// One observer for the whole shell: each observer of a query keeps its own polling timer, so the
// header, the sidebar, the imports page and the notice reading the list separately would poll it
// several times.
export function MyImportsProvider({ children }: { children: ReactNode }) {
  const { request, ready, key } = useApi();
  const { session } = useAuth();
  const userId = session?.user.id;
  const imports = useListImports(params, {
    request,
    query: {
      queryKey: key(getListImportsQueryKey(params)),
      enabled: ready,
      refetchOnWindowFocus: 'always',
      refetchInterval: (query) =>
        isAnyMoving(query.state.data?.items ?? []) ? importListPollMs : false,
    },
  });
  const items = imports.data?.items;
  const { status, error, isFetching, refetch } = imports;
  const value = useMemo(
    () => ({
      items,
      userId,
      waiting: items ? waitingCounts(items) : null,
      status,
      error,
      isFetching,
      refetch: () => void refetch(),
    }),
    [items, userId, status, error, isFetching, refetch]
  );
  return <MyImportsContext.Provider value={value}>{children}</MyImportsContext.Provider>;
}
