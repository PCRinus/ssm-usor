import { useRouteContext } from '@tanstack/react-router';

import {
  type EvaluationProfileResponse,
  getGetEvaluationProfileQueryKey,
  getListEvaluationProfilesQueryKey,
  useCreateEvaluationProfileFactor,
  useRemoveEvaluationProfileFactor,
  useUpdateEvaluationProfileFactor,
} from '@/api/generated/api';
import type { FactorStore } from '@/features/risk-evaluations/factor-store';

import { type EvaluationProfile, profileFailure } from './profile-schema';

export function useProfileCache() {
  const { queryClient } = useRouteContext({ from: '__root__' });
  const listKey = getListEvaluationProfilesQueryKey();

  return {
    saved: async (profile: EvaluationProfile) => {
      queryClient.setQueriesData<EvaluationProfileResponse>(
        { queryKey: getGetEvaluationProfileQueryKey(profile.id) },
        { profile }
      );
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    removed: async (profileId: string) => {
      queryClient.removeQueries({ queryKey: getGetEvaluationProfileQueryKey(profileId) });
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    refresh: (profileId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetEvaluationProfileQueryKey(profileId) }),
        queryClient.invalidateQueries({ queryKey: listKey }),
      ]),
    listChanged: () => queryClient.invalidateQueries({ queryKey: listKey }),
  };
}

export function useProfileFactorStore(profile: EvaluationProfile): FactorStore {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useProfileCache();
  const create = useCreateEvaluationProfileFactor({ request: apiRequest });
  const update = useUpdateEvaluationProfileFactor({ request: apiRequest });
  const remove = useRemoveEvaluationProfileFactor({ request: apiRequest });

  return {
    save: async (factorId, data) => {
      const result = factorId
        ? await update.mutateAsync({ profileId: profile.id, factorId, data })
        : await create.mutateAsync({ profileId: profile.id, data });
      await cache.saved(result.profile);
    },
    remove: async (factorId) => {
      const result = await remove.mutateAsync({ profileId: profile.id, factorId });
      await cache.saved(result.profile);
    },
    refresh: () => cache.refresh(profile.id),
    failure: profileFailure,
  };
}
