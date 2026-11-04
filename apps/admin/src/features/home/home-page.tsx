import type { CurrentUser } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import { apiFetch, ApiHttpError } from '@/api/http';
import { ErrorNotice } from '@/components/error-notice';
import { Frame } from '@/components/frame';
import { SignOutButton } from '@/features/auth/sign-out-button';

// The admin Worker's own 403, for a request without a valid Access token, is plain text; only
// the API's JSON one means the account lacks the admin claim or the second factor.
const isRefusedByApi = (error: Error) =>
  error instanceof ApiHttpError &&
  error.status === 403 &&
  (error.body as { error?: unknown } | undefined)?.error === 'forbidden';

export function HomePage() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const me = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: ({ signal }) => apiFetch<CurrentUser>('/api/me', { ...apiRequest, signal }),
  });

  if (me.isPending) {
    return (
      <main className="grid min-h-svh place-items-center px-4">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </main>
    );
  }

  if (me.isError) {
    if (isRefusedByApi(me.error)) {
      return (
        <Frame
          testId="no-admin-access"
          title="This account has no admin access"
          description="Sign out and sign in with an admin account."
        >
          <SignOutButton />
        </Frame>
      );
    }
    return (
      <Frame testId="home-error" title="The admin API did not answer">
        <ErrorNotice>Check the connection and try again.</ErrorNotice>
        <Button onClick={() => void me.refetch()}>Try again</Button>
        <SignOutButton />
      </Frame>
    );
  }

  return (
    <div className="bg-muted/40 min-h-svh">
      <header className="bg-background border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/brand/favicon.png" alt="" width={28} height={28} className="size-7" />
            <span className="truncate font-semibold">SSM Ușor admin</span>
          </div>
          <SignOutButton size="sm" />
        </div>
      </header>
      <main data-testid="home-page" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-muted-foreground">
          Signed in as{' '}
          <span data-testid="admin-email" className="text-foreground font-medium break-all">
            {me.data.email}
          </span>
        </p>
      </main>
    </div>
  );
}
