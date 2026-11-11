import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';

import { getMe } from '@/api/generated/api';
import type { ApiRequestOptions } from '@/api/http';
import { type AuthClient, createAuthStore } from '@/features/auth/auth-store';
import { createPageIdentity } from '@/features/impersonation/identity';
import { isPlatformAdmin } from '@/features/impersonation/platform-admin';
import { createQueryClient } from '@/lib/query-client';

import { createAppRouter } from './router';

export function createAppRuntime(
  client: AuthClient | null,
  queryClient: QueryClient = createQueryClient(),
  history?: RouterHistory,
  apiBaseUrl = import.meta.env.VITE_API_URL ??
    (import.meta.env.DEV ? 'http://localhost:8787' : undefined)
) {
  const auth = createAuthStore(client, queryClient);
  const identity = createPageIdentity({
    queryClient,
    userId: () => auth.getSnapshot().session?.user.id,
    isPlatformAdmin: () => isPlatformAdmin(auth.getSnapshot().session),
    readMe: () => getMe(apiRequest),
  });
  const apiRequest: ApiRequestOptions = {
    baseUrl: apiBaseUrl,
    getAccessToken: () => auth.getAccessToken(),
    pageIdentity: identity,
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
    identity,
    dispose() {
      disposed = true;
      unsubscribe();
      identity.dispose();
      auth.dispose();
      queryClient.clear();
    },
  };
}

export type AppRuntime = ReturnType<typeof createAppRuntime>;
