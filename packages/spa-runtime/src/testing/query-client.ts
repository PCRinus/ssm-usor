import type { QueryClient } from '@tanstack/react-query';

// Not `retry: false`: a test of a failed read still goes through the app's retries.
export function withoutRetryWait<T extends QueryClient>(queryClient: T): T {
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } });
  return queryClient;
}
