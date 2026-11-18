import { createQueryClientDefaults } from '@ssm-usor/spa-runtime/query-client';
import { MutationCache, QueryClient } from '@tanstack/react-query';

import { getGetMeQueryKey, getGetMySetupGuideQueryKey, type SetupGuide } from '@/api/generated/api';
import { isOffersNotInPlanError } from '@/features/clients/offers-plan';
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
    // A change refused because the organization just turned read-only, or moved to a plan without
    // offers, shows the new state at once.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isReadOnlyError(error) || isOffersNotInPlanError(error))
          void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      // Any other change may tick a step while the setup guide is in view (ADR 031).
      onSuccess: (_data, _variables, _context, mutation) => {
        if (setupGuideMutationKeys.has(mutation.options.mutationKey?.[0])) return;
        refetchGuide();
      },
    }),
    defaultOptions: createQueryClientDefaults(),
  });
  return queryClient;
}
