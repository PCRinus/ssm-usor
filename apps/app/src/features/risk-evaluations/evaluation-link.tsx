import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';

import { openedHere } from '@/app/opener';

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
      to="/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare"
      state={openedHere}
      params={{ clientId: evaluation.clientId, jobPositionId: evaluation.jobPosition.id }}
      {...props}
    />
  ) : (
    <Link
      to="/clienti/$clientId/posturi/fise-de-evaluare/$evaluationId"
      state={openedHere}
      params={{ clientId: evaluation.clientId, evaluationId: evaluation.id }}
      {...props}
    />
  );
}
