import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getGetRiskEvaluationQueryKey,
  getGetRiskEvaluationQueryOptions,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { keepOpener } from '@/app/opener';
import {
  ClientRiskEvaluationPage,
  RiskEvaluationError,
  RiskEvaluationNotFound,
} from '@/features/risk-evaluations/risk-evaluation-page';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { evaluationTitle } from '@/features/risk-evaluations/risk-evaluation-schema';
import { factorListSearch } from '@/features/risk-evaluations/use-factor-list-view';

// The client-level evaluations keep their address under the positions section, where their card
// is, though they open on a page of their own.
export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/posturi/fise-de-evaluare/$evaluationId'
)({
  staticData: { fullPage: true },
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
        to: '/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare',
        params: { clientId: params.clientId, jobPositionId: evaluation.jobPosition.id },
        replace: true,
        state: keepOpener,
      });
    }
    return { crumb: evaluationTitle(evaluation) };
  },
  component: ClientRiskEvaluationPage,
  pendingComponent: RiskEvaluationPending,
  notFoundComponent: RiskEvaluationNotFound,
  errorComponent: RiskEvaluationError,
});
