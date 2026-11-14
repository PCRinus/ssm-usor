import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';

import { keepOpener, openedHere } from '@/app/opener';

import type { RiskEvaluationSummary } from './risk-evaluation-schema';

// From the client's own page the sheet is part of the client, so the client's opener goes on.
export function EvaluationLink({
  evaluation,
  withinClient = false,
  ...props
}: Pick<ComponentProps<'a'>, 'className' | 'children'> & {
  evaluation: Pick<RiskEvaluationSummary, 'id' | 'clientId' | 'jobPosition'>;
  withinClient?: boolean;
  'data-testid'?: string;
}) {
  const state = withinClient ? keepOpener : openedHere;
  return evaluation.jobPosition ? (
    <Link
      to="/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare"
      state={state}
      params={{ clientId: evaluation.clientId, jobPositionId: evaluation.jobPosition.id }}
      {...props}
    />
  ) : (
    <Link
      to="/clienti/$clientId/posturi/fise-de-evaluare/$evaluationId"
      state={state}
      params={{ clientId: evaluation.clientId, evaluationId: evaluation.id }}
      {...props}
    />
  );
}
