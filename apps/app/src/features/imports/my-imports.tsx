import { type ReactNode, useMemo } from 'react';

import { getListImportsQueryKey, useListImports } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useAuth } from '@/features/auth/auth-context';

import { importListPollMs } from './import-format';
import { isMineRunning } from './import-ready-notices';
import { MyImportsContext } from './use-my-imports';

const params = { kind: 'all' } as const;

// One observer for the whole shell: each observer of a query keeps its own polling timer, so the
// notice and the header button reading the list separately would poll it twice.
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
        userId && isMineRunning(query.state.data?.items ?? [], userId) ? importListPollMs : false,
    },
  });
  const items = imports.data?.items;
  const value = useMemo(() => ({ items, userId }), [items, userId]);
  return <MyImportsContext.Provider value={value}>{children}</MyImportsContext.Provider>;
}
