import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  type CreateRiskEvaluationRequest,
  getGetJobPositionRiskEvaluationQueryKey,
  getListRiskEvaluationsQueryKey,
  useCreateRiskEvaluation,
} from '@/api/generated/api';
import { keepOpener, openedHere } from '@/app/opener';

import { evaluationFailure, failureReason } from './evaluation-failure';
import { useEvaluationCache } from './use-evaluation-cache';

// Started on the empty sheet, the evaluation opens at the address already shown: a new history
// entry would leave the sheet's arrow going back to the same sheet.
export function useStartEvaluation(clientId: string, { onSheet = false } = {}) {
  const opening = onSheet ? { replace: true, state: keepOpener } : { state: openedHere };
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
          to: '/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare',
          ...opening,
          params: { clientId, jobPositionId: evaluation.jobPosition.id },
        });
      } else {
        await navigate({
          to: '/clienti/$clientId/posturi/fise-de-evaluare/$evaluationId',
          ...opening,
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
