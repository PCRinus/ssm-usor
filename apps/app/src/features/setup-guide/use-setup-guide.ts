import { setupGuideSchema, type SetupMemberStepId, setupStepIds } from '@ssm-usor/contracts';
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
const readable = (guide: SetupGuide) =>
  setupGuideSchema.safeParse(guide).success &&
  guide.steps.length === setupStepIds.length &&
  new Set(guide.steps.map((step) => step.id)).size === setupStepIds.length
    ? guide
    : null;

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

  // A refetch already in flight would land after the change and undo it on screen.
  const cancelRefetch = () => queryClient.cancelQueries({ queryKey });
  const assume = (change: Partial<SetupGuide>) =>
    queryClient.setQueryData<SetupGuide>(queryKey, (guide) => guide && { ...guide, ...change });

  return {
    record: async (data: UpdateSetupGuideRequest) => {
      await cancelRefetch();
      assume(data);
      update.mutate({ data });
    },
    skip: async (step: SetupMemberStepId, then?: (guide: SetupGuide) => void) => {
      await cancelRefetch();
      skip.mutate({ step }, { onSuccess: then });
    },
    unskip: async (step: SetupMemberStepId, then?: (guide: SetupGuide) => void) => {
      await cancelRefetch();
      unskip.mutate({ step }, { onSuccess: then });
    },
    pendingStep: skip.isPending
      ? skip.variables?.step
      : unskip.isPending
        ? unskip.variables?.step
        : undefined,
  };
}
