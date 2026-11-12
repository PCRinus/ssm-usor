import { createContext, use } from 'react';

import type { PageIdentity } from './identity';

export const PageIdentityContext = createContext<PageIdentity | null>(null);

export const usePageIdentity = () => use(PageIdentityContext);
