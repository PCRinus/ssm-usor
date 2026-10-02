import {
  componentShares,
  isOverAcceptableLimit,
  isUnacceptableRiskLevel,
  sheetComponents,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useId } from 'react';

import { SectionCard } from '@/components/section-card';

import {
  cellCountLabel,
  gravityRows,
  matrixCells,
  probabilityColumns,
  sameCell,
} from './factor-list';
import {
  acceptableLimitLabel,
  componentLabels,
  factorCountLabel,
  formatGlobalLevel,
  formatShare,
  type RiskEvaluation,
} from './risk-evaluation-schema';
import type { FactorListView } from './use-factor-list-view';

const componentColors: Record<WorkSystemComponent, string> = {
  means_of_production: 'bg-chart-1',
  work_environment: 'bg-chart-2',
  executant: 'bg-chart-3',
  work_task: 'bg-chart-4',
};

export function RiskResultCard({
  id,
  evaluation,
  view,
}: {
  id: string;
  evaluation: Pick<RiskEvaluation, 'factors' | 'globalRiskLevel'>;
  view: FactorListView;
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
        <div className="@container">
          <div className="grid items-start gap-x-14 gap-y-6 @xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid min-w-0 content-start">
              <h4 className="text-sm font-medium">Nivel de risc global</h4>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  data-testid="risk-global-level"
                  className={cn(
                    'text-3xl leading-tight font-medium tracking-tight tabular-nums',
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
              <p className="mt-1 text-sm text-muted-foreground">
                Limita acceptabilă este {acceptableLimitLabel}.{' '}
                <span data-testid="risk-result-counts">
                  {unacceptableSummary(factors.length, unacceptable.length)}
                </span>
              </p>
              <h4 className="mt-6 text-sm font-medium">Ponderea factorilor pe componente</h4>
              <div
                aria-hidden="true"
                className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
              >
                {sheetComponents
                  .filter((component) => shares[component] > 0)
                  .map((component) => (
                    <span
                      key={component}
                      className={cn('h-full basis-0', componentColors[component])}
                      style={{ flexGrow: shares[component] }}
                    />
                  ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-sm">
                {sheetComponents.map((component) => (
                  <li key={component} className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      aria-hidden="true"
                      className={cn('size-2.5 shrink-0 rounded-[3px]', componentColors[component])}
                    />
                    <span className="text-muted-foreground">{componentLabels[component]}</span>
                    <span data-testid="risk-share" className="font-medium tabular-nums">
                      {formatShare(shares[component])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <RiskMatrix factors={factors} view={view} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function RiskMatrix({
  factors,
  view,
}: {
  factors: RiskEvaluation['factors'];
  view: FactorListView;
}) {
  const headingId = useId();
  return (
    <div className="grid content-start justify-items-start">
      <h4
        id={headingId}
        title="Alege o celulă ca să vezi doar factorii ei."
        className="text-sm font-medium"
      >
        Factorii pe grila metodei
      </h4>
      <div
        role="group"
        aria-labelledby={headingId}
        data-testid="risk-matrix"
        className="mt-2.5 grid grid-cols-[1rem_1rem_repeat(6,1.75rem)] grid-rows-[repeat(7,1.375rem)_1.125rem_1rem] gap-[3px] text-[0.8125rem]"
      >
        <span
          aria-hidden="true"
          className="grid rotate-180 place-items-center text-xs text-muted-foreground [writing-mode:vertical-rl]"
          style={{ gridRow: '1 / 8', gridColumn: 1 }}
        >
          Gravitate
        </span>
        {gravityRows.map((gravityClass, index) => (
          <span
            key={gravityClass}
            aria-hidden="true"
            className="grid place-items-center text-muted-foreground"
            style={{ gridRow: index + 1, gridColumn: 2 }}
          >
            {gravityClass}
          </span>
        ))}
        {matrixCells(factors).map((cell) => {
          const bad = isUnacceptableRiskLevel(cell.level);
          const place = { gridRow: 8 - cell.gravityClass, gridColumn: cell.probabilityClass + 2 };
          if (cell.count === 0) {
            return (
              <span
                key={`${cell.gravityClass}-${cell.probabilityClass}`}
                aria-hidden="true"
                className={cn('rounded-[5px]', bad ? 'bg-destructive-soft/55' : 'bg-muted/50')}
                style={place}
              />
            );
          }
          return (
            <button
              key={`${cell.gravityClass}-${cell.probabilityClass}`}
              type="button"
              data-testid="risk-matrix-cell"
              aria-pressed={sameCell(view.cell, cell)}
              aria-label={`Gravitate ${cell.gravityClass}, probabilitate ${cell.probabilityClass}: ${cellCountLabel(cell.count)}`}
              title={`Nivel de risc ${cell.level}`}
              onClick={() => view.toggleCell(cell)}
              className={cn(
                'grid cursor-pointer place-items-center rounded-[5px] leading-none font-medium tabular-nums outline-offset-1 hover:outline-2 hover:outline-foreground/40 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:outline-2 aria-pressed:outline-foreground',
                bad ? 'bg-destructive-soft text-destructive-foreground' : 'bg-muted text-foreground'
              )}
              style={place}
            >
              {cell.count}
            </button>
          );
        })}
        {probabilityColumns.map((probabilityClass) => (
          <span
            key={probabilityClass}
            aria-hidden="true"
            className="grid place-items-center text-muted-foreground"
            style={{ gridRow: 8, gridColumn: probabilityClass + 2 }}
          >
            {probabilityClass}
          </span>
        ))}
        <span
          aria-hidden="true"
          className="grid place-items-start justify-center text-xs leading-none text-muted-foreground"
          style={{ gridRow: 9, gridColumn: '3 / 9' }}
        >
          Probabilitate
        </span>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-[3px] border border-destructive-border bg-destructive-soft"
        />
        Nivel inacceptabil
      </p>
    </div>
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
