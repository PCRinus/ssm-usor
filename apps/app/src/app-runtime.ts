import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';

import { type AuthClient, createAuthStore } from './auth/auth-store';
import { createQueryClient } from './lib/query-client';
import { createAppRouter } from './router';

export function createAppRuntime(
  client: AuthClient | null,
  queryClient: QueryClient = createQueryClient(),
  history?: RouterHistory
) {
  const auth = createAuthStore(client, queryClient);
  const router = createAppRouter({ auth, queryClient }, history);
  let userId = auth.getSnapshot().session?.user.id;
  let disposed = false;
  const unsubscribe = auth.subscribe(() => {
    const nextUserId = auth.getSnapshot().session?.user.id;
    if (nextUserId === userId) return;
    userId = nextUserId;
    // Leave the Supabase event callback before re-running route guards.
    queueMicrotask(() => {
      if (!disposed) void router.invalidate();
    });
  });

  return {
    auth,
    router,
    queryClient,
    dispose() {
      disposed = true;
      unsubscribe();
      auth.dispose();
      queryClient.clear();
    },
  };
}

export type AppRuntime = ReturnType<typeof createAppRuntime>;
