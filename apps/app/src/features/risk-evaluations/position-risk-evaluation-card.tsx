import {
  isOverAcceptableLimit,
  isUnacceptableRiskLevel,
  maxAcceptableRiskLevel,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowRight, Plus, ShieldAlert } from 'lucide-react';

import {
  getGetJobPositionRiskEvaluationQueryKey,
  useGetJobPositionRiskEvaluation,
} from '@/api/generated/api';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { Fact, FactList, SectionCard } from '@/components/section-card';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import type { JobPosition } from '@/features/job-positions/job-position-schema';

import {
  acceptableLimitLabel,
  evaluationStateLabel,
  formatGlobalLevel,
} from './risk-evaluation-schema';
import { useStartEvaluation } from './use-start-evaluation';

export function PositionRiskEvaluationCard({
  id,
  clientId,
  position,
  userId,
  readOnly,
}: {
  id: string;
  clientId: string;
  position: JobPosition;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const query = useGetJobPositionRiskEvaluation(clientId, position.id, {
    request: apiRequest,
    query: {
      queryKey: [...getGetJobPositionRiskEvaluationQueryKey(clientId, position.id), userId],
    },
  });
  const { start, pending, failure } = useStartEvaluation(clientId);
  const evaluation = query.data?.evaluation;
  const unacceptable =
    evaluation?.factors.filter((factor) => isUnacceptableRiskLevel(factor.riskLevel)).length ?? 0;
  const summary = evaluation && {
    factorCount: evaluation.factors.length,
    globalRiskLevel: evaluation.globalRiskLevel,
  };
  const evaluated = Boolean(evaluation && evaluation.factors.length > 0);

  const openLink = evaluation && (
    <Button asChild variant="outline" size="sm" data-testid="position-risk-open">
      <Link
        to="/clients/$clientId/job-positions/$jobPositionId/risk-evaluation"
        params={{ clientId, jobPositionId: position.id }}
      >
        Deschide evaluarea
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="position-risk-card"
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Evaluare de risc
          {query.data && (
            <DecisionBadge decision={evaluated || null} data-testid="position-risk-state">
              {evaluationStateLabel(summary ?? null)}
            </DecisionBadge>
          )}
        </span>
      }
      action={openLink}
    >
      {failure && (
        <Notice variant="destructive" data-testid="position-risk-error">
          {failure.message}
        </Notice>
      )}
      {query.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : query.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca evaluarea postului.
        </Notice>
      ) : !evaluation ? (
        <EmptyState
          data-testid="position-risk-empty"
          icon={ShieldAlert}
          actions={
            !readOnly && (
              <Button
                variant="tonal"
                size="sm"
                data-testid="position-risk-start"
                disabled={pending}
                onClick={() => void start({ kind: 'job_position', jobPositionId: position.id })}
              >
                <Plus aria-hidden="true" />
                {pending ? 'Se pornește…' : 'Începe evaluarea'}
              </Button>
            )
          }
        >
          {readOnly
            ? 'Postul nu a fost evaluat. Clientul este arhivat, așa că nu se mai evaluează.'
            : 'Documentația nu se poate genera până nu evaluezi riscurile postului: factorii de risc, clasele lor și măsurile de prevenire.'}
        </EmptyState>
      ) : evaluation.globalRiskLevel === null ? (
        <p data-testid="position-risk-no-factors" className="text-sm text-muted-foreground">
          Evaluarea a început, dar nu are încă factori de risc.
        </p>
      ) : (
        <FactList className="lg:grid-cols-3">
          <Fact label="Nivel de risc global" testId="position-risk-level">
            <span className="tabular-nums">{formatGlobalLevel(evaluation.globalRiskLevel)}</span>
            <span className="font-normal text-muted-foreground">
              {isOverAcceptableLimit(evaluation.globalRiskLevel)
                ? `, peste limita acceptabilă de ${acceptableLimitLabel}`
                : ', acceptabil'}
            </span>
          </Fact>
          <Fact label="Factori de risc" testId="position-risk-factors">
            <span className="tabular-nums">{evaluation.factors.length}</span>
          </Fact>
          <Fact
            label={`Inacceptabili (peste nivelul ${maxAcceptableRiskLevel})`}
            testId="position-risk-unacceptable"
          >
            <span className="tabular-nums">{unacceptable}</span>
          </Fact>
        </FactList>
      )}
    </SectionCard>
  );
}
