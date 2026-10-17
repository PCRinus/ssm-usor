import { useState } from 'react';

import { useAuth } from './auth-context';

export function useSignOut() {
  const { auth } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      await auth.signOut();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return { signOut, busy, failed };
}
