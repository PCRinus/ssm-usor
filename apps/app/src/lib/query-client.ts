import { readOnlyReason } from '@ssm-usor/contracts';
import { MutationCache, QueryClient } from '@tanstack/react-query';

import { getGetMeQueryKey } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

function isReadOnly(error: unknown) {
  return (
    error instanceof ApiHttpError &&
    (error.body as { reason?: unknown } | null)?.reason === readOnlyReason
  );
}

export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    // A change refused because the organization just turned read-only brings the banner up at once.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isReadOnly(error)) void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const status = 'status' in error ? error.status : undefined;
          if (typeof status === 'number' && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
  return queryClient;
}
