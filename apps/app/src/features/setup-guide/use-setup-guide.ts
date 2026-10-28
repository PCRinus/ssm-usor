import { setupGuideSchema, type SetupMemberStepId } from '@ssm-usor/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import {
  getGetMySetupGuideQueryKey,
  type SetupGuide,
  type UpdateSetupGuideRequest,
  useGetMySetupGuide,
  useSkipMySetupStep,
  useUnskipMySetupStep,
  useUpdateMySetupGuide,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

export const setupGuideQueryKey = (userId: string | undefined) => [
  ...getGetMySetupGuideQueryKey(),
  userId,
];

// The guide is an aid: an answer it cannot read keeps it off the page, never takes the shell down.
const readable = (guide: SetupGuide) => (setupGuideSchema.safeParse(guide).success ? guide : null);

export function useSetupGuideQuery(enabled: boolean) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetMySetupGuide({
    request: apiRequest,
    query: {
      queryKey: setupGuideQueryKey(session?.user.id),
      staleTime: 10_000,
      select: readable,
      enabled: enabled && Boolean(session && apiRequest.baseUrl),
    },
  });
}

export function useSetupGuideChanges() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const queryKey = setupGuideQueryKey(session?.user.id);
  const settle = {
    onSuccess: (guide: SetupGuide) => queryClient.setQueryData(queryKey, guide),
    onError: () => void queryClient.invalidateQueries({ queryKey }),
  };
  const update = useUpdateMySetupGuide({ request: apiRequest, mutation: settle });
  const skip = useSkipMySetupStep({ request: apiRequest, mutation: settle });
  const unskip = useUnskipMySetupStep({ request: apiRequest, mutation: settle });

  const assume = (change: Partial<SetupGuide>) =>
    queryClient.setQueryData<SetupGuide>(queryKey, (guide) => guide && { ...guide, ...change });

  return {
    record: (data: UpdateSetupGuideRequest) => {
      assume(data);
      update.mutate({ data });
    },
    skip: (step: SetupMemberStepId) => skip.mutate({ step }),
    unskip: (step: SetupMemberStepId) => unskip.mutate({ step }),
    pendingStep: skip.isPending
      ? skip.variables?.step
      : unskip.isPending
        ? unskip.variables?.step
        : undefined,
  };
}
