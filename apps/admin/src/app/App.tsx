import { Button } from '@ssm-usor/ui/components/button';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';

import { Frame } from '@/components/frame';
import { AuthContext } from '@/features/auth/auth-context';

import type { AdminRuntime } from './admin-runtime';

export default function App({ runtime }: { runtime: AdminRuntime }) {
  const { auth, queryClient, router } = runtime;
  const { status } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  if (status === 'loading') {
    return (
      <main data-testid="auth-loading" className="grid min-h-svh place-items-center px-4">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </main>
    );
  }
  if (status === 'unconfigured' || status === 'error') {
    return (
      <Frame
        testId="auth-unavailable"
        title="Sign-in is unavailable"
        description={
          <span role="alert">
            {status === 'unconfigured'
              ? 'This build has no Supabase URL or publishable key.'
              : 'The session could not be restored. Check the connection and try again.'}
          </span>
        }
      >
        <Button className="h-11" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Frame>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
