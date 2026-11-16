import { isOverAcceptableLimit } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import {
  factorCountLabel,
  formatGlobalLevel,
  unacceptableCountLabel,
} from '@/features/risk-evaluations/risk-evaluation-schema';

import type { EvaluationProfileSummary } from './profile-schema';

const attention = 'font-medium text-destructive-foreground';

export function GlobalLevelCell({ profile }: { profile: EvaluationProfileSummary }) {
  const { globalRiskLevel: level, factorCount, unacceptableFactorCount: unacceptable } = profile;
  if (level === null) {
    return (
      <span data-testid="risk-profile-level">
        <CellEmpty />
        <CellNote>{factorCountLabel(0)}</CellNote>
      </span>
    );
  }
  const over = isOverAcceptableLimit(level);
  return (
    <span data-testid="risk-profile-level" className="tabular-nums">
      <span className={cn(over && attention)}>
        {formatGlobalLevel(level)}
        {over && <span className="sr-only">, peste limita acceptabilă</span>}
      </span>
      <CellNote data-testid="risk-profile-factors">
        {factorCountLabel(factorCount)},{' '}
        <span className={cn(unacceptable > 0 && attention)}>
          {unacceptableCountLabel(unacceptable)}
        </span>
      </CellNote>
    </span>
  );
}
