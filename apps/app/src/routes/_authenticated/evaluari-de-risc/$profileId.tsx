import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetEvaluationProfileQueryKey,
  getGetEvaluationProfileQueryOptions,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { withUserId } from '@/api/use-api';
import {
  EvaluationProfileError,
  EvaluationProfileNotFound,
  EvaluationProfilePage,
} from '@/features/evaluation-profiles/evaluation-profile-page';
import { ProfilePending } from '@/features/evaluation-profiles/profile-pending';
import { factorListSearch } from '@/features/risk-evaluations/use-factor-list-view';

export const Route = createFileRoute('/_authenticated/evaluari-de-risc/$profileId')({
  validateSearch: factorListSearch,
  params: { parse: (params) => ({ profileId: z.uuid().parse(params.profileId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const key = withUserId(auth.getSnapshot().session?.user.id);
    try {
      const { profile } = await queryClient.ensureQueryData(
        getGetEvaluationProfileQueryOptions(params.profileId, {
          request: apiRequest,
          query: { queryKey: key(getGetEvaluationProfileQueryKey(params.profileId)) },
        })
      );
      return { crumb: profile.name };
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: ProfilePage,
  pendingComponent: ProfilePending,
  notFoundComponent: EvaluationProfileNotFound,
  errorComponent: EvaluationProfileError,
});

function ProfilePage() {
  const { profileId } = Route.useParams();
  return <EvaluationProfilePage profileId={profileId} />;
}
