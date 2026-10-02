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

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/job-positions/$jobPositionId/risk-evaluation'
)({
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
