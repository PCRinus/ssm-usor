import { setupGuideSchema, type SetupMemberStepId, setupStepIds } from '@ssm-usor/contracts';
import { useQueryClient } from '@tanstack/react-query';

import {
  getGetMySetupGuideQueryKey,
  type SetupGuide,
  type UpdateSetupGuideRequest,
  useGetMySetupGuide,
  useSkipMySetupStep,
  useUnskipMySetupStep,
  useUpdateMySetupGuide,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

// The guide is an aid: an answer it cannot read keeps it off the page, never takes the shell down.
const readable = (guide: SetupGuide) =>
  setupGuideSchema.safeParse(guide).success &&
  guide.steps.length === setupStepIds.length &&
  new Set(guide.steps.map((step) => step.id)).size === setupStepIds.length
    ? guide
    : null;

export function useSetupGuideQuery(enabled: boolean) {
  const { request, ready, key } = useApi();
  return useGetMySetupGuide({
    request,
    query: {
      queryKey: key(getGetMySetupGuideQueryKey()),
      staleTime: 10_000,
      select: readable,
      enabled: enabled && ready,
    },
  });
}

export function useSetupGuideChanges() {
  const { request, key } = useApi();
  const queryClient = useQueryClient();
  const queryKey = key(getGetMySetupGuideQueryKey());
  const settle = {
    onSuccess: (guide: SetupGuide) => queryClient.setQueryData(queryKey, guide),
    onError: () => void queryClient.invalidateQueries({ queryKey }),
  };
  const update = useUpdateMySetupGuide({ request, mutation: settle });
  const skip = useSkipMySetupStep({ request, mutation: settle });
  const unskip = useUnskipMySetupStep({ request, mutation: settle });

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
