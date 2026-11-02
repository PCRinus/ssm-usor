import { useRouteContext } from '@tanstack/react-router';

import {
  type EvaluationProfileResponse,
  getGetEvaluationProfileQueryKey,
  getGetEvaluationProfileUsageQueryKey,
  getListEvaluationProfilesQueryKey,
  useCreateEvaluationProfileFactor,
  useRemoveEvaluationProfileFactor,
  useUpdateEvaluationProfile,
  useUpdateEvaluationProfileFactor,
} from '@/api/generated/api';
import type { FactorStore } from '@/features/risk-evaluations/factor-store';
import { toLibraryWorkSystemRequest } from '@/features/risk-evaluations/risk-evaluation-schema';
import { invalidateEvaluations } from '@/features/risk-evaluations/use-evaluation-cache';
import type { WorkSystemStore } from '@/features/risk-evaluations/work-system-store';

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
      queryClient.removeQueries({ queryKey: getGetEvaluationProfileUsageQueryKey(profileId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        invalidateEvaluations(queryClient),
      ]);
    },
    // Evaluations show the name of the profile each factor is in, and lose the link when the
    // profile's factor goes.
    linksChanged: (profileId: string) =>
      Promise.all([
        invalidateEvaluations(queryClient),
        queryClient.invalidateQueries({
          queryKey: getGetEvaluationProfileUsageQueryKey(profileId),
        }),
      ]),
    // An evaluation took copies of its factors: the profile is now in use.
    applied: (profileId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetEvaluationProfileQueryKey(profileId) }),
        queryClient.invalidateQueries({
          queryKey: getGetEvaluationProfileUsageQueryKey(profileId),
        }),
        queryClient.invalidateQueries({ queryKey: listKey }),
      ]),
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
      await Promise.all([cache.saved(result.profile), cache.linksChanged(profile.id)]);
    },
    refresh: () => cache.refresh(profile.id),
    failure: profileFailure,
  };
}

export function useProfileWorkSystemStore(profile: EvaluationProfile): WorkSystemStore {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useProfileCache();
  const update = useUpdateEvaluationProfile({ request: apiRequest });

  return {
    save: async (values) => {
      const result = await update.mutateAsync({
        profileId: profile.id,
        data: toLibraryWorkSystemRequest(values),
      });
      await cache.saved(result.profile);
    },
    failure: profileFailure,
  };
}
