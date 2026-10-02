import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  type CreateRiskEvaluationRequest,
  getGetJobPositionRiskEvaluationQueryKey,
  getListRiskEvaluationsQueryKey,
  useCreateRiskEvaluation,
} from '@/api/generated/api';

import { evaluationFailure, failureReason } from './evaluation-failure';
import { useEvaluationCache } from './use-evaluation-cache';

export function useStartEvaluation(clientId: string) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const cache = useEvaluationCache(clientId);
  const create = useCreateRiskEvaluation({ request: apiRequest });
  const [failure, setFailure] = useState<{ message: string; nameTaken: boolean } | null>(null);

  async function start(data: CreateRiskEvaluationRequest) {
    setFailure(null);
    try {
      const { evaluation } = await create.mutateAsync({ clientId, data });
      await cache.saved(evaluation);
      if (evaluation.jobPosition) {
        await navigate({
          to: '/clients/$clientId/job-positions/$jobPositionId/risk-evaluation',
          params: { clientId, jobPositionId: evaluation.jobPosition.id },
        });
      } else {
        await navigate({
          to: '/clients/$clientId/job-positions/risk-evaluations/$evaluationId',
          params: { clientId, evaluationId: evaluation.id },
        });
      }
    } catch (cause) {
      // Someone else started it meanwhile: what is on screen is out of date.
      if (failureReason(cause) === 'risk_evaluation_exists') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListRiskEvaluationsQueryKey(clientId) }),
          data.kind === 'job_position' &&
            queryClient.invalidateQueries({
              queryKey: getGetJobPositionRiskEvaluationQueryKey(clientId, data.jobPositionId),
            }),
        ]);
      }
      setFailure({
        message: evaluationFailure(
          cause,
          'Nu am putut începe evaluarea. Verifică conexiunea și încearcă din nou.'
        ),
        nameTaken: failureReason(cause) === 'risk_evaluation_name_taken',
      });
    }
  }

  return { start, pending: create.isPending, failure };
}
