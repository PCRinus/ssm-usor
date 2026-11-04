import { createContext, use } from 'react';

export const OpenSupportContext = createContext<() => Promise<boolean>>(() =>
  Promise.resolve(false)
);

export const useOpenSupport = () => use(OpenSupportContext);
