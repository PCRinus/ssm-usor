import { useRouteContext } from '@tanstack/react-router';

import {
  type RiskFactorRequest,
  useCreateRiskFactor,
  useRemoveRiskFactor,
  useUpdateRiskFactor,
} from '@/api/generated/api';

import { evaluationFailure } from './evaluation-failure';
import type { RiskEvaluation } from './risk-evaluation-schema';
import { useEvaluationCache } from './use-evaluation-cache';

// The factors card and the factor dialog serve both a client's evaluation and a profile of the
// risk library; the owner of the factors says how they are saved and how failures read.
export interface FactorStore {
  /** Without a factor id, adds a factor after the others. */
  save: (factorId: string | null, data: RiskFactorRequest) => Promise<void>;
  remove: (factorId: string) => Promise<void>;
  // A failure may mean the owner changed or went away meanwhile.
  refresh: () => Promise<unknown>;
  failure: (cause: unknown, fallback: string) => string;
}

export function useEvaluationFactorStore(evaluation: RiskEvaluation): FactorStore {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useEvaluationCache(evaluation.clientId);
  const create = useCreateRiskFactor({ request: apiRequest });
  const update = useUpdateRiskFactor({ request: apiRequest });
  const remove = useRemoveRiskFactor({ request: apiRequest });
  const ids = { clientId: evaluation.clientId, evaluationId: evaluation.id };

  return {
    save: async (factorId, data) => {
      const result = factorId
        ? await update.mutateAsync({ ...ids, factorId, data })
        : await create.mutateAsync({ ...ids, data });
      await cache.saved(result.evaluation);
    },
    remove: async (factorId) => {
      const result = await remove.mutateAsync({ ...ids, factorId });
      await cache.saved(result.evaluation);
    },
    refresh: () => cache.refresh(evaluation),
    failure: evaluationFailure,
  };
}
