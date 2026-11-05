import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';

import type { ApiRequestOptions } from '@/api/http';
import { type AuthClient, createAuthStore } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

import { createAdminRouter } from './router';

// The admin Worker forwards its own `/api` to the API, so the browser never calls another origin.
export function createAdminRuntime(
  client: AuthClient | null,
  queryClient: QueryClient = createQueryClient(),
  history?: RouterHistory,
  apiBaseUrl = window.location.origin
) {
  const auth = createAuthStore(client, queryClient);
  const apiRequest: ApiRequestOptions = {
    baseUrl: apiBaseUrl,
    getAccessToken: () => auth.getAccessToken(),
  };
  const router = createAdminRouter({ auth, queryClient, apiRequest }, history);
  // Route guards read the session at navigation time only. When the user or the step changes
  // (a code verified, a sign-out, another tab) run them again.
  const position = () => `${auth.getSnapshot().session?.user.id}:${auth.step()}`;
  let current = position();
  let disposed = false;
  const unsubscribe = auth.subscribe(() => {
    const next = position();
    if (next === current) return;
    current = next;
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

export type AdminRuntime = ReturnType<typeof createAdminRuntime>;
