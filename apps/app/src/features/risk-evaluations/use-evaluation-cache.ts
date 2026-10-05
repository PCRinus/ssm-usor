import type { Query, QueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';

import {
  getGetJobPositionRiskEvaluationQueryKey,
  getGetRiskEvaluationQueryKey,
  getListRiskEvaluationsQueryKey,
  type JobPositionRiskEvaluationResponse,
  type RiskEvaluationResponse,
} from '@/api/generated/api';

import type { RiskEvaluation } from './risk-evaluation-schema';

// The generated keys are whole paths, so no shared prefix reaches every profile's usage or
// every client's evaluation.
const pathMatches =
  (pattern: RegExp) =>
  ({ queryKey }: Query) =>
    typeof queryKey[0] === 'string' && pattern.test(queryKey[0]);

const profileUsagePath = /^\/evaluation-profiles\/[^/]+\/usage$/;
const evaluationPath =
  /^\/clients\/[^/]+\/(risk-evaluations\/[^/]+|job-positions\/[^/]+\/risk-evaluation)$/;

export const invalidateProfileUsage = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ predicate: pathMatches(profileUsagePath) });

export const invalidateEvaluations = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ predicate: pathMatches(evaluationPath) });

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        invalidateProfileUsage(queryClient),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        invalidateProfileUsage(queryClient),
      ]);
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
        invalidateProfileUsage(queryClient),
      ]),
  };
}
