import { useUpdateRiskEvaluation } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import { evaluationFailure } from './evaluation-failure';
import {
  type RiskEvaluation,
  toWorkSystemRequest,
  type WorkSystemFormValues,
} from './risk-evaluation-schema';
import { useEvaluationCache } from './use-evaluation-cache';

// The work-system card serves both a client's evaluation and an entry of the risk library, as
// the factors card does through `FactorStore`.
export interface WorkSystemStore {
  save: (values: WorkSystemFormValues) => Promise<void>;
  failure: (cause: unknown, fallback: string) => string;
}

export function useEvaluationWorkSystemStore(evaluation: RiskEvaluation): WorkSystemStore {
  const { request } = useApi();
  const cache = useEvaluationCache(evaluation.clientId);
  const update = useUpdateRiskEvaluation({ request });

  return {
    save: async (values) => {
      const result = await update.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: toWorkSystemRequest(evaluation.kind, values),
      });
      await cache.saved(result.evaluation);
    },
    failure: evaluationFailure,
  };
}
