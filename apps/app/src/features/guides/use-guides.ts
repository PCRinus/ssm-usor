import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import {
  getListMyGuidesQueryKey,
  type GuideState,
  type GuideStateListResponse,
  useListMyGuides,
  useRecordMyGuide,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

import type { Guide } from './guides';

const guidesQueryKey = (userId: string | undefined) => [...getListMyGuidesQueryKey(), userId];

export function useGuideStates() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useListMyGuides({
    request: apiRequest,
    query: {
      queryKey: guidesQueryKey(session?.user.id),
      staleTime: Infinity,
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
}

export function useRecordGuide() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const queryKey = guidesQueryKey(session?.user.id);
  const mutation = useRecordMyGuide({ request: apiRequest });

  // The cache changes first, so a finished tour does not start again while the request runs. A
  // failed request leaves it so: the tour then shows again on the next load, not right away.
  return (guide: Guide, status: GuideState['status']) => {
    const state: GuideState = {
      guide: guide.id,
      version: guide.version,
      status,
      updatedAt: new Date().toISOString(),
    };
    queryClient.setQueryData<GuideStateListResponse>(queryKey, (list) => ({
      items: [...(list?.items ?? []).filter((item) => item.guide !== guide.id), state],
    }));
    mutation.mutate({ guide: guide.id, data: { version: guide.version, status } });
  };
}
