import {
  componentShares,
  isOverAcceptableLimit,
  isUnacceptableRiskLevel,
  sheetComponents,
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
} from './risk-evaluation-schema';

export function RiskResultCard({
  id,
  evaluation,
}: {
  id: string;
  evaluation: Pick<RiskEvaluation, 'factors' | 'globalRiskLevel'>;
}) {
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
          Nivelul de risc global apare după primul factor de risc.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="grid content-start gap-2">
            <h4 className="text-sm font-medium text-foreground">Nivel de risc global</h4>
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
            <div className="text-sm text-muted-foreground">
              <p>Limita acceptabilă este {acceptableLimitLabel}.</p>
              <p data-testid="risk-result-counts">
                {unacceptableSummary(factors.length, unacceptable.length)}
              </p>
            </div>
          </div>
          <div className="grid content-start gap-2">
            <h4 className="text-sm font-medium text-foreground">
              Ponderea factorilor pe componente
            </h4>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {sheetComponents.map((component) => (
                <div key={component} className="grid min-w-0 content-start gap-1">
                  <dt className="text-muted-foreground">{componentLabels[component]}</dt>
                  <dd data-testid="risk-share" className="font-semibold tabular-nums">
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

function unacceptableSummary(count: number, unacceptable: number) {
  if (count === 1) {
    return unacceptable === 1
      ? 'Singurul factor este inacceptabil.'
      : 'Singurul factor este acceptabil.';
  }
  const total = factorCountLabel(count).toLowerCase();
  const all = count === 2 ? 'Ambii factori' : `Toți cei ${total}`;
  if (unacceptable === 0) return `${all} sunt acceptabili.`;
  if (unacceptable === count) return `${all} sunt inacceptabili.`;
  if (unacceptable === 1) return `Unul din ${total} este inacceptabil.`;
  return `${unacceptable} din ${total} sunt inacceptabili.`;
}
