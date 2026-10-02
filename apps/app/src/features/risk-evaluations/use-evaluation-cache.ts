import { useRouteContext } from '@tanstack/react-router';

import {
  getGetJobPositionRiskEvaluationQueryKey,
  getGetRiskEvaluationQueryKey,
  getListRiskEvaluationsQueryKey,
  type JobPositionRiskEvaluationResponse,
  type RiskEvaluationResponse,
} from '@/api/generated/api';

import type { RiskEvaluation } from './risk-evaluation-schema';

// Every change answers with the whole evaluation, so it is written into both ways of reading
// it; the list's counts and levels move with it.
export function useEvaluationCache(clientId: string) {
  const { queryClient } = useRouteContext({ from: '__root__' });
  const listKey = getListRiskEvaluationsQueryKey(clientId);

  return {
    saved: async (evaluation: RiskEvaluation) => {
      queryClient.setQueriesData<RiskEvaluationResponse>(
        { queryKey: getGetRiskEvaluationQueryKey(clientId, evaluation.id) },
        { evaluation }
      );
      if (evaluation.jobPosition) {
        queryClient.setQueriesData<JobPositionRiskEvaluationResponse>(
          {
            queryKey: getGetJobPositionRiskEvaluationQueryKey(clientId, evaluation.jobPosition.id),
          },
          { evaluation }
        );
      }
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    removed: async (evaluation: RiskEvaluation) => {
      queryClient.removeQueries({
        queryKey: getGetRiskEvaluationQueryKey(clientId, evaluation.id),
      });
      if (evaluation.jobPosition) {
        queryClient.setQueriesData<JobPositionRiskEvaluationResponse>(
          {
            queryKey: getGetJobPositionRiskEvaluationQueryKey(clientId, evaluation.jobPosition.id),
          },
          { evaluation: null }
        );
      }
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    // A failure may mean the evaluation changed or went away meanwhile.
    refresh: (evaluation: RiskEvaluation) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetRiskEvaluationQueryKey(clientId, evaluation.id),
        }),
        evaluation.jobPosition &&
          queryClient.invalidateQueries({
            queryKey: getGetJobPositionRiskEvaluationQueryKey(clientId, evaluation.jobPosition.id),
          }),
        queryClient.invalidateQueries({ queryKey: listKey }),
      ]),
  };
}
