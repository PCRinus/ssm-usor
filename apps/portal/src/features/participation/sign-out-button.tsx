import { Trans } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { LogOut } from 'lucide-react';

import { Notice } from '@/components/notice';
import { useSignOut } from '@/features/auth/use-sign-out';

export function SignOutFailed() {
  return (
    <Notice variant="destructive" data-testid="sign-out-error">
      <Trans>Nu am putut închide sesiunea. Verifică conexiunea și încearcă din nou.</Trans>
    </Notice>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const { signOut, busy, failed } = useSignOut();

  return (
    <div className={cn('grid gap-3', className)}>
      <Button
        variant="outline"
        data-testid="sign-out"
        className="h-12 w-full"
        disabled={busy}
        onClick={() => void signOut()}
      >
        <LogOut aria-hidden="true" />
        <Trans>Ieși din cont</Trans>
      </Button>
      {failed && <SignOutFailed />}
    </div>
  );
}
