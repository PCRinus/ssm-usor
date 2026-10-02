import { createFileRoute, notFound } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetEvaluationProfileQueryKey,
  getGetEvaluationProfileQueryOptions,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useAuth } from '@/features/auth/auth-context';
import {
  EvaluationProfileError,
  EvaluationProfileNotFound,
  EvaluationProfilePage,
} from '@/features/evaluation-profiles/evaluation-profile-page';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { factorListSearch } from '@/features/risk-evaluations/use-factor-list-view';

export const Route = createFileRoute('/_authenticated/risks/$profileId')({
  validateSearch: factorListSearch,
  params: { parse: (params) => ({ profileId: z.uuid().parse(params.profileId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { profile } = await queryClient.ensureQueryData(
        getGetEvaluationProfileQueryOptions(params.profileId, {
          request: apiRequest,
          query: { queryKey: [...getGetEvaluationProfileQueryKey(params.profileId), userId] },
        })
      );
      return { crumb: profile.name };
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: ProfilePage,
  pendingComponent: RiskEvaluationPending,
  notFoundComponent: EvaluationProfileNotFound,
  errorComponent: EvaluationProfileError,
});

function ProfilePage() {
  const { profileId } = Route.useParams();
  const { session } = useAuth();
  return <EvaluationProfilePage profileId={profileId} userId={session?.user.id ?? ''} />;
}
