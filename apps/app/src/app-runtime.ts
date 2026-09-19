import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';

import type { ApiRequestOptions } from './api/http';
import { type AuthClient, createAuthStore } from './auth/auth-store';
import { createQueryClient } from './lib/query-client';
import { createAppRouter } from './router';

// Composition root: builds the one auth store, query client, router, and API request
// configuration an app instance needs, and keeps them consistent with each other.
// main.tsx calls it once with the browser Supabase client; tests call it per test with a
// mocked auth client, a memory history, and a local API URL, then dispose() it.
export function createAppRuntime(
  client: AuthClient | null,
  queryClient: QueryClient = createQueryClient(),
  history?: RouterHistory,
  apiBaseUrl = import.meta.env.VITE_API_URL ??
    (import.meta.env.DEV ? 'http://localhost:8787' : undefined)
) {
  const auth = createAuthStore(client, queryClient);
  const apiRequest: ApiRequestOptions = {
    baseUrl: apiBaseUrl,
    getAccessToken: () => auth.getAccessToken(),
  };
  const router = createAppRouter({ auth, queryClient, apiRequest }, history);
  // Route guards read the session at navigation time only. When the signed-in user changes
  // (sign-out, another tab, a different account) re-run them so protected pages disappear.
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
    apiRequest,
    dispose() {
      disposed = true;
      unsubscribe();
      auth.dispose();
      queryClient.clear();
    },
  };
}

export type AppRuntime = ReturnType<typeof createAppRuntime>;
