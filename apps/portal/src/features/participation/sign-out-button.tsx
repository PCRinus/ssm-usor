import { Button } from '@ssm-usor/ui/components/button';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';

export function SignOutButton() {
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

  return (
    <div className="grid gap-3">
      <Button
        variant="outline"
        data-testid="sign-out"
        className="h-12 w-full"
        disabled={busy}
        onClick={() => void signOut()}
      >
        <LogOut aria-hidden="true" />
        Ieși din cont
      </Button>
      {failed && (
        <Notice variant="destructive">
          Nu am putut închide sesiunea. Verifică conexiunea și încearcă din nou.
        </Notice>
      )}
    </div>
  );
}
