import type { AdminActiveImpersonation } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useRouteContext } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { activeImpersonationKey, endImpersonation } from '@/features/impersonation/api';

import { useAuth } from './auth-context';

const patience = 3_000;

export function SignOutButton(props: Omit<ComponentProps<typeof Button>, 'onClick'>) {
  const { auth } = useAuth();
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    // Best effort: the sign-out neither fails nor waits long for it.
    const active = queryClient.getQueryData<AdminActiveImpersonation>(activeImpersonationKey);
    if (active?.impersonation) {
      await endImpersonation({ ...apiRequest, signal: AbortSignal.timeout(patience) }).catch(
        () => undefined
      );
    }
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
