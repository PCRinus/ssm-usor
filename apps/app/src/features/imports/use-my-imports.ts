import { createContext, useContext } from 'react';

import type { ImportListResponseItemsItem } from '@/api/generated/api';

export type MyImports = {
  items: ImportListResponseItemsItem[] | undefined;
  userId: string | undefined;
};

export const MyImportsContext = createContext<MyImports>({ items: undefined, userId: undefined });

export const useMyImports = () => useContext(MyImportsContext);
