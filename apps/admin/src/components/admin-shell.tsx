import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { isRefusedByApi } from '@/api/http';
import { ErrorNotice } from '@/components/error-notice';
import { SignOutButton } from '@/features/auth/sign-out-button';

const navLink =
  'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground';

export function AdminShell({
  testId,
  wide,
  children,
}: {
  testId?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const width = wide ? 'max-w-7xl' : 'max-w-5xl';
  return (
    <div className="bg-muted/40 min-h-svh">
      <header className="bg-background border-b">
        <div
          className={cn('mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6', width)}
        >
          <div className="flex min-w-0 items-center gap-1 sm:gap-4">
            <Link to="/" className="flex shrink-0 items-center gap-2 pr-1">
              <img src="/brand/favicon.png" alt="" width={28} height={28} className="size-7" />
              <span className="hidden font-semibold sm:inline">SSM Ușor admin</span>
            </Link>
            <nav aria-label="Admin" className="flex items-center">
              <Link
                to="/"
                className={navLink}
                activeOptions={{ exact: true }}
                activeProps={{ className: 'text-foreground bg-muted' }}
              >
                Home
              </Link>
              <Link
                to="/imports"
                data-testid="nav-imports"
                className={navLink}
                activeProps={{ className: 'text-foreground bg-muted' }}
              >
                Imports
              </Link>
            </nav>
          </div>
          <SignOutButton size="sm" />
        </div>
      </header>
      <main data-testid={testId} className={cn('mx-auto px-4 py-6 sm:px-6 sm:py-8', width)}>
        {children}
      </main>
    </div>
  );
}

export function LoadFailure({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (isRefusedByApi(error)) {
    return (
      <ErrorNotice testId="no-admin-access">
        This account has no admin access. Sign out and sign in with an admin account.
      </ErrorNotice>
    );
  }
  return (
    <div className="space-y-3">
      <ErrorNotice testId="load-error">
        The admin API did not answer. Check the connection and try again.
      </ErrorNotice>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
