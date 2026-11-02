import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';

import type { RiskEvaluationSummary } from './risk-evaluation-schema';

export function EvaluationLink({
  evaluation,
  ...props
}: Pick<ComponentProps<'a'>, 'className' | 'children'> & {
  evaluation: Pick<RiskEvaluationSummary, 'id' | 'clientId' | 'jobPosition'>;
  'data-testid'?: string;
}) {
  return evaluation.jobPosition ? (
    <Link
      to="/clienti/$clientId/posturi/$jobPositionId/evaluare-riscuri"
      params={{ clientId: evaluation.clientId, jobPositionId: evaluation.jobPosition.id }}
      {...props}
    />
  ) : (
    <Link
      to="/clienti/$clientId/posturi/evaluari-riscuri/$evaluationId"
      params={{ clientId: evaluation.clientId, evaluationId: evaluation.id }}
      {...props}
    />
  );
}
