import { createQueryClient } from '@ssm-usor/spa-runtime/query-client';
import { invalidateOnSessionChange } from '@ssm-usor/spa-runtime/session';
import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';

import type { ApiRequestOptions } from '@/api/http';
import { type AuthClient, createAuthStore } from '@/features/auth/auth-store';

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
  // A verified code moves the same user to the next step, so the guards follow the step too.
  const stopInvalidating = invalidateOnSessionChange(
    auth,
    router,
    () => `${auth.getSnapshot().session?.user.id}:${auth.step()}`
  );

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

export type AdminRuntime = ReturnType<typeof createAdminRuntime>;
