import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetRiskEvaluationQueryKey,
  getGetRiskEvaluationQueryOptions,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import {
  ClientRiskEvaluationPage,
  RiskEvaluationError,
  RiskEvaluationNotFound,
} from '@/features/risk-evaluations/risk-evaluation-page';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { evaluationTitle } from '@/features/risk-evaluations/risk-evaluation-schema';
import { factorListSearch } from '@/features/risk-evaluations/use-factor-list-view';

// The client-level evaluations live under the positions section, where their card is, so that
// section stays the current tab.
export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/job-positions/risk-evaluations/$evaluationId'
)({
  validateSearch: factorListSearch,
  params: { parse: (params) => ({ evaluationId: z.uuid().parse(params.evaluationId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    let evaluation;
    try {
      ({ evaluation } = await queryClient.ensureQueryData(
        getGetRiskEvaluationQueryOptions(params.clientId, params.evaluationId, {
          request: apiRequest,
          query: {
            queryKey: [
              ...getGetRiskEvaluationQueryKey(params.clientId, params.evaluationId),
              userId,
            ],
          },
        })
      ));
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
    if (evaluation.jobPosition) {
      throw redirect({
        to: '/clients/$clientId/job-positions/$jobPositionId/risk-evaluation',
        params: { clientId: params.clientId, jobPositionId: evaluation.jobPosition.id },
        replace: true,
      });
    }
    return { crumb: evaluationTitle(evaluation) };
  },
  component: ClientRiskEvaluationPage,
  pendingComponent: RiskEvaluationPending,
  notFoundComponent: RiskEvaluationNotFound,
  errorComponent: RiskEvaluationError,
});
