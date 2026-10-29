import { MutationCache, QueryClient } from '@tanstack/react-query';

import { getGetMeQueryKey, getGetMySetupGuideQueryKey, type SetupGuide } from '@/api/generated/api';
import { setupGuideMutationKeys } from '@/features/setup-guide/guide-mutation-keys';
import { isReadOnlyError } from '@/features/subscription/read-only';

// A loop of changes, such as an import's rows, asks for the guide once.
const guideRefetchDelay = 300;

export function createQueryClient() {
  let guideRefetch: ReturnType<typeof setTimeout> | undefined;
  const refetchGuide = () => {
    clearTimeout(guideRefetch);
    guideRefetch = setTimeout(() => {
      const queryKey = getGetMySetupGuideQueryKey();
      const guides = queryClient.getQueriesData<SetupGuide | null>({ queryKey });
      if (guides.every(([, guide]) => guide?.finished !== false)) return;
      void queryClient.invalidateQueries({ queryKey });
    }, guideRefetchDelay);
  };
  const queryClient: QueryClient = new QueryClient({
    // A change refused because the organization just turned read-only brings the banner up at once.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isReadOnlyError(error))
          void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      // Any other change may tick a step while the setup guide is in view (ADR 031).
      onSuccess: (_data, _variables, _context, mutation) => {
        if (setupGuideMutationKeys.has(mutation.options.mutationKey?.[0])) return;
        refetchGuide();
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
