import { createContext, useContext } from 'react';

import type { ImportListResponseItemsItem } from '@/api/generated/api';

import type { WaitingCounts } from './open-imports';

export type MyImports = {
  items: ImportListResponseItemsItem[] | undefined;
  userId: string | undefined;
  // Null until the list first answers.
  waiting: WaitingCounts | null;
  status: 'pending' | 'error' | 'success';
  error: unknown;
  isFetching: boolean;
  refetch: () => void;
};

export const MyImportsContext = createContext<MyImports>({
  items: undefined,
  userId: undefined,
  waiting: null,
  status: 'pending',
  error: null,
  isFetching: false,
  refetch: () => undefined,
});

export const useMyImports = () => useContext(MyImportsContext);
