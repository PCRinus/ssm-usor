import {
  componentShares,
  isOverAcceptableLimit,
  isUnacceptableRiskLevel,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';

import { SectionCard } from '@/components/section-card';

import {
  acceptableLimitLabel,
  componentLabels,
  factorCountLabel,
  formatGlobalLevel,
  formatShare,
  type RiskEvaluation,
  sheetComponentOrder,
  unacceptableCountLabel,
} from './risk-evaluation-schema';

export function RiskResultCard({ id, evaluation }: { id: string; evaluation: RiskEvaluation }) {
  const { factors, globalRiskLevel } = evaluation;
  const unacceptable = factors.filter((factor) => isUnacceptableRiskLevel(factor.riskLevel));
  const shares = componentShares(factors);
  const over = isOverAcceptableLimit(globalRiskLevel);

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="risk-result-card"
      title="Rezultatul evaluării"
    >
      {globalRiskLevel === null ? (
        <p data-testid="risk-result-empty" className="text-sm text-muted-foreground">
          Nivelul de risc global se calculează din factorii de risc, după ce adaugi primul.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-2">
            <p className="text-sm text-muted-foreground">Nivel de risc global</p>
            <p className="flex flex-wrap items-center gap-3">
              <span
                data-testid="risk-global-level"
                className={cn(
                  'text-3xl font-semibold tabular-nums',
                  over && 'text-destructive-foreground'
                )}
              >
                {formatGlobalLevel(globalRiskLevel)}
              </span>
              <Badge
                data-testid="risk-global-verdict"
                variant="outline"
                className={cn(
                  over
                    ? 'border-destructive-border bg-destructive-soft text-destructive-foreground'
                    : 'border-success-border bg-success text-success-foreground'
                )}
              >
                {over ? 'Peste limita acceptabilă' : 'Acceptabil'}
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              Limita acceptabilă este {acceptableLimitLabel}.{' '}
              <span data-testid="risk-result-counts">
                {factorCountLabel(factors.length)}, {unacceptableCountLabel(unacceptable.length)}.
              </span>
            </p>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-sm text-muted-foreground">Ponderea factorilor pe componente</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {sheetComponentOrder.map((component) => (
                <div key={component} className="grid min-w-0 content-start gap-1">
                  <dt className="text-muted-foreground">{componentLabels[component]}</dt>
                  <dd data-testid="risk-share" className="font-medium tabular-nums">
                    {formatShare(shares[component])}
                  </dd>
                  <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${shares[component]}%` }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
