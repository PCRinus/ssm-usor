import { createContext, useContext, useSyncExternalStore } from 'react';

import type { AuthSnapshot } from './session';

interface Store {
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
}

export function createAuthContext<S extends Store>() {
  const AuthContext = createContext<S | null>(null);

  function useAuth() {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error('AuthContext is missing.');
    const snapshot = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
    return { auth, ...snapshot };
  }

  return { AuthContext, useAuth };
}
