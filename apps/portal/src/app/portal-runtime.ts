import { createQueryClient } from '@ssm-usor/spa-runtime/query-client';
import { invalidateOnSessionChange } from '@ssm-usor/spa-runtime/session';
import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';

import type { ApiRequestOptions } from '@/api/http';
import { type AuthClient, createAuthStore } from '@/features/auth/auth-store';

import { createPortalRouter } from './router';

export function createPortalRuntime(
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
  const router = createPortalRouter({ auth, queryClient, apiRequest }, history);
  const stopInvalidating = invalidateOnSessionChange(auth, router);

  return {
    auth,
    router,
    queryClient,
    apiRequest,
    dispose() {
      stopInvalidating();
      auth.dispose();
      queryClient.clear();
    },
  };
}

export type PortalRuntime = ReturnType<typeof createPortalRuntime>;
