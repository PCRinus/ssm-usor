import { Button } from '@ssm-usor/ui/components/button';
import { LogOut } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';

import { useAuth } from './auth-context';

export function SignOutButton(props: Omit<ComponentProps<typeof Button>, 'onClick'>) {
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
    <>
      <Button
        variant="outline"
        data-testid="sign-out"
        disabled={busy}
        onClick={() => void signOut()}
        {...props}
      >
        <LogOut aria-hidden="true" />
        Sign out
      </Button>
      {failed && (
        <ErrorNotice testId="sign-out-error">
          The session could not be closed. Check the connection and try again.
        </ErrorNotice>
      )}
    </>
  );
}
