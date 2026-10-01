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
      to="/clients/$clientId/job-positions/$jobPositionId/risk-evaluation"
      params={{ clientId: evaluation.clientId, jobPositionId: evaluation.jobPosition.id }}
      {...props}
    />
  ) : (
    <Link
      to="/clients/$clientId/job-positions/risk-evaluations/$evaluationId"
      params={{ clientId: evaluation.clientId, evaluationId: evaluation.id }}
      {...props}
    />
  );
}
