import { createFileRoute } from '@tanstack/react-router';

import {
  getGetJobPositionRiskEvaluationQueryKey,
  getGetJobPositionRiskEvaluationQueryOptions,
} from '@/api/generated/api';
import {
  PositionRiskEvaluationPage,
  RiskEvaluationError,
} from '@/features/risk-evaluations/risk-evaluation-page';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';
import { factorListSearch } from '@/features/risk-evaluations/use-factor-list-view';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare'
)({
  validateSearch: factorListSearch,
  staticData: { title: 'Evaluare de risc' },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    await queryClient.ensureQueryData(
      getGetJobPositionRiskEvaluationQueryOptions(params.clientId, params.jobPositionId, {
        request: apiRequest,
        query: {
          queryKey: [
            ...getGetJobPositionRiskEvaluationQueryKey(params.clientId, params.jobPositionId),
            userId,
          ],
        },
      })
    );
  },
  component: PositionRiskEvaluationPage,
  pendingComponent: RiskEvaluationPending,
  errorComponent: RiskEvaluationError,
});
