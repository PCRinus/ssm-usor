import { createContext, useContext, useSyncExternalStore } from 'react';

import type { AuthStore } from './auth-store';

export const AuthContext = createContext<AuthStore | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is missing.');
  const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  return { auth, ...snapshot };
}
